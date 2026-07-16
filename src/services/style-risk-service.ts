import { z } from "zod";
import { createStableId } from "@/domain/lorebook";
import {
  STYLE_RISK_DISCLAIMER, STYLE_RISK_PROMPT_VERSION, StyleRiskAnalysisReportSchema, StyleRiskAnalysisRequestSchema,
  StyleRiskComparisonSchema, StyleRiskIssueSchema, type StyleRiskAnalysisReport, type StyleRiskAnalysisRequest,
} from "@/domain/style-risk";
import type { DraftVersion, EditScope, Revision, SceneDraft } from "@/domain/prose";
import type { IProviderAdapter } from "@/providers/types";
import { buildStyleRiskModelPrompt } from "@/prompts/style-risk-v1";
import { appendRevisionProposal, createRevisionProposal } from "@/services/prose-editing";
import { analyzeStyleRiskDeterministically, mapExcerptToRange } from "@/services/style-risk-analysis";

const ModelIssueSchema = z.object({
  category: z.enum(["over_explanation", "smooth_emotion", "dialogue_homogenization", "dialogue_exposition", "generic_metaphor", "abstract_narration", "fast_conflict_resolution", "information_uniformity", "style_deviation", "character_voice_deviation", "opportunity"]),
  title: z.string(), severity: z.enum(["major", "moderate", "minor", "note"]).default("moderate"), confidence: z.enum(["high", "medium", "low"]).default("medium"),
  excerpt: z.string().max(160).default(""), conclusion: z.string(), evidence: z.array(z.string()).default([]), explanation: z.string().default(""),
  minimumRevision: z.string().default(""), alternatives: z.array(z.string()).default([]), possibleSideEffects: z.array(z.string()).default([]),
});
const ModelOutputSchema = z.object({ issues: z.array(ModelIssueSchema).max(30).default([]) });

function extractJson(text: string): unknown {
  const trimmed = text.trim(); try { return JSON.parse(trimmed); } catch { /* extract below */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]; if (fenced) return JSON.parse(fenced);
  const start = trimmed.indexOf("{"); const end = trimmed.lastIndexOf("}"); if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("模型未返回有效 JSON。");
}

export async function analyzeStyleRisk(raw: Partial<StyleRiskAnalysisRequest> & Pick<StyleRiskAnalysisRequest, "text">, options?: { provider?: IProviderAdapter; model?: string; abortSignal?: AbortSignal; timeoutMs?: number }): Promise<StyleRiskAnalysisReport> {
  const request = StyleRiskAnalysisRequestSchema.parse(raw); const deterministic = analyzeStyleRiskDeterministically(request);
  if (!request.useModel || !options?.provider) return deterministic;
  try {
    const prompt = buildStyleRiskModelPrompt(request, deterministic); const timeout = options.timeoutMs ?? 60_000;
    const response = await Promise.race([
      options.provider.generate({ ...prompt, model: options.model ?? options.provider.defaultModel, responseFormat: "json", abortSignal: options.abortSignal }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("模型分析超时。")), timeout)),
    ]);
    const parsed = ModelOutputSchema.parse(extractJson(response.content));
    const modelIssues = parsed.issues.map((item) => StyleRiskIssueSchema.parse({
      id: createStableId("style_issue_model"), dataVersion: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      ...item, textRange: mapExcerptToRange(request.text, item.excerpt, request.scopeType), metricValues: {}, baselineValues: {}, isDeterministic: false,
      sourceReferences: [], status: "open", possibleSideEffects: item.possibleSideEffects.length ? item.possibleSideEffects : ["模型建议可能削弱人物声音或有效留白，应人工判断。"],
    }));
    const risks = { ...deterministic.dimensionRisks };
    if (modelIssues.some((item) => item.category === "over_explanation")) risks.overExplanation = Math.max(risks.overExplanation, 55);
    if (modelIssues.some((item) => item.category === "dialogue_homogenization")) risks.dialogueHomogeneity = Math.max(risks.dialogueHomogeneity, 55);
    return StyleRiskAnalysisReportSchema.parse({ ...deterministic, issues: [...deterministic.issues, ...modelIssues], dimensionRisks: risks, modelStatus: "completed", promptVersion: STYLE_RISK_PROMPT_VERSION, disclaimer: STYLE_RISK_DISCLAIMER });
  } catch (error) {
    const cancelled = options.abortSignal?.aborted;
    return StyleRiskAnalysisReportSchema.parse({ ...deterministic, modelStatus: cancelled ? "cancelled" : "failed", warnings: [...deterministic.warnings, cancelled ? "模型分析已取消；确定性结果仍然可用。" : `模型辅助分析不可用；已保留确定性结果。${error instanceof Error ? ` ${error.message}` : ""}`] });
  }
}

export function createStyleRiskRevision(args: { sceneDraft: SceneDraft; baseVersion: DraftVersion; replacement: string; scope: EditScope; issueIds: string[]; instruction: string; provider?: Revision["provider"]; model?: string }): { sceneDraft: SceneDraft; revision: Revision } {
  const proposal = createRevisionProposal({
    sceneDraft: args.sceneDraft, baseVersion: args.baseVersion, replacement: args.replacement, scope: args.scope,
    operationType: "custom_revision", instruction: `AI 味与机械感局部优化：${args.instruction}`, promptVersion: STYLE_RISK_PROMPT_VERSION,
    provider: args.provider ?? "user", model: args.model ?? "", sourceVersions: { styleRiskIssueIds: args.issueIds.join(",") },
  });
  return { sceneDraft: appendRevisionProposal(args.sceneDraft, proposal), revision: proposal.revision };
}

export function compareStyleRiskReports(beforeRequest: Partial<StyleRiskAnalysisRequest> & Pick<StyleRiskAnalysisRequest, "text">, afterRequest: Partial<StyleRiskAnalysisRequest> & Pick<StyleRiskAnalysisRequest, "text">) {
  const before = analyzeStyleRiskDeterministically(beforeRequest); const after = analyzeStyleRiskDeterministically(afterRequest);
  const beforeCategories = new Map(before.issues.map((item) => [item.category, item.id])); const afterCategories = new Map(after.issues.map((item) => [item.category, item.id]));
  const metric = (report: StyleRiskAnalysisReport, key: string) => report.metrics.find((item) => item.key === key)?.value ?? 0;
  return StyleRiskComparisonSchema.parse({
    beforeReportId: before.id, afterReportId: after.id, beforeOverallScore: before.overallScore, afterOverallScore: after.overallScore,
    dimensionChanges: Object.fromEntries(Object.keys(before.dimensionRisks).map((key) => [key, after.dimensionRisks[key as keyof typeof after.dimensionRisks] - before.dimensionRisks[key as keyof typeof before.dimensionRisks]])),
    metricChanges: Object.fromEntries(["repeatedNgrams", "averageSentenceLength", "abstractEmotionDensity", "concreteActionSensoryDensity", "dialogueRatio", "constraintViolations"].map((key) => [key, metric(after, key) - metric(before, key)])),
    newIssueIds: [...afterCategories].filter(([category]) => !beforeCategories.has(category)).map(([, id]) => id),
    resolvedIssueIds: [...beforeCategories].filter(([category]) => !afterCategories.has(category)).map(([, id]) => id),
    unchangedIssueIds: [...beforeCategories].filter(([category]) => afterCategories.has(category)).map(([, id]) => id),
    warning: "指标下降不等于文本质量一定提高；过度优化可能损害人物声音和节奏，用户应优先判断创作效果。",
  });
}
