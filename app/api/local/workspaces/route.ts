import path from "node:path";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import {
  pickWindowsFolder,
  readLocalConfig,
  setActiveWorkspace,
} from "@/lib/local-config";
import { ensureWorkspaceStructure, scanWorkspace } from "@/lib/product-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = await readLocalConfig();
  return NextResponse.json({
    ...config,
    active_name: config.active_root ? path.basename(config.active_root) : null,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: "pick" | "open";
      path?: string;
    };
    const selected =
      body.action === "pick" ? await pickWindowsFolder() : body.path?.trim();
    if (!selected) {
      return NextResponse.json({ cancelled: true });
    }
    const config = await setActiveWorkspace(selected);
    await ensureWorkspaceStructure(config.active_root!);
    const products = await scanWorkspace(config.active_root!);
    return NextResponse.json({
      ...config,
      active_name: path.basename(config.active_root!),
      product_count: products.length,
    });
  } catch (error) {
    return apiError(error);
  }
}
