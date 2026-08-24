import { randomUUID } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { apiError, requireActiveWorkspace } from "@/lib/api-utils";
import { STUDIO_SCHEMA_VERSION, type ProductStudioStateV1 } from "@/lib/contracts";
import { resolvePlannedInside, safeFileSegment, writeJsonAtomic } from "@/lib/fs-utils";
import { formatItemNumber, getNextItemNumber, getProduct } from "@/lib/product-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IngestProductPayload {
  title?: string;
  price?: string;
  specs?: Record<string, unknown> | Array<{ label: string; value: string }>;
  description_text?: string;
  source_url?: string;
  source_product_id?: string;
  source_domain?: string;
  main_images?: string[];
  variation_images?: Array<
    | string
    | {
        url?: string;
        alt?: string;
        title?: string;
        local_path?: string;
      }
  >;
  description_images?: string[];
  item_number?: string | number | null;
}

function getExt(url: string, fallback = ".jpg"): string {
  try {
    const clean = url.split("?")[0].split("#")[0].toLowerCase();
    for (const ext of [".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"]) {
      if (clean.endsWith(ext)) return ext === ".jpeg" ? ".jpg" : ext;
    }
  } catch {
    // fallback
  }
  return fallback;
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadImageToFile(url: string, destPath: string): Promise<boolean> {
  try {
    let fullUrl = String(url || "").trim();
    if (!fullUrl) return false;
    if (fullUrl.startsWith("//")) {
      fullUrl = `https:${fullUrl}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(fullUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) return false;
    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, buffer);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const root = await requireActiveWorkspace();
    const payload = (await request.json()) as IngestProductPayload;

    const rawTitle = typeof payload.title === "string" ? payload.title.trim() : "";
    const title = rawTitle || "Untitled Product";

    // Sequential item number determination
    let itemNum: number;
    if (payload.item_number != null && payload.item_number !== "") {
      const parsed = typeof payload.item_number === "number" ? payload.item_number : parseInt(String(payload.item_number), 10);
      itemNum = !isNaN(parsed) && parsed > 0 ? parsed : await getNextItemNumber(root);
    } else {
      itemNum = await getNextItemNumber(root);
    }
    const itemNumberPadded = formatItemNumber(itemNum);

    const slug = safeFileSegment(title.toLowerCase().slice(0, 50)) || "product";
    let folderName = `[${itemNumberPadded}] ${slug}`;
    let productDir = resolvePlannedInside(root, folderName);

    if (await exists(productDir)) {
      folderName = `[${itemNumberPadded}] ${slug}-${randomUUID().slice(0, 6)}`;
      productDir = resolvePlannedInside(root, folderName);
    }

    const dirs = {
      main: path.join(productDir, "main_images"),
      variation: path.join(productDir, "variation_images"),
      description: path.join(productDir, "description_images"),
    };

    await mkdir(dirs.main, { recursive: true });
    await mkdir(dirs.variation, { recursive: true });
    await mkdir(dirs.description, { recursive: true });

    // Download Main Images
    const mainList = Array.isArray(payload.main_images) ? payload.main_images : [];
    const downloadedMain: string[] = [];
    for (let i = 0; i < mainList.length; i++) {
      const imgUrl = String(mainList[i] || "");
      if (!imgUrl) continue;
      const ext = getExt(imgUrl);
      const filename = `main_${i + 1}${ext}`;
      const dest = path.join(dirs.main, filename);
      const ok = await downloadImageToFile(imgUrl, dest);
      if (ok) {
        downloadedMain.push(`main_images/${filename}`);
      }
    }

    // Download Variation Images
    const varList = Array.isArray(payload.variation_images) ? payload.variation_images : [];
    const downloadedVars: Array<{
      local_path: string;
      url: string;
      alt: string;
      title: string;
      detected_specs: null;
    }> = [];
    for (let i = 0; i < varList.length; i++) {
      const item = varList[i];
      const imgUrl = typeof item === "string" ? item : item?.url || "";
      const alt = typeof item === "object" && item?.alt ? String(item.alt) : "";
      const varTitle = typeof item === "object" && item?.title ? String(item.title) : "";
      if (!imgUrl) continue;
      const ext = getExt(imgUrl);
      const filename = `var_${i + 1}${ext}`;
      const dest = path.join(dirs.variation, filename);
      const ok = await downloadImageToFile(imgUrl, dest);
      if (ok) {
        downloadedVars.push({
          local_path: `variation_images/${filename}`,
          url: imgUrl,
          alt,
          title: varTitle,
          detected_specs: null,
        });
      }
    }

    // Download Description Images
    const descList = Array.isArray(payload.description_images) ? payload.description_images : [];
    const downloadedDesc: string[] = [];
    for (let i = 0; i < descList.length; i++) {
      const imgUrl = String(descList[i] || "");
      if (!imgUrl) continue;
      const ext = getExt(imgUrl);
      const filename = `desc_${i + 1}${ext}`;
      const dest = path.join(dirs.description, filename);
      const ok = await downloadImageToFile(imgUrl, dest);
      if (ok) {
        downloadedDesc.push(`description_images/${filename}`);
      }
    }

    // Write metadata.json
    const metadata = {
      title,
      price: typeof payload.price === "string" ? payload.price : "",
      specs: payload.specs && typeof payload.specs === "object" ? payload.specs : {},
      description_text: typeof payload.description_text === "string" ? payload.description_text : "",
      source_url: typeof payload.source_url === "string" ? payload.source_url : "",
      source_product_id: typeof payload.source_product_id === "string" ? payload.source_product_id : "",
      source_domain: typeof payload.source_domain === "string" ? payload.source_domain : "",
      main_images: downloadedMain,
      variation_images: downloadedVars,
      description_images: downloadedDesc,
      status: "ready",
    };
    await writeJsonAtomic(path.join(productDir, "metadata.json"), metadata);

    // Write .etsy-studio.json
    const instanceId = randomUUID();
    const now = new Date().toISOString();
    const referenceImage =
      downloadedMain[0] ||
      (downloadedVars[0]?.local_path ?? null) ||
      downloadedDesc[0] ||
      null;

    const state: ProductStudioStateV1 = {
      schema_version: STUDIO_SCHEMA_VERSION,
      instance_id: instanceId,
      created_at: now,
      updated_at: now,
      selected: true,
      rejected: false,
      reference_image: referenceImage,
      notes: "",
      item_number: itemNumberPadded,
      quotation_price: null,
      published: false,
    };
    await writeJsonAtomic(path.join(productDir, ".etsy-studio.json"), state);

    // Read full snapshot to return
    const product = await getProduct(root, instanceId);

    return NextResponse.json({
      status: "success",
      message: `Product ingested successfully as #${itemNumberPadded} (${folderName}).`,
      product,
    });
  } catch (error) {
    return apiError(error);
  }
}
