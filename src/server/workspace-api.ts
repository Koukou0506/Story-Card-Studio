import { NextRequest, NextResponse } from "next/server";
import { StorageConflictError } from "@/storage/types";
import { WORKSPACE_SESSION_COOKIE, isAllowedWorkspaceOrigin, workspaceSessions } from "./workspace-auth";

const DEFAULT_BODY_LIMIT = 30 * 1024 * 1024;

export function workspaceEnabled(): boolean {
  return Boolean(process.env.WORKSPACE_ACCESS_TOKEN && process.env.WORKSPACE_ACCESS_TOKEN.length >= 24);
}

export function workspaceAllowedOrigins(): string[] {
  return (process.env.WORKSPACE_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
}

export function validateWorkspaceOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!isAllowedWorkspaceOrigin(origin, request.nextUrl.origin, workspaceAllowedOrigins())) {
    return NextResponse.json({ error: "请求来源不在工作区白名单中。" }, { status: 403 });
  }
  return null;
}

export function authorizeWorkspace(request: NextRequest, requireCsrf = false): NextResponse | null {
  if (!workspaceEnabled()) return NextResponse.json({ error: "工作区服务器未启用。请设置长度至少 24 位的 WORKSPACE_ACCESS_TOKEN。" }, { status: 503 });
  const originError = validateWorkspaceOrigin(request);
  if (originError) return originError;
  const sessionId = request.cookies.get(WORKSPACE_SESSION_COOKIE)?.value;
  if (!workspaceSessions.has(sessionId)) return NextResponse.json({ error: "工作区会话无效或已过期，请重新登录。" }, { status: 401 });
  if (requireCsrf && !workspaceSessions.verify(sessionId, request.headers.get("x-csrf-token"))) {
    return NextResponse.json({ error: "CSRF 校验失败，请刷新会话后重试。" }, { status: 403 });
  }
  return null;
}

export async function readLimitedJson(request: NextRequest, limit = Number(process.env.WORKSPACE_BODY_LIMIT || DEFAULT_BODY_LIMIT)): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) throw new WorkspaceRequestError(413, `请求体超过 ${Math.floor(limit / 1024 / 1024)} MB 上限。`);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > limit) throw new WorkspaceRequestError(413, `请求体超过 ${Math.floor(limit / 1024 / 1024)} MB 上限。`);
  try { return JSON.parse(text); } catch { throw new WorkspaceRequestError(400, "请求体不是有效 JSON。"); }
}

export class WorkspaceRequestError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = "WorkspaceRequestError"; }
}

export function workspaceErrorResponse(error: unknown): NextResponse {
  if (error instanceof StorageConflictError) return NextResponse.json({ error: error.message, code: error.code, current: error.current }, { status: 409 });
  if (error instanceof WorkspaceRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Workspace request failed", error instanceof Error ? error.name : "unknown");
  return NextResponse.json({ error: "工作区请求失败。服务端未记录项目正文或访问令牌。" }, { status: 500 });
}

export function clientAddress(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

