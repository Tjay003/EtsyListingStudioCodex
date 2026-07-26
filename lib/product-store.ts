import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
} from "node:fs/promises";
import path from "node:path";
import type {
  CopywritingResultV1,
  ImageRole,
  ProductImageV1,
  ProductResultSummaryV1,
  ProductSnapshotV1,
  ProductStudioStateV1,
} from "./contracts";
import { STUDIO_SCHEMA_VERSION } from "./contracts";
import {
  normalizeRelativePath,
  readJson,
  resolveExistingInside,
  resolvePlannedInside,
  safeFileSegment,
  writeJsonAtomic,
} from "./fs-utils";

const IMAGE_PATTERN = /\.(?:jpe?g|png|webp|avif|gif)$/i;
const IGNORED_DIRECTORIES = new Set([
  ".etsy-listing-studio",
  "studio_outputs",
  "node_modules",
  ".git",
]);

type SupplierVariation = {
  local_path?: unknown;
  url?: unknown;
  alt?: unknown;
  title?: unknown;
  detected_specs?: unknown;
};

type SupplierMetadata = {
  title?: unknown;
  price?: unknown;
  specs?: unknown;
  description_text?: unknown;
  source_url?: unknown;
  source_product_id?: unknown;
  source_domain?: unknown;
  main_images?: unknown;
  variation_images?: unknown;
  description_images?: unknown;
  status?: unknown;
  etsy_listing?: unknown;
  product_facts?: unknown;
};

export interface TrashEntryV1 {
  instanceId: string;
  title: string;
  originalRelativeFolder: string;
  trashedAt: string;
  trashFolder: string;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean)
    : [];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectProductDirectories(root: string) {
  const products: string[] = [];

  async function visit(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === "metadata.json")) {
      products.push(directory);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name)) continue;
      await visit(path.join(directory, entry.name));
    }
  }

  await visit(root);
  return products;
}

async function collectImages(directory: string) {
  const files: string[] = [];
  if (!(await exists(directory))) return files;

  async function visit(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      if (entry.isFile() && IMAGE_PATTERN.test(entry.name)) files.push(target);
    }
  }

  await visit(directory);
  return files;
}

function defaultState(now = new Date()): ProductStudioStateV1 {
  const timestamp = now.toISOString();
  return {
    schema_version: STUDIO_SCHEMA_VERSION,
    instance_id: randomUUID(),
    created_at: timestamp,
    updated_at: timestamp,
    selected: true,
    rejected: false,
    reference_image: null,
    notes: "",
  };
}

async function readOrCreateState(productDirectory: string) {
  const statePath = path.join(productDirectory, ".etsy-studio.json");
  try {
    const parsed = await readJson<ProductStudioStateV1>(statePath);
    if (
      parsed.schema_version === STUDIO_SCHEMA_VERSION &&
      typeof parsed.instance_id === "string"
    ) {
      return parsed;
    }
  } catch {
    // A missing or invalid sidecar is replaced by a minimal Studio-owned state.
  }

  const state = defaultState();
  await writeJsonAtomic(statePath, state);
  return state;
}

async function resultSummaries(productDirectory: string) {
  const root = path.join(productDirectory, "studio_outputs", "copywriting");
  if (!(await exists(root))) return [] as ProductResultSummaryV1[];

  const summaries: ProductResultSummaryV1[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^v\d{4}$/.test(entry.name)) continue;
    try {
      const result = await readJson<CopywritingResultV1>(
        path.join(root, entry.name, "listing.json"),
      );
      const review = await readJson<{ status?: string }>(
        path.join(root, entry.name, "review.json"),
      ).catch(() => ({ status: "needs_review" }));
      summaries.push({
        version: result.version,
        resultId: result.result_id,
        createdAt: result.created_at,
        reviewStatus:
          review.status === "approved" || review.status === "rejected"
            ? review.status
            : "needs_review",
        title: result.listing.title,
      });
    } catch {
      // Incomplete version directories are ignored until an atomic result exists.
    }
  }

  return summaries.sort((a, b) => b.version - a.version);
}

