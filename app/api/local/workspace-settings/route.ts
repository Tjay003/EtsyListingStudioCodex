import { NextResponse } from "next/server";
import { apiError, requireActiveWorkspace } from "@/lib/api-utils";
import {
  readCopywritingSettings,
  saveCopywritingSettings,
} from "@/lib/workspace-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const root = await requireActiveWorkspace();
    const settings = await readCopywritingSettings(root);
    return NextResponse.json({ settings });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const root = await requireActiveWorkspace();
    const body = await request.json();
    const settings = await saveCopywritingSettings(root, body);
    return NextResponse.json({ settings });
  } catch (error) {
    return apiError(error);
  }
}
