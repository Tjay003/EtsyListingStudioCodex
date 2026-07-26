import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import path from "node:path";
import type {
  CopywritingBatchV1,
  CopywritingJobV1,
  CopywritingResultDraftV1,
  CopywritingResultV1,
  JobStatus,
  ProductReviewStateV1,
  ProductSnapshotV1,
} from "./contracts";
import {
  STUDIO_SCHEMA_VERSION,
  validateCopywritingDraft,
} from "./contracts";
import { readJson, writeJsonAtomic } from "./fs-utils";
import {
  ensureWorkspaceStructure,
  getProduct,
  getProductDirectory,
  readProductResult,
  scanWorkspace,
} from "./product-store";

const JOB_STATUSES: JobStatus[] = [
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
];

function now() {
  return new Date().toISOString();
}

function jobDirectory(root: string, status: JobStatus) {
  return path.join(root, ".etsy-listing-studio", "jobs", status);
}

function jobPath(root: string, status: JobStatus, jobId: string) {
  return path.join(jobDirectory(root, status), `${jobId}.json`);
}

async function readJobsInStatus(root: string, status: JobStatus) {
  const directory = jobDirectory(root, status);
  await mkdir(directory, { recursive: true });
  const jobs: CopywritingJobV1[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      jobs.push(await readJson<CopywritingJobV1>(path.join(directory, entry.name)));
    } catch {
      // Invalid job files remain on disk for manual recovery.
    }
  }
  return jobs;
}

