import { NextResponse } from "next/server";
import { apiError, requireActiveWorkspace } from "@/lib/api-utils";
import { restoreProduct } from "@/lib/product-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const root = await requireActiveWorkspace();
    const { id } = await context.params;
    return NextResponse.json({ product: await restoreProduct(root, id) });
  } catch (error) {
    return apiError(error, 409);
  }
}
