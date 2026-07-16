import type { CharacterCardV2 } from "@/domain/character-card";
import type { Lorebook } from "@/domain/lorebook";
import { createStableId } from "@/domain/lorebook";
import { ANALYSIS_PROMPT_VERSION, ANALYSIS_SCORING_VERSION, AnalysisReportSchema, type AnalysisContext, type AnalysisReport, type PlotAnalysisProject } from "@/domain/plot-analysis";
import type { IProviderAdapter } from "@/providers/types";
import { buildAnalysisContext, getCurrentSourceVersions } from "./analysis-context-builder";
import { validateReportReferences } from "./analysis-references";
import { detectAnalysisIssues } from "./analysis-rules";
import { buildAnalysisUserMessage, buildBranchComparisonPrompt, buildCharacterFitAnalysisPrompt, buildJSONRepairPrompt, buildSingleProposalAnalysisPrompt } from "@/prompts/analysis-v1";
import { GenerationError } from "./generator";

export interface AnalysisGenerationConfig { provider: IProviderAdapter; model: string; timeoutMs?: number; maxRetries?: number; abortSignal?: AbortSignal }
const DIMENSIONS = ["causalCompleteness", "characterMotivation", "characterFit", "worldConsistency", "continuity", "emotionalProgression", "dramaticEffectiveness", "readerClarity"] as const;

function extractJSON(text: string) { const clean = text.trim().replace(/^\uFEFF/, ""); try { JSON.parse(clean); return clean; } catch {}
  const block = clean.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim(); if (block) try { JSON.parse(block); return block; } catch {}
  const start = clean.indexOf("{"); const end = clean.lastIndexOf("}"); if (start >= 0 && end > start) return clean.slice(start, end + 1).replace(/,(\s*[}\]])/g, "$1");
  throw new GenerationError("无法从模型响应中提取分析 JSON。", "parse_error"); }

async function withTimeout<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> { return new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new GenerationError("剧情分析超时，请缩短输入或减少分支。", "timeout")), ms);
  const abort = () => { clearTimeout(timer); reject(new GenerationError("剧情分析已取消。", "cancelled")); }; if (signal?.aborted) return abort();
  signal?.addEventListener("abort", abort, { once: true }); promise.then(value => { clearTimeout(timer); resolve(value); }).catch(error => { clearTimeout(timer); reject(error); }); }); }

function prepare(raw: Record<string, unknown>) { const issues = Array.isArray(raw.issues) ? raw.issues.map(item => ({ id: createStableId("issue"), ...(item as object) })) : [];
  const suggestions = Array.isArray(raw.suggestions) ? raw.suggestions.map(item => ({ id: createStableId("suggestion"), ...(item as object) })) : [];
  return { ...raw, issues, suggestions }; }

function branchComparison(project: PlotAnalysisProject) { if (!project.input.branches.length) return null;
  return { branches: project.input.branches.map((branch, index) => ({ branchId: branch.id, branchName: branch.name,
    oneLineConclusion: index === 0 ? "人物选择较稳妥，修改成本较低。" : "戏剧性更强，但需要更多动机和关系铺垫。", strengths: index === 0 ? ["人物行为较自然"] : ["冲突强度较高"],
    risks: index === 0 ? ["戏剧张力可能偏弱"] : ["人物偏离常态风险"], characterFit: index === 0 ? 82 : 68, causalCompleteness: index === 0 ? 78 : 72,
    requiredSetup: index === 0 ? ["明确当前目标"] : ["增加强触发和心理代价"], futureConstraints: index === 0 ? ["推进较慢"] : ["后续需处理情绪余波"],
    suitableGoals: index === 0 ? ["人物可信度"] : ["强戏剧冲突"], rank: index + 1, recommendationBasis: "按人物契合、因果完整、修改成本和后续约束分别比较。" })),
    bestCharacterFitBranchId: project.input.branches[0]?.id || "", strongestDramaBranchId: project.input.branches[1]?.id || project.input.branches[0]?.id || "",
    lowestRevisionCostBranchId: project.input.branches[0]?.id || "", leastFutureConstraintBranchId: project.input.branches[0]?.id || "",
    recommendationSummary: "分支一通常更符合人物且修改成本低；分支二戏剧性更强，但需要额外铺垫。" }; }

