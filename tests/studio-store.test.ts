import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import type { CopywritingResultDraftV1 } from "../lib/contracts";
import { prepareEvidenceSheet } from "../lib/evidence-sheet";
import { resolvePlannedInside } from "../lib/fs-utils";
import {
  cancelJob,
  claimNextJob,
  completeJob,
  listJobs,
  queueCopywritingBatch,
  queueCopywritingTweak,
  retryJob,
  setResultReview,
} from "../lib/job-store";
import {
  listTrash,
  restoreProduct,
  scanWorkspace,
  trashProduct,
} from "../lib/product-store";
import {
  readCopywritingSettings,
  saveCopywritingSettings,
} from "../lib/workspace-settings";

async function fixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "etsy-studio-"));
  const productA = path.join(root, "Furniture", "Renamed A");
  const productB = path.join(root, "Nested", "Renamed B");
  const onePixelPng = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: "#a56f48",
    },
  })
    .png()
    .toBuffer();
  await mkdir(path.join(productA, "main_images"), { recursive: true });
  await mkdir(path.join(productB, "main_images"), { recursive: true });
  await writeFile(path.join(productA, "main_images", "hero.png"), onePixelPng);
  await writeFile(path.join(productA, "main_images", "extra.png"), onePixelPng);
  await writeFile(path.join(productB, "main_images", "hero.png"), onePixelPng);
  const baseMetadata = {
    title: "Rounded Bedside Table",
    price: "18.50",
    specs: { Color: "Walnut Brown", Shape: "Round" },
    description_text: "Compact table with one lower shelf.",
    source_url: "https://www.aliexpress.com/item/100500123.html",
    source_product_id: "100500123",
    source_domain: "aliexpress.com",
    main_images: ["main_images/hero.png", "main_images/missing.png"],
    description_images: [],
    variation_images: [],
    status: "scraped",
  };
  await writeFile(
    path.join(productA, "metadata.json"),
    JSON.stringify(baseMetadata, null, 2),
  );
  await writeFile(
    path.join(productB, "metadata.json"),
    JSON.stringify(
      {
        ...baseMetadata,
        title: "Older Supplier Snapshot",
        main_images: ["main_images/hero.png"],
        etsy_listing: { title: "Legacy title" },
        product_facts: { material: "Legacy only" },
      },
      null,
      2,
    ),
  );
  return { root, productA, productB };
}

