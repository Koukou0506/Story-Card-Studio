import { NextRequest, NextResponse } from "next/server";
import { CharacterCardV2Schema } from "@/domain/character-card";
import { ChapterPlanningProjectSchema } from "@/domain/chapter-planning";
import { LorebookSchema } from "@/domain/lorebook";
import { PlotAnalysisProjectSchema } from "@/domain/plot-analysis";
import { ManuscriptSchema, ProseGenerationRequestSchema } from "@/domain/prose";
import { StoryPlanSchema } from "@/domain/story-planning";
import { createProvider, getDefaultProviderType } from "@/providers/factory";
import { ProviderTypeSchema } from "@/providers/types";
import { GenerationError } from "@/services/generator";
import { generateProse } from "@/services/prose-generator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const manuscript = ManuscriptSchema.parse(body.manuscript);
    const proseRequest = ProseGenerationRequestSchema.parse(body.request);
    const chapterPlanning = ChapterPlanningProjectSchema.parse(body.chapterPlanning);
    const storyPlan = body.storyPlan ? StoryPlanSchema.parse(body.storyPlan) : null;
    const characterCard = body.characterCard ? CharacterCardV2Schema.parse(body.characterCard) : null;
    const lorebooks = LorebookSchema.array().parse(body.lorebooks ?? []);
    const analyses = PlotAnalysisProjectSchema.array().parse(body.analyses ?? []);
    const type = ProviderTypeSchema.catch(getDefaultProviderType()).parse(body.provider);
    const provider = createProvider({ type });
    const result = await generateProse({ manuscript, request: proseRequest, chapterPlanning, storyPlan, characterCard, lorebooks, analyses, provider, model: String(body.model || provider.defaultModel), timeoutMs: Number(process.env.API_TIMEOUT_MS || 60000), abortSignal: request.signal });
    return NextResponse.json({ success: true, data: result.sceneDraft, context: result.context, generatedText: result.generatedText, meta: { model: result.model, retriesUsed: result.retriesUsed, incomplete: result.incomplete } });
  } catch (error) {
    if (error instanceof GenerationError) return NextResponse.json({ error: error.message, code: error.code }, { status: { timeout: 504, cancelled: 499, provider_error: 502, validation_error: 422, parse_error: 422 }[error.code] });
    return NextResponse.json({ error: `正文服务错误：${(error as Error).message}` }, { status: 500 });
  }
}
