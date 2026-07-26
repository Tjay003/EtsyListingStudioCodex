import { NextResponse } from "next/server";
import { apiError, requireActiveWorkspace } from "@/lib/api-utils";
import { cancelJob, retryJob } from "@/lib/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const root = await requireActiveWorkspace();
    const { id } = await context.params;
    const body = (await request.json()) as {
      action?: "cancel" | "retry";
    };
    if (body.action === "cancel") {
      return NextResponse.json({ job: await cancelJob(root, id) });
    }
    if (body.action === "retry") {
      return NextResponse.json({ job: await retryJob(root, id) });
    }
    throw new Error("Choose cancel or retry.");
  } catch (error) {
    return apiError(error);
  }
}
