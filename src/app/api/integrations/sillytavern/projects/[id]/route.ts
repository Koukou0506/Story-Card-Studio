import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceStore } from "@/server/workspace-store";
import { authorizeSillyTavernIntegration, integrationError, sillyTavernOptions, withSillyTavernCors } from "@/server/sillytavern-integration-api";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export function OPTIONS(request: NextRequest) { return sillyTavernOptions(request); }
export async function GET(request: NextRequest, context: Context) { const denied = authorizeSillyTavernIntegration(request); if (denied) return withSillyTavernCors(request, denied); try { const project = await getWorkspaceStore().readProject((await context.params).id); return withSillyTavernCors(request, project ? NextResponse.json({ project }) : NextResponse.json({ error: "项目不存在。" }, { status: 404 })); } catch (error) { return withSillyTavernCors(request, integrationError(error)); } }
