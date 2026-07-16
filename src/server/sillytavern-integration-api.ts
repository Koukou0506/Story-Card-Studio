import { NextRequest, NextResponse } from "next/server";
import { isAllowedWorkspaceOrigin, safeTokenEqual } from "@/server/workspace-auth";
import { workspaceAllowedOrigins, workspaceEnabled } from "@/server/workspace-api";

const BODY_LIMIT = 5 * 1024 * 1024;

export function authorizeSillyTavernIntegration(request: NextRequest): NextResponse | null {
  if (!workspaceEnabled()) return NextResponse.json({ error: "Story Card Studio 工作区服务未启用。" }, { status: 503 });
  const origin = request.headers.get("origin");
  if (!isAllowedWorkspaceOrigin(origin, request.nextUrl.origin, workspaceAllowedOrigins())) return NextResponse.json({ error: "SillyTavern 来源不在 WORKSPACE_ALLOWED_ORIGINS 白名单中。" }, { status: 403 });
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || !safeTokenEqual(token, process.env.WORKSPACE_ACCESS_TOKEN!)) return NextResponse.json({ error: "Story Card Studio 工作区令牌无效。" }, { status: 401 });
  return null;
}

export async function readSillyTavernJson(request: NextRequest): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new IntegrationRequestError(415, "请求必须使用 application/json。");
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > BODY_LIMIT) throw new IntegrationRequestError(413, "SillyTavern 上下文快照超过 5 MiB 上限，请缩小聊天范围。");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > BODY_LIMIT) throw new IntegrationRequestError(413, "SillyTavern 上下文快照超过 5 MiB 上限，请缩小聊天范围。");
  try { return JSON.parse(text); } catch { throw new IntegrationRequestError(400, "请求体不是有效 JSON。"); }
}

export class IntegrationRequestError extends Error { constructor(public readonly status: number, message: string) { super(message); this.name = "IntegrationRequestError"; } }
export function integrationError(error: unknown): NextResponse {
  if (error instanceof IntegrationRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("SillyTavern integration request failed", error instanceof Error ? error.name : "unknown");
  return NextResponse.json({ error: "SillyTavern 集成请求失败；服务端未记录令牌或聊天正文。" }, { status: 500 });
}

export function withSillyTavernCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin");
  if (origin && isAllowedWorkspaceOrigin(origin, request.nextUrl.origin, workspaceAllowedOrigins())) response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Vary", "Origin"); response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type"); response.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  return response;
}

export function sillyTavernOptions(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  if (!isAllowedWorkspaceOrigin(origin, request.nextUrl.origin, workspaceAllowedOrigins())) return NextResponse.json({ error: "请求来源不在白名单中。" }, { status: 403 });
  return withSillyTavernCors(request, new NextResponse(null, { status: 204 }));
}
