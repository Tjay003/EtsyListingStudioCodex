import { NextResponse } from "next/server";
import { apiError, requireActiveWorkspace } from "@/lib/api-utils";
import { setResultReview } from "@/lib/job-store";

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
      resultId?: string;
      status?: "approved" | "rejected" | "needs_review";
      note?: string;
    };
    if (
      !body.resultId ||
      !["approved", "rejected", "needs_review"].includes(body.status ?? "")
    ) {
      throw new Error("Choose a result and review status.");
    }
    const review = await setResultReview(
      root,
      id,
      body.resultId,
      body.status!,
      body.note ?? "",
    );
    return NextResponse.json({ review });
  } catch (error) {
    return apiError(error);
  }
}
