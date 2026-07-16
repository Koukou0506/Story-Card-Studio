import { NextRequest, NextResponse } from "next/server";
import { authorizeSillyTavernIntegration, sillyTavernOptions, withSillyTavernCors } from "@/server/sillytavern-integration-api";
import { sillyTavernTaskStore } from "@/server/sillytavern-task-store";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export function OPTIONS(request: NextRequest) { return sillyTavernOptions(request); }
export async function POST(request: NextRequest, context: Context) { const denied = authorizeSillyTavernIntegration(request); if (denied) return withSillyTavernCors(request, denied); const task = sillyTavernTaskStore.getTask((await context.params).id); if (!task) return withSillyTavernCors(request, NextResponse.json({ error: "任务不存在。" }, { status: 404 })); const snapshot = sillyTavernTaskStore.getSnapshot(task.snapshotId); return withSillyTavernCors(request, NextResponse.json({ taskId: task.id, status: task.status, result: task.result, source: { characterFingerprint: snapshot?.character?.fingerprint ?? null, worldInfoFingerprints: snapshot?.worldInfo.map((item) => ({ name: item.name, fingerprint: item.fingerprint })) ?? [] }, writeback: { character: "export_or_extension_field_only", worldInfo: snapshot?.capabilities.worldInfoWriteback ? "confirm_then_public_api" : "export_only", chat: "preview_only" } })); }
