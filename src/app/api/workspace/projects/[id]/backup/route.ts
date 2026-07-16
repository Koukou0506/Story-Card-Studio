import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspace, workspaceErrorResponse } from "@/server/workspace-api";
import { getWorkspaceStore } from "@/server/workspace-store";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const denied = authorizeWorkspace(request); if (denied) return denied;
  try { return NextResponse.json({ backup: await getWorkspaceStore().backupProject((await context.params).id) }); }
  catch (error) { return workspaceErrorResponse(error); }
}
