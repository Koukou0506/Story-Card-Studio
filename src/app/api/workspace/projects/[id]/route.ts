import { NextRequest, NextResponse } from "next/server";
import { ProjectDraftSchema } from "@/domain/project-draft";
import { authorizeWorkspace, readLimitedJson, workspaceErrorResponse, WorkspaceRequestError } from "@/server/workspace-api";
import { getWorkspaceStore } from "@/server/workspace-store";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const denied = authorizeWorkspace(request); if (denied) return denied;
  try { return NextResponse.json({ project: await getWorkspaceStore().readProject((await context.params).id) }); }
  catch (error) { return workspaceErrorResponse(error); }
}

export async function PUT(request: NextRequest, context: Context) {
  const denied = authorizeWorkspace(request, true); if (denied) return denied;
  try {
    const body = await readLimitedJson(request) as { draft?: unknown; expectedVersion?: unknown };
    if (!Number.isInteger(body.expectedVersion)) throw new WorkspaceRequestError(400, "expectedVersion 必须是整数。");
    const project = await getWorkspaceStore().updateProject((await context.params).id, ProjectDraftSchema.parse(body.draft), body.expectedVersion as number);
    return NextResponse.json({ project });
  } catch (error) { return workspaceErrorResponse(error); }
}

export async function DELETE(request: NextRequest, context: Context) {
  const denied = authorizeWorkspace(request, true); if (denied) return denied;
  try {
    const body = await readLimitedJson(request, 8 * 1024) as { expectedVersion?: unknown };
    if (!Number.isInteger(body.expectedVersion)) throw new WorkspaceRequestError(400, "expectedVersion 必须是整数。");
    await getWorkspaceStore().deleteProject((await context.params).id, body.expectedVersion as number);
    return NextResponse.json({ success: true });
  } catch (error) { return workspaceErrorResponse(error); }
}

