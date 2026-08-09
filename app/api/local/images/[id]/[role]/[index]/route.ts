import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import type { ImageRole } from "@/lib/contracts";
import { apiError, requireActiveWorkspace } from "@/lib/api-utils";
import { resolveProductImage } from "@/lib/product-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; role: string; index: string }> },
) {
  try {
    const root = await requireActiveWorkspace();
    const { id, role, index } = await context.params;
    if (!["main", "description", "variation"].includes(role)) {
      throw new Error("Unsupported image role.");
    }
    const resolved = await resolveProductImage(
      root,
      id,
      role as ImageRole,
      Number(index),
    );
    const url = new URL(request.url);
    const width = Number(url.searchParams.get("w") ?? 0);
    if (Number.isFinite(width) && width > 0) {
      const size = Math.max(48, Math.min(1200, Math.round(width)));
      const sourceStat = await stat(resolved.filePath);
      const cacheDirectory = path.join(
        root,
        ".etsy-listing-studio",
        "cache",
        "thumbnails",
      );
      await mkdir(cacheDirectory, { recursive: true });
      const cachePath = path.join(
        cacheDirectory,
        `${id}-${role}-${index}-${size}-${Math.round(sourceStat.mtimeMs)}.webp`,
      );
      let body: Buffer;
      try {
        body = await readFile(cachePath);
      } catch {
        body = await sharp(resolved.filePath, { failOn: "none" })
          .rotate()
          .resize({
            width: size,
            height: size,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 78 })
          .toBuffer();
        await writeFile(cachePath, body);
      }
      return new NextResponse(new Uint8Array(body), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, max-age=86400",
        },
      });
    }
    const body = await readFile(resolved.filePath);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type":
          CONTENT_TYPES[path.extname(resolved.filePath).toLocaleLowerCase()] ??
          "application/octet-stream",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return apiError(error, 404);
  }
}