export async function listJobs(root: string) {
  await ensureWorkspaceStructure(root);
  const jobs = (
    await Promise.all(JOB_STATUSES.map((status) => readJobsInStatus(root, status)))
  ).flat();
  return jobs.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function findJob(root: string, jobId: string) {
  for (const status of JOB_STATUSES) {
    try {
      return {
        status,
        path: jobPath(root, status, jobId),
        job: await readJson<CopywritingJobV1>(jobPath(root, status, jobId)),
      };
    } catch {
      // Continue until the job is found in one lifecycle directory.
    }
  }
  throw new Error("Job not found.");
}

function newCreateJob(
  product: ProductSnapshotV1,
  batchId: string,
  instruction: string,
): CopywritingJobV1 {
  const timestamp = now();
  return {
    schema_version: STUDIO_SCHEMA_VERSION,
    job_id: `job-${randomUUID()}`,
    batch_id: batchId,
    created_at: timestamp,
    updated_at: timestamp,
    status: "queued",
    attempt: 1,
    task: {
      kind: "copywriting.create",
      instruction: instruction.trim(),
    },
    product: {
      instance_id: product.instanceId,
      source_key: product.sourceKey,
      relative_folder: product.relativeFolder,
      metadata_hash: product.metadataHash,
      reference_image: product.referenceImage,
    },
    progress: {
      stage: "queued",
      percent: 0,
      message: "Waiting for Codex processing.",
      updated_at: timestamp,
    },
    cancel_requested_at: null,
    started_at: null,
    finished_at: null,
    result_id: null,
    error: null,
  };
}

export async function queueCopywritingBatch(
  root: string,
  instanceIds: string[],
  instruction = "",
) {
  if (instanceIds.length === 0) {
    throw new Error("Select at least one product.");
  }
  const all = await scanWorkspace(root);
  const products = instanceIds.map((id) => {
    const product = all.find((item) => item.instanceId === id);
    if (!product) throw new Error(`Product ${id} is unavailable.`);
    if (product.rejected) throw new Error(`${product.title} is rejected.`);
    if (product.metadataError) {
      throw new Error(`${product.title} has invalid metadata.`);
    }
    return product;
  });

  const selectedSourceKeys = new Set<string>();
  for (const product of products) {
    if (!product.sourceKey) continue;
    if (selectedSourceKeys.has(product.sourceKey)) {
      throw new Error(
        "Choose only one snapshot from each duplicate product group.",
      );
    }
    selectedSourceKeys.add(product.sourceKey);
  }

  await ensureWorkspaceStructure(root);
  const batchId = `batch-${randomUUID()}`;
  const jobs = products.map((product) =>
    newCreateJob(product, batchId, instruction),
  );
  for (const job of jobs) {
    await writeJsonAtomic(jobPath(root, "queued", job.job_id), job);
  }
  const batch: CopywritingBatchV1 = {
    schema_version: STUDIO_SCHEMA_VERSION,
    batch_id: batchId,
    created_at: now(),
    job_ids: jobs.map((job) => job.job_id),
  };
  await writeJsonAtomic(
    path.join(root, ".etsy-listing-studio", "batches", `${batchId}.json`),
    batch,
  );
  return { batch, jobs };
}

export async function queueCopywritingTweak(
  root: string,
  instanceId: string,
  parentResultId: string,
  fields: Array<"title" | "description" | "tags" | "category">,
  instruction: string,
) {
  const allowed = new Set(["title", "description", "tags", "category"]);
  const normalized = [...new Set(fields)].filter((field) => allowed.has(field));
  if (normalized.length === 0) {
    throw new Error("Select at least one listing field to tweak.");
  }
  if (!instruction.trim()) {
    throw new Error("Describe the requested copywriting change.");
  }
  const product = await getProduct(root, instanceId);
  const parent = await readProductResult(root, instanceId, parentResultId);
  if (!parent) throw new Error("The parent result could not be found.");

  const batchId = `batch-${randomUUID()}`;
  const job = newCreateJob(product, batchId, instruction);
  job.task = {
    kind: "copywriting.tweak",
    instruction: instruction.trim(),
    parent_result_id: parentResultId,
    fields: normalized,
    reuse_evidence: true,
  };
  await writeJsonAtomic(jobPath(root, "queued", job.job_id), job);
  const batch: CopywritingBatchV1 = {
    schema_version: STUDIO_SCHEMA_VERSION,
    batch_id: batchId,
    created_at: now(),
    job_ids: [job.job_id],
  };
  await writeJsonAtomic(
    path.join(root, ".etsy-listing-studio", "batches", `${batchId}.json`),
    batch,
  );
  return { batch, jobs: [job] };
}

async function transitionJob(
  root: string,
  job: CopywritingJobV1,
  from: JobStatus,
  to: JobStatus,
) {
  const source = jobPath(root, from, job.job_id);
  const destination = jobPath(root, to, job.job_id);
  await writeJsonAtomic(source, { ...job, status: to, updated_at: now() });
  await rename(source, destination);
  return readJson<CopywritingJobV1>(destination);
}

export async function cancelJob(root: string, jobId: string) {
  const found = await findJob(root, jobId);
  if (found.status === "queued") {
    const timestamp = now();
    return transitionJob(
      root,
      {
        ...found.job,
        cancel_requested_at: timestamp,
        finished_at: timestamp,
        progress: {
          stage: "cancelled",
          percent: found.job.progress.percent,
          message: "Cancelled before processing started.",
          updated_at: timestamp,
        },
      },
      "queued",
      "cancelled",
    );
  }
  if (found.status !== "processing") {
    throw new Error("Only queued or processing jobs can be cancelled.");
  }
  const timestamp = now();
  const next: CopywritingJobV1 = {
    ...found.job,
    cancel_requested_at: timestamp,
    updated_at: timestamp,
    progress: {
      ...found.job.progress,
      stage: "cancelling",
      message: "Cancellation requested. Codex will stop at the next safe point.",
      updated_at: timestamp,
    },
  };
  await writeJsonAtomic(found.path, next);
  return next;
}

export async function retryJob(root: string, jobId: string) {
  const found = await findJob(root, jobId);
  if (found.status !== "failed" && found.status !== "cancelled") {
    throw new Error("Only failed or cancelled jobs can be retried.");
  }
  const product = await getProduct(root, found.job.product.instance_id);
  const timestamp = now();
  const next: CopywritingJobV1 = {
    ...found.job,
    status: "queued",
    attempt: found.job.attempt + 1,
    updated_at: timestamp,
    product: {
      ...found.job.product,
      relative_folder: product.relativeFolder,
      metadata_hash: product.metadataHash,
      reference_image: product.referenceImage,
    },
    progress: {
      stage: "queued",
      percent: 0,
      message: "Retry queued for Codex.",
      updated_at: timestamp,
    },
    cancel_requested_at: null,
    started_at: null,
    finished_at: null,
    result_id: null,
    error: null,
  };
  await writeJsonAtomic(found.path, next);
  await rename(found.path, jobPath(root, "queued", jobId));
  return next;
}

async function markStaleJobFailed(
  root: string,
  job: CopywritingJobV1,
  message: string,
) {
  const timestamp = now();
  return transitionJob(
    root,
    {
      ...job,
      error: message,
      finished_at: timestamp,
      progress: {
        stage: "failed",
        percent: 0,
        message,
        updated_at: timestamp,
      },
    },
    "queued",
    "failed",
  );
}

export async function claimNextJob(root: string) {
  const queued = (await readJobsInStatus(root, "queued")).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  for (const job of queued) {
    const product = await getProduct(root, job.product.instance_id).catch(
      () => null,
    );
    if (!product) {
      await markStaleJobFailed(root, job, "The product folder is unavailable.");
      continue;
    }
    if (product.metadataHash !== job.product.metadata_hash) {
      await markStaleJobFailed(
        root,
        job,
        "metadata.json changed after this job was queued. Review and queue it again.",
      );
      continue;
    }

    const timestamp = now();
    return transitionJob(
      root,
      {
        ...job,
        started_at: timestamp,
        progress: {
          stage: "reading_metadata",
          percent: 5,
          message: "Claimed by Codex. Reading source metadata.",
          updated_at: timestamp,
        },
      },
      "queued",
      "processing",
    );
  }
  return null;
}

export async function updateJobProgress(
  root: string,
  jobId: string,
  stage: string,
  percent: number,
  message: string,
) {
  const found = await findJob(root, jobId);
  if (found.status !== "processing") {
    throw new Error("Only processing jobs can report progress.");
  }
  const timestamp = now();
  const next: CopywritingJobV1 = {
    ...found.job,
    updated_at: timestamp,
    progress: {
      stage,
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      message,
      updated_at: timestamp,
    },
  };
  await writeJsonAtomic(found.path, next);
  return next;
}

export async function isCancellationRequested(root: string, jobId: string) {
  const found = await findJob(root, jobId);
  return Boolean(found.job.cancel_requested_at);
}

export async function markJobCancelled(root: string, jobId: string) {
  const found = await findJob(root, jobId);
  if (found.status !== "processing") {
    throw new Error("Only a processing job can finish as cancelled.");
  }
  const timestamp = now();
  return transitionJob(
    root,
    {
      ...found.job,
      finished_at: timestamp,
      progress: {
        stage: "cancelled",
        percent: found.job.progress.percent,
        message: "Processing stopped safely. Existing results were preserved.",
        updated_at: timestamp,
      },
    },
    "processing",
    "cancelled",
  );
}

export async function failJob(root: string, jobId: string, error: string) {
  const found = await findJob(root, jobId);
  if (found.status !== "processing") {
    throw new Error("Only a processing job can fail.");
  }
  const timestamp = now();
  return transitionJob(
    root,
    {
      ...found.job,
      error: error.trim() || "Copywriting processing failed.",
      finished_at: timestamp,
      progress: {
        stage: "failed",
        percent: found.job.progress.percent,
        message: error.trim() || "Copywriting processing failed.",
        updated_at: timestamp,
      },
    },
    "processing",
    "failed",
  );
}

function listingText(result: CopywritingResultV1) {
  const warningLines = result.warnings.map(
    (warning) => `- ${warning.message}`,
  );
  return [
    "TITLE:",
    result.listing.title,
    "",
    "CATEGORY:",
    result.listing.category,
    "",
    "PRICE:",
    "Manual",
    "",
    "TAGS:",
    result.listing.tags.join(", "),
    "",
    "DESCRIPTION:",
    result.listing.description,
    ...(warningLines.length
      ? ["", "REVIEW WARNINGS:", ...warningLines]
      : []),
    "",
  ].join("\n");
}

export async function completeJob(
  root: string,
  jobId: string,
  draft: CopywritingResultDraftV1,
) {
  const found = await findJob(root, jobId);
  if (found.status !== "processing") {
    throw new Error("Only a processing job can be completed.");
  }
  if (found.job.cancel_requested_at) {
    throw new Error("Cancellation was requested; mark the job cancelled.");
  }

  let effectiveDraft = draft;
  if (found.job.task.kind === "copywriting.tweak") {
    const parent = await readProductResult(
      root,
      found.job.product.instance_id,
      found.job.task.parent_result_id,
    );
    if (!parent) {
      throw new Error("The parent result for this tweak is unavailable.");
    }
    const selected = new Set(found.job.task.fields);
    const proposed = (draft as Partial<CopywritingResultDraftV1>)?.listing;
    effectiveDraft = {
      listing: {
        title: selected.has("title")
          ? String(proposed?.title ?? "")
          : parent.result.listing.title,
        description: selected.has("description")
          ? String(proposed?.description ?? "")
          : parent.result.listing.description,
        tags: selected.has("tags")
          ? Array.isArray(proposed?.tags)
            ? proposed.tags
            : []
          : parent.result.listing.tags,
        category: selected.has("category")
          ? String(proposed?.category ?? "")
          : parent.result.listing.category,
        price: null,
      },
      evidence: parent.result.evidence,
      inspected_images: parent.result.inspected_images,
      conflicts: parent.result.conflicts,
      omitted_fields: parent.result.omitted_fields,
      warnings: parent.result.warnings,
      notes: draft?.notes ?? parent.result.notes,
    };
  }

  const validationIssues = validateCopywritingDraft(effectiveDraft);
  const blockingWarnings = Array.isArray(effectiveDraft.warnings)
    ? effectiveDraft.warnings.filter(
        (warning) => warning.severity === "blocking",
      )
    : [];
  if (
    validationIssues.some((issue) => issue.severity === "blocking") ||
    blockingWarnings.length > 0
  ) {
    const message = [
      ...validationIssues
        .filter((issue) => issue.severity === "blocking")
        .map((issue) => issue.message),
      ...blockingWarnings.map((warning) => warning.message),
    ].join(" ");
    throw new Error(`Result validation failed: ${message}`);
  }

  const { product, directory } = await getProductDirectory(
    root,
    found.job.product.instance_id,
  );
  if (product.metadataHash !== found.job.product.metadata_hash) {
    throw new Error(
      "metadata.json changed during processing. Preserve the draft and queue a fresh job.",
    );
  }

  const version = (product.results[0]?.version ?? 0) + 1;
  const resultId = `result-${randomUUID()}`;
  const parentResultId =
    found.job.task.kind === "copywriting.tweak"
      ? found.job.task.parent_result_id
      : null;
  const changedFields =
    found.job.task.kind === "copywriting.tweak"
      ? found.job.task.fields
      : (["title", "description", "tags", "category"] as const);
  const result: CopywritingResultV1 = {
    ...effectiveDraft,
    schema_version: STUDIO_SCHEMA_VERSION,
    result_id: resultId,
    job_id: jobId,
    product_instance_id: product.instanceId,
    source_key: product.sourceKey,
    metadata_hash: product.metadataHash,
    version,
    created_at: now(),
    parent_result_id: parentResultId,
    changed_fields: [...changedFields],
    validation_issues: validationIssues,
    listing: {
      title: String(effectiveDraft.listing.title).trim(),
      description: String(effectiveDraft.listing.description).trim(),
      tags: effectiveDraft.listing.tags
        .map((tag) => String(tag).trim())
        .filter(Boolean),
      category: String(effectiveDraft.listing.category).trim(),
      price: null,
    },
    evidence: Array.isArray(effectiveDraft.evidence)
      ? effectiveDraft.evidence
      : [],
    inspected_images: Array.isArray(effectiveDraft.inspected_images)
      ? effectiveDraft.inspected_images
      : [],
    conflicts: Array.isArray(effectiveDraft.conflicts)
      ? effectiveDraft.conflicts
      : [],
    omitted_fields: Array.isArray(effectiveDraft.omitted_fields)
      ? effectiveDraft.omitted_fields
      : [],
    warnings: Array.isArray(effectiveDraft.warnings)
      ? effectiveDraft.warnings
      : [],
  };
  const review: ProductReviewStateV1 = {
    schema_version: STUDIO_SCHEMA_VERSION,
    result_id: resultId,
    status: "needs_review",
    note: "",
    updated_at: now(),
  };

  const outputRoot = path.join(directory, "studio_outputs", "copywriting");
  const versionName = `v${String(version).padStart(4, "0")}`;
  const temporary = path.join(outputRoot, `.staging-${randomUUID()}`);
  const destination = path.join(outputRoot, versionName);
  await mkdir(temporary, { recursive: true });
  await writeJsonAtomic(path.join(temporary, "listing.json"), result);
  await writeJsonAtomic(path.join(temporary, "review.json"), review);
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(path.join(temporary, "listing.txt"), listingText(result), "utf8"),
  );
  await rename(temporary, destination);

  const timestamp = now();
  const completed = await transitionJob(
    root,
    {
      ...found.job,
      result_id: resultId,
      finished_at: timestamp,
      progress: {
        stage: "completed",
        percent: 100,
        message: "Copywriting result saved for review.",
        updated_at: timestamp,
      },
    },
    "processing",
    "completed",
  );
  return { job: completed, result, review };
}

