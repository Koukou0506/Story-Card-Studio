import { NextRequest, NextResponse } from "next/server";
import { WorkspaceProjectRecordSchema } from "@/storage/types";
import { authorizeWorkspace, readLimitedJson, workspaceErrorResponse } from "@/server/workspace-api";
import { getWorkspaceStore } from "@/server/workspace-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = authorizeWorkspace(request); if (denied) return denied;
  try { return NextResponse.json({ projects: await getWorkspaceStore().listProjects() }); }
  catch (error) { return workspaceErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  const denied = authorizeWorkspace(request, true); if (denied) return denied;
  try {
    const body = await readLimitedJson(request) as { record?: unknown };
    const record = WorkspaceProjectRecordSchema.parse(body.record);
    return NextResponse.json({ project: await getWorkspaceStore().createProject(record) }, { status: 201 });
  } catch (error) { return workspaceErrorResponse(error); }
}

