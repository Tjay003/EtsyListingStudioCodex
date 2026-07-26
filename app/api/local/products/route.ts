import { NextResponse } from "next/server";
import { apiError, requireActiveWorkspace } from "@/lib/api-utils";
import { listTrash, scanWorkspace } from "@/lib/product-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const root = await requireActiveWorkspace();
    const [products, trash] = await Promise.all([
      scanWorkspace(root),
      listTrash(root),
    ]);
    return NextResponse.json({ products, trash });
  } catch (error) {
    return apiError(error);
  }
}
