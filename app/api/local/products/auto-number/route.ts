import { NextResponse } from "next/server";
import { apiError, requireActiveWorkspace } from "@/lib/api-utils";
import { autoNumberUnassignedProducts } from "@/lib/product-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const root = await requireActiveWorkspace();
    const assignedCount = await autoNumberUnassignedProducts(root);
    return NextResponse.json({
      success: true,
      assignedCount,
      message:
        assignedCount > 0
          ? `Successfully assigned item numbers to ${assignedCount} products.`
          : "All products already have item numbers assigned.",
    });
  } catch (error) {
    return apiError(error);
  }
}
