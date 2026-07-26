import { NextResponse } from "next/server";
import { apiError, requireActiveWorkspace } from "@/lib/api-utils";
import {
  listJobs,
  queueCopywritingBatch,
} from "@/lib/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const root = await requireActiveWorkspace();
    return NextResponse.json({ jobs: await listJobs(root) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const root = await requireActiveWorkspace();
    const body = (await request.json()) as {
      instanceIds?: string[];
      instruction?: string;
    };
    const queued = await queueCopywritingBatch(
      root,
      Array.isArray(body.instanceIds) ? body.instanceIds : [],
      body.instruction ?? "",
    );
    return NextResponse.json(queued, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
