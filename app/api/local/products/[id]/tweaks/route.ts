import { NextResponse } from "next/server";
import { apiError, requireActiveWorkspace } from "@/lib/api-utils";
import { queueCopywritingTweak } from "@/lib/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const root = await requireActiveWorkspace();
    const { id } = await context.params;
    const body = (await request.json()) as {
      parentResultId?: string;
      fields?: Array<"title" | "description" | "tags" | "category">;
      instruction?: string;
    };
    if (!body.parentResultId) throw new Error("Choose a result to tweak.");
    const queued = await queueCopywritingTweak(
      root,
      id,
      body.parentResultId,
      Array.isArray(body.fields) ? body.fields : [],
      body.instruction ?? "",
    );
    return NextResponse.json(queued, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