export async function setResultReview(
  root: string,
  instanceId: string,
  resultId: string,
  status: "approved" | "rejected" | "needs_review",
  note = "",
) {
  const { directory } = await getProductDirectory(root, instanceId);
  const loaded = await readProductResult(root, instanceId, resultId);
  if (!loaded) throw new Error("Result not found.");
  const versionFolder = `v${String(loaded.result.version).padStart(4, "0")}`;
  const review: ProductReviewStateV1 = {
    schema_version: STUDIO_SCHEMA_VERSION,
    result_id: resultId,
    status,
    note: note.trim(),
    updated_at: now(),
  };
  await writeJsonAtomic(
    path.join(
      directory,
      "studio_outputs",
      "copywriting",
      versionFolder,
      "review.json",
    ),
    review,
  );
  return review;
}

export async function readJobSourceContext(root: string, jobId: string) {
  const found = await findJob(root, jobId);
  const { product, directory } = await getProductDirectory(
    root,
    found.job.product.instance_id,
  );
  const metadataPath = path.join(directory, "metadata.json");
  const parent =
    found.job.task.kind === "copywriting.tweak"
      ? await readProductResult(
          root,
          product.instanceId,
          found.job.task.parent_result_id,
        )
      : null;
  return {
    job: found.job,
    product,
    productDirectory: directory,
    metadataPath,
    metadata: JSON.parse(await readFile(metadataPath, "utf8")),
    parent,
  };
}
