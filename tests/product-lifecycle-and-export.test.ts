import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  checkEditedPhotosReady,
  extractItemNumber,
  formatItemNumber,
  getNextItemNumber,
  getProduct,
  scanWorkspace,
  updateProductState,
} from "../lib/product-store";
import {
  readCopywritingSettings,
  saveCopywritingSettings,
} from "../lib/workspace-settings";

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "etsy-lifecycle-test-"));
  return root;
}

test("item number helpers: extract, format, and sequential scan", async () => {
  assert.equal(extractItemNumber("[001] test-slug"), 1);
  assert.equal(extractItemNumber("[12] test-slug"), 12);
  assert.equal(extractItemNumber("(005) item"), 5);
  assert.equal(extractItemNumber("007_item"), 7);
  assert.equal(extractItemNumber("10 - item"), 10);
  assert.equal(extractItemNumber("42"), 42);
  assert.equal(extractItemNumber("unrelated-product"), null);

  assert.equal(formatItemNumber(1), "001");
  assert.equal(formatItemNumber(25), "025");
  assert.equal(formatItemNumber("99"), "099");
  assert.equal(formatItemNumber(150), "150");

  const root = await createFixture();
  try {
    assert.equal(await getNextItemNumber(root), 1);

    // Create folder [001] item
    const folder1 = path.join(root, "[001] first-item");
    await mkdir(folder1, { recursive: true });
    await writeFile(
      path.join(folder1, "metadata.json"),
      JSON.stringify({ title: "First Item" }),
    );

    assert.equal(await getNextItemNumber(root), 2);

    // Create folder [005] fifth-item
    const folder5 = path.join(root, "[005] fifth-item");
    await mkdir(folder5, { recursive: true });
    await writeFile(
      path.join(folder5, "metadata.json"),
      JSON.stringify({ title: "Fifth Item" }),
    );

    assert.equal(await getNextItemNumber(root), 6);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("edited photos detection across supported directory names", async () => {
  const root = await createFixture();
  try {
    const productDir = path.join(root, "[001] ceramic-mug");
    await mkdir(productDir, { recursive: true });
    await writeFile(
      path.join(productDir, "metadata.json"),
      JSON.stringify({ title: "Ceramic Mug" }),
    );

    assert.equal(await checkEditedPhotosReady(productDir), false);

    // Create 1px image
    const onePx = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "#333333" },
    })
      .png()
      .toBuffer();

    const editedDir = path.join(productDir, "edited");
    await mkdir(editedDir, { recursive: true });
    await writeFile(path.join(editedDir, "final_1.png"), onePx);

    assert.equal(await checkEditedPhotosReady(productDir), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("product state updates: quotation_price, published, and item_number", async () => {
  const root = await createFixture();
  try {
    const productDir = path.join(root, "[001] brass-lamp");
    await mkdir(productDir, { recursive: true });
    await writeFile(
      path.join(productDir, "metadata.json"),
      JSON.stringify({ title: "Brass Lamp", price: "24.99" }),
    );

    const [initial] = await scanWorkspace(root);
    assert.equal(initial.item_number, "001");
    assert.equal(initial.quotation_price, null);
    assert.equal(initial.published, false);
    assert.equal(initial.edited_photos_ready, false);

    // Update state
    const updated = await updateProductState(root, initial.instanceId, {
      quotation_price: "$49.99",
      published: true,
      item_number: "002",
    });

    assert.equal(updated.quotation_price, "$49.99");
    assert.equal(updated.published, true);
    assert.equal(updated.item_number, "002");

    // Rescan workspace to verify persistence
    const reloaded = await getProduct(root, initial.instanceId);
    assert.equal(reloaded.quotation_price, "$49.99");
    assert.equal(reloaded.published, true);
    assert.equal(reloaded.item_number, "002");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workspace settings: save and read google_sheets_webhook_url", async () => {
  const root = await createFixture();
  try {
    const defaults = await readCopywritingSettings(root);
    assert.equal(defaults.google_sheets_webhook_url, "");

    const testUrl = "https://script.google.com/macros/s/AKfycbz12345/exec";
    const saved = await saveCopywritingSettings(root, {
      google_sheets_webhook_url: testUrl,
      shop_name: "Artisan Woodworks",
    });

    assert.equal(saved.google_sheets_webhook_url, testUrl);
    assert.equal(saved.shop_name, "Artisan Woodworks");

    const reloaded = await readCopywritingSettings(root);
    assert.equal(reloaded.google_sheets_webhook_url, testUrl);
    assert.equal(reloaded.shop_name, "Artisan Woodworks");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
