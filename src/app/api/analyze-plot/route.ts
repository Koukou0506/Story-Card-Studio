import { NextRequest, NextResponse } from "next/server";
import { PlotAnalysisProjectSchema } from "@/domain/plot-analysis";
import { CharacterCardV2Schema } from "@/domain/character-card";
import { LorebookSchema } from "@/domain/lorebook";
import { ProviderTypeSchema } from "@/providers/types";
import { createProvider, getDefaultProviderType } from "@/providers/factory";
import { generatePlotAnalysis } from "@/services/analysis-generator";
import { GenerationError } from "@/services/generator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json(); const project = PlotAnalysisProjectSchema.safeParse(body.project);
    const card = CharacterCardV2Schema.safeParse(body.characterCard); const books = LorebookSchema.array().safeParse(body.lorebooks || []);
    if (!project.success || !card.success || !books.success) return NextResponse.json({ error: "剧情分析输入、角色卡或世界书格式有误。" }, { status: 400 });
    const providerType = ProviderTypeSchema.catch(getDefaultProviderType()).parse(body.provider); const provider = createProvider({ type: providerType });
    const result = await generatePlotAnalysis(project.data, card.data, books.data, { provider, model: String(body.model || provider.defaultModel),
      timeoutMs: Number.parseInt(process.env.API_TIMEOUT_MS || "60000", 10), abortSignal: request.signal });
    return NextResponse.json({ success: true, data: result.report, context: result.context,
      meta: { model: result.model, retriesUsed: result.retriesUsed, usage: result.usage } });
  } catch (error) {
    if (error instanceof GenerationError) { const status = { timeout: 504, cancelled: 499, provider_error: 502, validation_error: 422, parse_error: 422 }[error.code];
      return NextResponse.json({ error: error.message, code: error.code }, { status }); }
    return NextResponse.json({ error: `剧情分析服务错误：${(error as Error).message}` }, { status: 500 });
  }
}

