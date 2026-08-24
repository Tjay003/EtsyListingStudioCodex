import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import type { ImageRole } from "@/lib/contracts";
import { apiError, requireActiveWorkspace } from "@/lib/api-utils";
import { resolveProductImage } from "@/lib/product-store";

sharp.cache(false);

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

// In-memory LRU thumbnail cache (max 200 items)
const memoryThumbnailCache = new Map<string, { buffer: Buffer; etag: string }>();
const MAX_MEMORY_CACHE = 200;

function setMemoryCache(key: string, buffer: Buffer, etag: string) {
  if (memoryThumbnailCache.size >= MAX_MEMORY_CACHE) {
    const firstKey = memoryThumbnailCache.keys().next().value;
    if (firstKey) memoryThumbnailCache.delete(firstKey);
  }
  memoryThumbnailCache.set(key, { buffer, etag });
}

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
    const ifNoneMatch = request.headers.get("if-none-match");

    if (Number.isFinite(width) && width > 0) {
      const size = Math.max(48, Math.min(1200, Math.round(width)));
      const sourceStat = await stat(resolved.filePath);
      const cacheKey = `${id}-${role}-${index}-${size}-${Math.round(sourceStat.mtimeMs)}`;
      const etag = `W/"${cacheKey}"`;

      if (ifNoneMatch === etag) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            "ETag": etag,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }

      const memCached = memoryThumbnailCache.get(cacheKey);
      if (memCached) {
        return new NextResponse(new Uint8Array(memCached.buffer), {
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": "public, max-age=31536000, immutable",
            "ETag": etag,
          },
        });
      }

      const cacheDirectory = path.join(
        root,
        ".etsy-listing-studio",
        "cache",
        "thumbnails",
      );
      await mkdir(cacheDirectory, { recursive: true });
      const cachePath = path.join(cacheDirectory, `${cacheKey}.webp`);

      let body: Buffer;
      try {
        body = await readFile(cachePath);
      } catch {
        const fileBuffer = await readFile(resolved.filePath);
        body = await sharp(fileBuffer, { failOn: "none" })
          .rotate()
          .resize({
            width: size,
            height: size,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 80, effort: 3 })
          .toBuffer();
        await writeFile(cachePath, body);
      }

      setMemoryCache(cacheKey, body, etag);

      return new NextResponse(new Uint8Array(body), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=31536000, immutable",
          "ETag": etag,
        },
      });
    }

    const sourceStat = await stat(resolved.filePath);
    const etag = `W/"${id}-${role}-${index}-${Math.round(sourceStat.mtimeMs)}"`;

    if (ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          "ETag": etag,
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    const body = await readFile(resolved.filePath);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type":
          CONTENT_TYPES[path.extname(resolved.filePath).toLocaleLowerCase()] ??
          "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
        "ETag": etag,
      },
    });
  } catch (error) {
    return apiError(error, 404);
  }
}
