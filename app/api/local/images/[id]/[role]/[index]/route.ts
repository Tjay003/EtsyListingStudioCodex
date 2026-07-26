import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
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
  _request: Request,
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
    const body = await readFile(resolved.filePath);
    return new NextResponse(body, {
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