async function buildSnapshot(root: string, productDirectory: string) {
  const metadataPath = path.join(productDirectory, "metadata.json");
  const metadataRaw = await readFile(metadataPath, "utf8");
  const metadataHash = createHash("sha256").update(metadataRaw).digest("hex");
  let metadata: SupplierMetadata = {};
  let metadataError: string | null = null;
  try {
    metadata = JSON.parse(metadataRaw) as SupplierMetadata;
  } catch (error) {
    metadataError = `Invalid metadata.json: ${(error as Error).message}`;
  }

  const state = await readOrCreateState(productDirectory);
  const relativeFolder = normalizeRelativePath(
    path.relative(root, productDirectory),
  );
  const folderName = path.basename(productDirectory);
  const collectionPath = normalizeRelativePath(path.dirname(relativeFolder));
  const collection = collectionPath === "." ? "Root" : collectionPath;
  const title = text(metadata.title) || folderName.replace(/[_-]+/g, " ");
  const sourceDomain = text(metadata.source_domain).toLocaleLowerCase();
  const sourceProductId = text(metadata.source_product_id);
  const sourceKey =
    sourceDomain && sourceProductId
      ? `${sourceDomain}:${sourceProductId}`
      : null;
  const variations = Array.isArray(metadata.variation_images)
    ? (metadata.variation_images as SupplierVariation[])
    : [];

  const declared: Array<{
    role: ImageRole;
    relativePath: string;
    alt: string;
    title: string;
    sourceUrl: string;
  }> = [
    ...stringArray(metadata.main_images).map((relativePath) => ({
      role: "main" as const,
      relativePath,
      alt: "",
      title: "",
      sourceUrl: "",
    })),
    ...stringArray(metadata.description_images).map((relativePath) => ({
      role: "description" as const,
      relativePath,
      alt: "",
      title: "",
      sourceUrl: "",
    })),
    ...variations
      .map((variation) => ({
        role: "variation" as const,
        relativePath: text(variation.local_path),
        alt: text(variation.alt),
        title: text(variation.title),
        sourceUrl: text(variation.url),
      }))
      .filter((item) => item.relativePath),
  ];

  const roleCounters: Record<ImageRole, number> = {
    main: 0,
    description: 0,
    variation: 0,
  };
  const images: ProductImageV1[] = [];
  for (const item of declared) {
    const index = roleCounters[item.role]++;
    const absolute = resolvePlannedInside(productDirectory, item.relativePath);
    images.push({
      id: `${item.role}-${index}`,
      role: item.role,
      index,
      relativePath: normalizeRelativePath(item.relativePath),
      fileName: path.basename(item.relativePath),
      exists: await exists(absolute),
      alt: item.alt || `${title} ${item.role} image`,
      title: item.title,
      sourceUrl: item.sourceUrl,
      imageUrl: `/api/local/images/${encodeURIComponent(state.instance_id)}/${item.role}/${index}`,
    });
  }

  const declaredSet = new Set(images.map((image) => image.relativePath));
  const actualImages: string[] = [];
  for (const directoryName of [
    "main_images",
    "description_images",
    "variation_images",
  ]) {
    for (const filePath of await collectImages(
      path.join(productDirectory, directoryName),
    )) {
      actualImages.push(
        normalizeRelativePath(path.relative(productDirectory, filePath)),
      );
    }
  }

  const specsRecord = record(metadata.specs) ?? {};
  const results = await resultSummaries(productDirectory);
  const availablePaths = images
    .filter((image) => image.exists)
    .map((image) => image.relativePath);
  const referenceImage =
    state.reference_image && availablePaths.includes(state.reference_image)
      ? state.reference_image
      : (images.find((image) => image.role === "main" && image.exists)
          ?.relativePath ??
        images.find((image) => image.exists)?.relativePath ??
        null);

  if (referenceImage !== state.reference_image) {
    await writeJsonAtomic(path.join(productDirectory, ".etsy-studio.json"), {
      ...state,
      reference_image: referenceImage,
      updated_at: new Date().toISOString(),
    });
  }

  const snapshot: ProductSnapshotV1 = {
    schemaVersion: STUDIO_SCHEMA_VERSION,
    instanceId: state.instance_id,
    sourceKey,
    duplicateCount: 1,
    duplicateInstanceIds: [],
    relativeFolder,
    folderName,
    collection,
    metadataHash,
    metadataError,
    title,
    price: text(metadata.price),
    sourceUrl: text(metadata.source_url),
    sourceProductId,
    sourceDomain,
    sourceStatus: text(metadata.status) || "unknown",
    descriptionText: text(metadata.description_text),
    specs: Object.entries(specsRecord).map(([label, value]) => ({
      label,
      value:
        typeof value === "string"
          ? value
          : value == null
            ? ""
            : JSON.stringify(value),
    })),
    images,
    variations: variations.map((variation, index) => ({
      index,
      name:
        text(variation.title) ||
        text(variation.alt) ||
        `Variation ${index + 1}`,
      relativePath: normalizeRelativePath(text(variation.local_path)),
      exists: images.some(
        (image) =>
          image.role === "variation" &&
          image.relativePath ===
            normalizeRelativePath(text(variation.local_path)) &&
          image.exists,
      ),
    })),
    missingImages: images
      .filter((image) => !image.exists)
      .map((image) => image.relativePath),
    unindexedImages: actualImages.filter((image) => !declaredSet.has(image)),
    selected: state.selected,
    rejected: state.rejected,
    referenceImage,
    notes: state.notes,
    legacyListing: record(metadata.etsy_listing),
    legacyFacts: record(metadata.product_facts),
    results,
  };
  return snapshot;
}