async function withFixture(
  run: (fixture: Awaited<ReturnType<typeof fixtureRoot>>) => Promise<void>,
) {
  const fixture = await fixtureRoot();
  try {
    await run(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}

function draft(): CopywritingResultDraftV1 {
  return {
    listing: {
      title: "Rounded Walnut Brown Bedside Table",
      description:
        "A compact round table for keeping everyday items close.\n\nDetails:\n- Walnut brown color\n- Round shape\n- One lower shelf",
      tags: ["bedside table", "round side table", "small room decor"],
      category: "Home & Living > Furniture > End & Side Tables",
      price: null,
    },
    evidence: [
      {
        id: "evidence-1",
        field: "color",
        value: "Walnut Brown",
        kind: "supplier_fact",
        source_path: "metadata.json",
        excerpt: "Color: Walnut Brown",
      },
    ],
    inspected_images: [
      {
        relative_path: "main_images/hero.png",
        role: "main",
        purpose: "Selected product reference",
      },
    ],
    conflicts: [],
    omitted_fields: ["material", "dimensions", "package contents"],
    warnings: [],
  };
}

test("scanner handles nested renamed folders, duplicates, missing files, and legacy data", async () => {
  await withFixture(async ({ root, productA }) => {
    const first = await scanWorkspace(root);
    assert.equal(first.length, 2);
    assert.equal(first[0].duplicateCount, 2);
    const current = first.find((item) => item.relativeFolder.includes("Renamed A"));
    assert.ok(current);
    assert.deepEqual(current.missingImages, ["main_images/missing.png"]);
    assert.deepEqual(current.unindexedImages, ["main_images/extra.png"]);
    const legacy = first.find((item) => item.legacyListing);
    assert.equal(legacy?.legacyListing?.title, "Legacy title");

    const originalId = current.instanceId;
    const moved = path.join(root, "Furniture", "Organized Name");
    await rename(productA, moved);
    const second = await scanWorkspace(root);
    assert.equal(
      second.find((item) => item.relativeFolder.includes("Organized Name"))
        ?.instanceId,
      originalId,
    );
  });
});

test("batch queue blocks duplicate source snapshots", async () => {
  await withFixture(async ({ root }) => {
    const products = await scanWorkspace(root);
    await assert.rejects(
      queueCopywritingBatch(
        root,
        products.map((product) => product.instanceId),
      ),
      /duplicate product group/i,
    );
  });
});

test("scanner reports malformed metadata and ignores Studio-owned folders", async () => {
  await withFixture(async ({ root }) => {
    const malformed = path.join(root, "Broken supplier record");
    const ignored = path.join(root, ".etsy-listing-studio", "trash", "ignored");
    await mkdir(malformed, { recursive: true });
    await mkdir(ignored, { recursive: true });
    await writeFile(path.join(malformed, "metadata.json"), "{not-json");
    await writeFile(path.join(ignored, "metadata.json"), "{}");

    const products = await scanWorkspace(root);
    assert.equal(products.length, 3);
    assert.match(
      products.find((product) => product.folderName === "Broken supplier record")
        ?.metadataError ?? "",
      /Invalid metadata\.json/,
    );
  });
});

test("planned paths reject traversal outside the active root", async () => {
  await withFixture(async ({ root }) => {
    assert.throws(
      () => resolvePlannedInside(root, "../outside.json"),
      /escapes the active workspace/i,
    );
  });
});

test("jobs claim atomically, build evidence, save immutable versions, and queue tweaks", async () => {
  await withFixture(async ({ root }) => {
    const [product] = await scanWorkspace(root);
    const queued = await queueCopywritingBatch(root, [product.instanceId], "Keep it concise.");
    const jobId = queued.jobs[0].job_id;
    const claimed = await claimNextJob(root);
    assert.equal(claimed?.job_id, jobId);

    const evidence = await prepareEvidenceSheet(root, jobId);
    assert.equal(evidence.imageCount, 1);
    assert.ok(await readFile(evidence.contactSheetPath));

    const completed = await completeJob(root, jobId, draft());
    assert.equal(completed.result.version, 1);
    assert.equal(completed.result.listing.price, null);

    const output = path.join(
      root,
      product.relativeFolder,
      "studio_outputs",
      "copywriting",
      "v0001",
    );
    assert.match(await readFile(path.join(output, "listing.txt"), "utf8"), /PRICE:\nManual/);
    await setResultReview(root, product.instanceId, completed.result.result_id, "approved");

    const tweak = await queueCopywritingTweak(
      root,
      product.instanceId,
      completed.result.result_id,
      ["title"],
      "Make the title less repetitive.",
    );
    assert.equal(tweak.jobs[0].task.kind, "copywriting.tweak");
    assert.equal(
      tweak.jobs[0].task.kind === "copywriting.tweak"
        ? tweak.jobs[0].task.reuse_evidence
        : false,
      true,
    );
    const claimedTweak = await claimNextJob(root);
    assert.equal(claimedTweak?.job_id, tweak.jobs[0].job_id);
    const attemptedTweak = draft();
    attemptedTweak.listing.title = "Short Acacia Side Table";
    attemptedTweak.listing.description = "This unselected replacement must be ignored.";
    attemptedTweak.listing.tags = ["wrong tag"];
    attemptedTweak.listing.category = "Wrong category";
    attemptedTweak.evidence = [];
    attemptedTweak.inspected_images = [];
    const tweaked = await completeJob(root, tweak.jobs[0].job_id, attemptedTweak);
    assert.equal(tweaked.result.version, 2);
    assert.equal(tweaked.result.parent_result_id, completed.result.result_id);
    assert.equal(tweaked.result.listing.title, "Short Acacia Side Table");
    assert.equal(
      tweaked.result.listing.description,
      completed.result.listing.description,
    );
    assert.deepEqual(tweaked.result.listing.tags, completed.result.listing.tags);
    assert.deepEqual(tweaked.result.evidence, completed.result.evidence);
    assert.deepEqual(
      tweaked.result.inspected_images,
      completed.result.inspected_images,
    );
  });
});

test("copywriting settings are scoped to the active workspace root", async () => {
  await withFixture(async ({ root }) => {
    const otherRoot = await mkdtemp(path.join(os.tmpdir(), "etsy-studio-other-"));
    try {
      const defaults = await readCopywritingSettings(root);
      assert.equal(defaults.shop_name, "Nookform");
      assert.match(defaults.policy_footer, /Order Adjustments & Cancellations/);
      assert.equal(defaults.require_policy_footer, true);

      await saveCopywritingSettings(root, {
        shop_name: "Corner Studio",
        voice: "Quiet, architectural, and concise.",
      });

      const saved = await readCopywritingSettings(root);
      const fresh = await readCopywritingSettings(otherRoot);
      assert.equal(saved.shop_name, "Corner Studio");
      assert.equal(saved.voice, "Quiet, architectural, and concise.");
      assert.equal(fresh.shop_name, "Nookform");
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });
});

test("claiming fails a queued job when metadata changed after review", async () => {
  await withFixture(async ({ root }) => {
    const [product] = await scanWorkspace(root);
    await queueCopywritingBatch(root, [product.instanceId]);
    const metadataPath = path.join(root, product.relativeFolder, "metadata.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    metadata.price = "99.00";
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    assert.equal(await claimNextJob(root), null);
    const failed = (await listJobs(root)).find((job) => job.status === "failed");
    assert.match(failed?.error ?? "", /metadata\.json changed/i);
  });
});

test("cancellation preserves recoverable retry state", async () => {
  await withFixture(async ({ root }) => {
    const [product] = await scanWorkspace(root);
    const { jobs } = await queueCopywritingBatch(root, [product.instanceId]);
    await cancelJob(root, jobs[0].job_id);
    let listed = await listJobs(root);
    assert.equal(listed.filter((job) => job.status === "cancelled").length, 1);
    await retryJob(root, jobs[0].job_id);
    listed = await listJobs(root);
    assert.equal(listed.filter((job) => job.status === "queued").length, 1);
  });
});

test("trash move and restore preserve the original relative path", async () => {
  await withFixture(async ({ root }) => {
    const [product] = await scanWorkspace(root);
    await trashProduct(root, product.instanceId);
    assert.equal((await scanWorkspace(root)).length, 1);
    assert.equal((await listTrash(root)).length, 1);
    await restoreProduct(root, product.instanceId);
    assert.equal((await scanWorkspace(root)).length, 2);
  });
});

test("trash restore refuses to overwrite an occupied original path", async () => {
  await withFixture(async ({ root }) => {
    const [product] = await scanWorkspace(root);
    await trashProduct(root, product.instanceId);
    await mkdir(path.join(root, product.relativeFolder), { recursive: true });
    await assert.rejects(
      restoreProduct(root, product.instanceId),
      /is occupied/i,
    );
  });
});
