import { NextResponse } from "next/server";
import { apiError, requireActiveWorkspace } from "@/lib/api-utils";
import { readAllProductResults } from "@/lib/product-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const root = await requireActiveWorkspace();
    const { id } = await context.params;
    return NextResponse.json({
      results: await readAllProductResults(root, id),
    });
  } catch (error) {
    return apiError(error);
  }
}
