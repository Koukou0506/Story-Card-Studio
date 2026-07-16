import { NextRequest, NextResponse } from "next/server";
import { authorizeSillyTavernIntegration, sillyTavernOptions, withSillyTavernCors } from "@/server/sillytavern-integration-api";
import { sillyTavernTaskStore } from "@/server/sillytavern-task-store";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export function OPTIONS(request: NextRequest) { return sillyTavernOptions(request); }
export async function GET(request: NextRequest, context: Context) { const denied = authorizeSillyTavernIntegration(request); if (denied) return withSillyTavernCors(request, denied); const task = sillyTavernTaskStore.getTask((await context.params).id); return withSillyTavernCors(request, task ? NextResponse.json(task) : NextResponse.json({ error: "任务不存在。" }, { status: 404 })); }
export async function DELETE(request: NextRequest, context: Context) { const denied = authorizeSillyTavernIntegration(request); if (denied) return withSillyTavernCors(request, denied); const task = sillyTavernTaskStore.cancelTask((await context.params).id); return withSillyTavernCors(request, task ? NextResponse.json(task) : NextResponse.json({ error: "任务不存在。" }, { status: 404 })); }
