import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { resolveExistingInside, writeJsonAtomic } from "./fs-utils";
import { readJobSourceContext } from "./job-store";

export async function prepareEvidenceSheet(root: string, jobId: string) {
  const context = await readJobSourceContext(root, jobId);
  const images = context.product.images
    .filter((image) => image.exists)
    .sort((a, b) => {
      if (a.relativePath === context.product.referenceImage) return -1;
      if (b.relativePath === context.product.referenceImage) return 1;
      const priority = { description: 0, main: 1, variation: 2 };
      return priority[a.role] - priority[b.role] || a.index - b.index;
    })
    .slice(0, 48);

  const tileSize = 220;
  const columns = 6;
  const rows = Math.max(1, Math.ceil(images.length / columns));
  const composites = [];
  const index = [];
  for (let position = 0; position < images.length; position += 1) {
    const image = images[position];
    const source = await resolveExistingInside(
      context.productDirectory,
      image.relativePath,
    );
    const input = await sharp(source)
      .rotate()
      .resize(tileSize - 12, tileSize - 12, {
        fit: "contain",
        background: "#f7f4ed",
      })
      .flatten({ background: "#f7f4ed" })
      .jpeg({ quality: 78 })
      .toBuffer();
    composites.push({
      input,
      left: (position % columns) * tileSize + 6,
      top: Math.floor(position / columns) * tileSize + 6,
    });
    index.push({
      position: position + 1,
      relative_path: image.relativePath,
      role: image.role,
      reference: image.relativePath === context.product.referenceImage,
    });
  }

  const outputDirectory = path.join(
    root,
    ".etsy-listing-studio",
    "cache",
    jobId,
  );
  await mkdir(outputDirectory, { recursive: true });
  const sheetPath = path.join(outputDirectory, "contact-sheet.jpg");
  await sharp({
    create: {
      width: columns * tileSize,
      height: rows * tileSize,
      channels: 3,
      background: "#e8e1d6",
    },
  })
    .composite(composites)
    .jpeg({ quality: 82 })
    .toFile(sheetPath);
  const indexPath = path.join(outputDirectory, "contact-sheet.json");
  await writeJsonAtomic(indexPath, {
    schema_version: 1,
    job_id: jobId,
    selected_reference: context.product.referenceImage,
    images: index,
  });

  return {
    contactSheetPath: sheetPath,
    indexPath,
    selectedReferencePath: context.product.referenceImage
      ? await resolveExistingInside(
          context.productDirectory,
          context.product.referenceImage,
        )
      : null,
    productDirectory: context.productDirectory,
    metadataPath: context.metadataPath,
    imageCount: images.length,
  };
}
