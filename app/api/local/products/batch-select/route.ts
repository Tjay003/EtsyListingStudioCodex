import { NextResponse } from "next/server";
import { apiError, requireActiveWorkspace } from "@/lib/api-utils";
import { batchUpdateProductSelection } from "@/lib/product-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const root = await requireActiveWorkspace();
    const body = (await request.json()) as {
      instanceIds?: unknown;
      selected?: unknown;
    };

    if (!Array.isArray(body.instanceIds)) {
      throw new Error("instanceIds must be an array of strings.");
    }
    if (typeof body.selected !== "boolean") {
      throw new Error("selected must be a boolean.");
    }

    const instanceIds = body.instanceIds.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );

    const result = await batchUpdateProductSelection(
      root,
      instanceIds,
      body.selected,
    );

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}

export const PATCH = POST;
