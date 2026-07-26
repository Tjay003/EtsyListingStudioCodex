import { NextResponse } from "next/server";
import { apiError, requireActiveWorkspace } from "@/lib/api-utils";
import {
  trashProduct,
  updateProductState,
} from "@/lib/product-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const root = await requireActiveWorkspace();
    const { id } = await context.params;
    const body = (await request.json()) as {
      selected?: boolean;
      rejected?: boolean;
      referenceImage?: string | null;
      notes?: string;
    };
    const product = await updateProductState(root, id, {
      ...(typeof body.selected === "boolean"
        ? { selected: body.selected }
        : {}),
      ...(typeof body.rejected === "boolean"
        ? { rejected: body.rejected }
        : {}),
      ...(typeof body.referenceImage === "string" ||
      body.referenceImage === null
        ? { reference_image: body.referenceImage }
        : {}),
      ...(typeof body.notes === "string" ? { notes: body.notes } : {}),
    });
    return NextResponse.json({ product });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const root = await requireActiveWorkspace();
    const { id } = await context.params;
    return NextResponse.json({ trash: await trashProduct(root, id) });
  } catch (error) {
    return apiError(error);
  }
}
