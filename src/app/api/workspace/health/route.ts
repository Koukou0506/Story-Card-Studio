import { NextResponse } from "next/server";
import { getWorkspaceStore } from "@/server/workspace-store";
import { workspaceEnabled } from "@/server/workspace-api";

export const runtime = "nodejs";

export async function GET() {
  if (!workspaceEnabled()) return NextResponse.json({ ok: false, mode: "server", message: "工作区服务器未启用。", authenticationRequired: true });
  const health = await getWorkspaceStore().healthCheck();
  return NextResponse.json({ ...health, authenticationRequired: true });
}