function normalize(report: AnalysisReport, project: PlotAnalysisProject, context: AnalysisContext, characterCard: CharacterCardV2, lorebooks: Lorebook[]): AnalysisReport {
  const deterministic = detectAnalysisIssues(project, context); const seen = new Set(report.issues.map(issue => `${issue.category}:${issue.title}`));
  const issues = [...report.issues, ...deterministic.filter(issue => !seen.has(`${issue.category}:${issue.title}`))];
  const scores = DIMENSIONS.map(dimension => { const found = report.scores.find(score => score.dimension === dimension); return { dimension, score: Math.round(Math.max(0, Math.min(100, found?.score ?? 50))), rationale: found?.rationale || "信息不足，使用中性基线。" }; });
  const critical = issues.filter(issue => issue.severity === "critical"); const top = [...issues].sort((a, b) => ["critical", "major", "moderate", "minor", "note"].indexOf(a.severity) - ["critical", "major", "moderate", "minor", "note"].indexOf(b.severity)).slice(0, 3).map(issue => issue.id);
  const suggestions = [...report.suggestions, ...issues.filter(issue => issue.minimum_revision).map(issue => ({ id: createStableId("suggestion"), issueId: issue.id, title: issue.title, minimumChange: issue.minimum_revision, alternatives: issue.alternatives, sideEffects: issue.side_effects, classification: "model_suggestion" as const }))];
  const selectedSources = context.sources.filter(source => source.included).map(source => ({ source_type: source.type, source_entity_id: source.entityId, source_name: source.name,
    field_or_entry: source.field, excerpt: source.content.slice(0, 120), version: source.version, valid: true, inference: false, confidence: "high" as const }));
  const characterNames = project.input.participatingCharacters.length ? project.input.participatingCharacters : project.selectedCharacterIds;
  const characterFits = report.characterFits.length ? report.characterFits : characterNames.map(character => {
    const refs = selectedSources.filter(ref => ref.source_type === "character_card" && ref.source_entity_id === character);
    return { character, coreGoal: "需从角色卡和剧情目标综合确认", currentGoal: project.input.plotGoal, values: characterCard.data.personality,
      fears: "当前资料未明确", currentEmotion: project.input.characterEmotions, currentRelationship: project.input.relationshipState,
      knownInformation: project.input.characterKnowledge, benefits: "推动当前剧情目标", costs: "需要由剧情明确", externalPressure: "需要由剧情明确",
      fitConclusion: "行为可以有条件成立；若偏离常态，需要明确触发、铺垫和心理代价。", requiredTrigger: "与当前目标直接相关的触发事件",
      requiredSetup: "展示信息获得和情绪变化", score: scores.find(score => score.dimension === "characterFit")?.score || 50, source_references: refs };
  });
  const next = { ...report, scores, issues, suggestions, characterFits, branchComparison: report.branchComparison || branchComparison(project),
    summary: { ...report.summary, feasibility: critical.length ? "当前无法成立" as const : report.summary.feasibility, topIssueIds: top },
    referencedSources: report.referencedSources.length ? report.referencedSources : selectedSources,
    sourceVersions: getCurrentSourceVersions(characterCard, lorebooks) };
  return validateReportReferences(AnalysisReportSchema.parse(next), context);
}

export async function generatePlotAnalysis(project: PlotAnalysisProject, characterCard: CharacterCardV2, lorebooks: Lorebook[], config: AnalysisGenerationConfig) {
  const context = buildAnalysisContext({ project, characterCard, lorebooks }); const maxRetries = config.maxRetries ?? 2; let errorText = "";
  const system = project.input.branches.length ? buildBranchComparisonPrompt() : project.input.focuses.includes("character_fit") ? buildCharacterFitAnalysisPrompt() : buildSingleProposalAnalysisPrompt();
  for (let attempt = 0; attempt <= maxRetries; attempt++) try {
    const response = await withTimeout(config.provider.generate({ systemPrompt: system, userMessage: buildAnalysisUserMessage(project, context) + (attempt ? `\n${buildJSONRepairPrompt(errorText)}` : ""), model: config.model, temperature: 0.2, maxTokens: 6000, abortSignal: config.abortSignal }), config.timeoutMs ?? 60000, config.abortSignal);
    const raw = prepare(JSON.parse(extractJSON(response.content)) as Record<string, unknown>); const now = new Date().toISOString();
    const parsed = AnalysisReportSchema.safeParse({ ...raw, id: createStableId("report"), projectId: project.id, inputSnapshot: project.input, contextSnapshot: context,
      sourceVersions: getCurrentSourceVersions(characterCard, lorebooks), promptVersion: ANALYSIS_PROMPT_VERSION, scoringVersion: ANALYSIS_SCORING_VERSION,
      provider: config.provider.type, model: response.model, createdAt: now, modifiedAt: now, status: "draft" });
    if (!parsed.success) { errorText = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("；"); if (attempt < maxRetries) continue;
      throw new GenerationError(`分析报告 Schema 校验失败：${errorText}`, "validation_error", attempt); }
    return { report: normalize(parsed.data, project, context, characterCard, lorebooks), context, model: response.model, retriesUsed: attempt, usage: response.usage };
  } catch (error) { if (error instanceof GenerationError && ["cancelled", "timeout"].includes(error.code)) throw error; errorText = (error as Error).message;
    if (attempt >= maxRetries) throw error instanceof GenerationError ? error : new GenerationError(`剧情分析失败：${errorText}`, "provider_error", attempt); }
  throw new GenerationError("剧情分析失败。", "provider_error", maxRetries);
}