export async function ensureWorkspaceStructure(root: string) {
  const control = path.join(root, ".etsy-listing-studio");
  for (const relative of [
    "jobs/queued",
    "jobs/processing",
    "jobs/completed",
    "jobs/failed",
    "jobs/cancelled",
    "batches",
    "trash",
    "logs",
    "cache",
    "staging",
    "settings",
  ]) {
    await mkdir(path.join(control, relative), { recursive: true });
  }
  return control;
}

export async function scanWorkspace(root: string) {
  await ensureWorkspaceStructure(root);
  const directories = await collectProductDirectories(root);
  const snapshots: ProductSnapshotV1[] = [];
  for (const directory of directories) {
    snapshots.push(await buildSnapshot(root, directory));
  }

  const groups = new Map<string, ProductSnapshotV1[]>();
  for (const snapshot of snapshots) {
    if (!snapshot.sourceKey) continue;
    groups.set(snapshot.sourceKey, [
      ...(groups.get(snapshot.sourceKey) ?? []),
      snapshot,
    ]);
  }
  for (const group of groups.values()) {
    for (const snapshot of group) {
      snapshot.duplicateCount = group.length;
      snapshot.duplicateInstanceIds = group
        .filter((item) => item.instanceId !== snapshot.instanceId)
        .map((item) => item.instanceId);
    }
  }

  return snapshots.sort((a, b) =>
    a.relativeFolder.localeCompare(b.relativeFolder, undefined, {
      numeric: true,
    }),
  );
}

export async function getProduct(root: string, instanceId: string) {
  const products = await scanWorkspace(root);
  const product = products.find((item) => item.instanceId === instanceId);
  if (!product) throw new Error("Product not found in the active workspace.");
  return product;
}

export async function getProductDirectory(root: string, instanceId: string) {
  const product = await getProduct(root, instanceId);
  return {
    product,
    directory: await resolveExistingInside(root, product.relativeFolder),
  };
}

