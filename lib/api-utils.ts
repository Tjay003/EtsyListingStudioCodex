import { NextResponse } from "next/server";
import { getActiveWorkspace } from "./local-config";

export function apiError(error: unknown, status = 400) {
  const message =
    error instanceof Error ? error.message : "The local operation failed.";
  return NextResponse.json({ error: message }, { status });
}

export async function requireActiveWorkspace() {
  const root = await getActiveWorkspace();
  if (!root) {
    throw new Error("Choose an active product root first.");
  }
  return root;
}
