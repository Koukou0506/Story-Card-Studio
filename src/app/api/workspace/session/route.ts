import { NextRequest, NextResponse } from "next/server";
import { clientAddress, readLimitedJson, validateWorkspaceOrigin, workspaceEnabled, workspaceErrorResponse } from "@/server/workspace-api";
import { WORKSPACE_SESSION_COOKIE, safeTokenEqual, workspaceLoginLimiter, workspaceSessions } from "@/server/workspace-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!workspaceEnabled()) return NextResponse.json({ error: "工作区服务器未启用。" }, { status: 503 });
    const originError = validateWorkspaceOrigin(request); if (originError) return originError;
    const address = clientAddress(request);
    if (!workspaceLoginLimiter.canAttempt(address)) return NextResponse.json({ error: "登录失败次数过多，请稍后再试。" }, { status: 429 });
    const body = await readLimitedJson(request, 4 * 1024) as { accessToken?: unknown };
    if (typeof body.accessToken !== "string" || !safeTokenEqual(body.accessToken, process.env.WORKSPACE_ACCESS_TOKEN!)) {
      workspaceLoginLimiter.fail(address);
      return NextResponse.json({ error: "工作区访问令牌无效。" }, { status: 401 });
    }
    workspaceLoginLimiter.clear(address);
    const session = workspaceSessions.create();
    const response = NextResponse.json({ success: true, csrf: session.csrf, expiresAt: session.expiresAt });
    response.cookies.set(WORKSPACE_SESSION_COOKIE, session.id, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 60 * 60 });
    return response;
  } catch (error) { return workspaceErrorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  const originError = validateWorkspaceOrigin(request); if (originError) return originError;
  workspaceSessions.revoke(request.cookies.get(WORKSPACE_SESSION_COOKIE)?.value);
  const response = NextResponse.json({ success: true });
  response.cookies.set(WORKSPACE_SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}