export async function updateProductState(
  root: string,
  instanceId: string,
  patch: Partial<
    Pick<
      ProductStudioStateV1,
      "selected" | "rejected" | "reference_image" | "notes"
    >
  >,
) {
  const { product, directory } = await getProductDirectory(root, instanceId);
  const statePath = path.join(directory, ".etsy-studio.json");
  const state = await readJson<ProductStudioStateV1>(statePath);
  if (
    patch.reference_image &&
    !product.images.some(
      (image) =>
        image.relativePath === patch.reference_image && image.exists,
    )
  ) {
    throw new Error("The selected reference image is unavailable.");
  }
  const next: ProductStudioStateV1 = {
    ...state,
    ...(typeof patch.selected === "boolean"
      ? { selected: patch.selected }
      : {}),
    ...(typeof patch.rejected === "boolean"
      ? { rejected: patch.rejected }
      : {}),
    ...(typeof patch.reference_image === "string" ||
    patch.reference_image === null
      ? { reference_image: patch.reference_image }
      : {}),
    ...(typeof patch.notes === "string" ? { notes: patch.notes } : {}),
    updated_at: new Date().toISOString(),
  };
  await writeJsonAtomic(statePath, next);
  return getProduct(root, instanceId);
}

export async function trashProduct(root: string, instanceId: string) {
  const { product, directory } = await getProductDirectory(root, instanceId);
  const trashedAt = new Date().toISOString();
  const trashFolder = `${trashedAt.replace(/\D/g, "").slice(0, 14)}--${safeFileSegment(instanceId)}--${safeFileSegment(product.folderName)}`;
  const destination = path.join(
    root,
    ".etsy-listing-studio",
    "trash",
    trashFolder,
  );
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(directory, destination);
  const entry: TrashEntryV1 = {
    instanceId,
    title: product.title,
    originalRelativeFolder: product.relativeFolder,
    trashedAt,
    trashFolder,
  };
  await writeJsonAtomic(path.join(destination, "trash.json"), entry);
  return entry;
}

export async function listTrash(root: string) {
  const trashRoot = path.join(root, ".etsy-listing-studio", "trash");
  await mkdir(trashRoot, { recursive: true });
  const entries: TrashEntryV1[] = [];
  for (const entry of await readdir(trashRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      entries.push(
        await readJson<TrashEntryV1>(
          path.join(trashRoot, entry.name, "trash.json"),
        ),
      );
    } catch {
      // Ignore incomplete trash entries instead of exposing unsafe restore paths.
    }
  }
  return entries.sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
}

export async function restoreProduct(root: string, instanceId: string) {
  const entry = (await listTrash(root)).find(
    (item) => item.instanceId === instanceId,
  );
  if (!entry) throw new Error("Trashed product not found.");
  const source = path.join(
    root,
    ".etsy-listing-studio",
    "trash",
    entry.trashFolder,
  );
  const destination = resolvePlannedInside(root, entry.originalRelativeFolder);
  if (await exists(destination)) {
    throw new Error(
      "The original folder location is occupied. Rename or move that folder before restoring.",
    );
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(source, destination);
  return getProduct(root, instanceId);
}

export async function resolveProductImage(
  root: string,
  instanceId: string,
  role: ImageRole,
  index: number,
) {
  const { product, directory } = await getProductDirectory(root, instanceId);
  const image = product.images.find(
    (item) => item.role === role && item.index === index,
  );
  if (!image || !image.exists) throw new Error("Image not found.");
  return {
    image,
    filePath: await resolveExistingInside(directory, image.relativePath),
  };
}

export async function readProductResult(
  root: string,
  instanceId: string,
  resultId?: string,
) {
  const { product, directory } = await getProductDirectory(root, instanceId);
  const summary = resultId
    ? product.results.find((item) => item.resultId === resultId)
    : product.results[0];
  if (!summary) return null;
  const versionFolder = `v${String(summary.version).padStart(4, "0")}`;
  const outputDirectory = path.join(
    directory,
    "studio_outputs",
    "copywriting",
    versionFolder,
  );
  return {
    result: await readJson<CopywritingResultV1>(
      path.join(outputDirectory, "listing.json"),
    ),
    review: await readJson<Record<string, unknown>>(
      path.join(outputDirectory, "review.json"),
    ).catch(() => null),
  };
}

export async function readAllProductResults(root: string, instanceId: string) {
  const product = await getProduct(root, instanceId);
  const results = [];
  for (const summary of product.results) {
    const item = await readProductResult(root, instanceId, summary.resultId);
    if (item) results.push(item);
  }
  return results;
}
