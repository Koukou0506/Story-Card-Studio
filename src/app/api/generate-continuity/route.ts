import { NextRequest, NextResponse } from "next/server";
import { ContinuityProjectSchema } from "@/domain/continuity";
import { ProviderTypeSchema } from "@/providers/types";
import { createProvider, getDefaultProviderType } from "@/providers/factory";
import { generateContinuityProject } from "@/services/continuity-generator";
import { GenerationError } from "@/services/generator";
import type { ContinuityPromptMode } from "@/prompts/continuity-v1";

const modes = new Set(["chapter_summary", "scene_summary", "canon_extraction", "state_extraction", "plot_thread_extraction", "foreshadow_detection", "plan_manuscript_drift", "project_continuity", "project_health", "next_chapter_context", "json_repair"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json(); const project = ContinuityProjectSchema.parse(body.project);
    const mode = String(body.mode || "project_continuity"); if (!modes.has(mode)) return NextResponse.json({ error: "不支持的连续性生成模式。" }, { status: 400 });
    const type = ProviderTypeSchema.catch(getDefaultProviderType()).parse(body.provider); const provider = createProvider({ type });
    const result = await generateContinuityProject({ project, mode: mode as ContinuityPromptMode, context: body.context ?? {}, allowedSourceIds: Array.isArray(body.allowedSourceIds) ? body.allowedSourceIds.map(String) : [], provider, model: String(body.model || provider.defaultModel), timeoutMs: Number(process.env.API_TIMEOUT_MS || 60000), abortSignal: request.signal });
    return NextResponse.json({ success: true, data: result.project, warnings: result.warnings, meta: { model: result.model, retriesUsed: result.retriesUsed, usage: result.usage } });
  } catch (error) {
    if (error instanceof GenerationError) return NextResponse.json({ error: error.message, code: error.code }, { status: { timeout: 504, cancelled: 499, provider_error: 502, validation_error: 422, parse_error: 422 }[error.code] });
    return NextResponse.json({ error: `连续性服务错误：${(error as Error).message}` }, { status: 500 });
  }
}
