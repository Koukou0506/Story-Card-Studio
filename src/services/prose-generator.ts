import type { CharacterCardV2 } from "@/domain/character-card";
import type { ChapterPlanningProject, ScenePlanVersion } from "@/domain/chapter-planning";
import type { Lorebook } from "@/domain/lorebook";
import type { PlotAnalysisProject } from "@/domain/plot-analysis";
import { PROSE_PROMPT_VERSION, type Manuscript, type ProseGenerationRequest, type SceneDraft } from "@/domain/prose";
import type { StoryPlan } from "@/domain/story-planning";
import { buildProseSystemPrompt, buildProseUserMessage } from "@/prompts/prose-v1";
import type { IProviderAdapter } from "@/providers/types";
import { GenerationError } from "./generator";
import { analyzeScenePlanCoverage, extractCandidateFacts, extractCandidateStateChanges } from "./prose-analysis";
import { buildProseContext, type ProseContext } from "./prose-context-builder";
import { appendRevisionProposal, createRevisionProposal, validateEditScope } from "./prose-editing";
import { validateProse } from "./prose-validator";

export interface ProseGenerationArgs {
  manuscript: Manuscript;
  request: ProseGenerationRequest;
  chapterPlanning: ChapterPlanningProject;
  storyPlan?: StoryPlan | null;
  characterCard?: CharacterCardV2 | null;
  lorebooks?: Lorebook[];
  analyses?: PlotAnalysisProject[];
  provider: IProviderAdapter;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
  abortSignal?: AbortSignal;
}

export interface ProseGenerationResult {
  sceneDraft: SceneDraft;
  context: ProseContext;
  generatedText: string;
  model: string;
  retriesUsed: number;
  incomplete: boolean;
}

function findScenePlanVersion(args: ProseGenerationArgs): ScenePlanVersion {
  const draft = args.manuscript.chapterDrafts.flatMap((item) => item.sceneDrafts).find((item) => item.id === args.request.sceneDraftId);
  if (!draft) throw new GenerationError("正文场景不存在。", "validation_error");
  for (const volume of args.chapterPlanning.volumes) for (const chapter of volume.chapters) for (const chapterVersion of chapter.versions) {
    const scene = chapterVersion.scenes.find((item) => item.id === draft.scenePlanId);
    if (!scene) continue;
    const version = scene.versions.find((item) => item.id === draft.b2SceneVersionId) ?? scene.versions.find((item) => item.id === scene.selectedVersionId) ?? scene.versions[0];
    if (version) return version;
  }
  throw new GenerationError("B2 Scene Plan 版本不存在。", "validation_error");
}

function timeout<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new GenerationError("正文生成超时，原稿未被修改。", "timeout")), timeoutMs);
    const cancel = () => { clearTimeout(timer); reject(new GenerationError("正文生成已取消，原稿未被修改。", "cancelled")); };
    if (signal?.aborted) return cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    promise.then((value) => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); resolve(value); }, (error) => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); reject(error); });
  });
}

function cleanProse(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:text|markdown)?\s*([\s\S]*?)```$/i)?.[1];
  return (fenced ?? trimmed).trim();
}

function finalize(args: ProseGenerationArgs, context: ProseContext, text: string, model: string, retriesUsed: number, incomplete = false): ProseGenerationResult {
  const sceneDraft = args.manuscript.chapterDrafts.flatMap((item) => item.sceneDrafts).find((item) => item.id === args.request.sceneDraftId)!;
  const base = sceneDraft.versions.find((item) => item.id === args.request.baseVersionId);
  if (!base) throw new GenerationError("当前正文基础版本不存在。", "validation_error");
  const proposal = createRevisionProposal({
    sceneDraft, baseVersion: base, replacement: text, scope: args.request.scope,
    operationType: args.request.settings.mode, instruction: args.request.instruction,
    promptVersion: PROSE_PROMPT_VERSION, provider: args.provider.type, model,
    sourceVersions: { b2Project: args.chapterPlanning.modifiedAt, b2Chapter: args.manuscript.chapterDrafts.find((item) => item.id === sceneDraft.chapterDraftId)?.b2ChapterVersionId ?? "", b2Scene: sceneDraft.b2SceneVersionId },
    incomplete,
  });
  const usedSources = context.sources.filter((item) => item.included).map(({ content: _content, included: _included, reason: _reason, estimatedTokens: _estimatedTokens, ...reference }) => reference);
  proposal.version.sources = usedSources;
  proposal.revision.sources = usedSources;
  const plan = findScenePlanVersion(args);
  const coverage = analyzeScenePlanCoverage(sceneDraft.id, text, plan);
  const candidateFacts = extractCandidateFacts(sceneDraft.id, proposal.version.id, text, context);
  const candidateStateChanges = extractCandidateStateChanges(sceneDraft.id, proposal.version.id, text, plan);
  const constraints = args.manuscript.languageConstraints.filter((item) => item.enabled && (!args.request.settings.languageConstraintIds.length || args.request.settings.languageConstraintIds.includes(item.id)));
  const next = appendRevisionProposal(sceneDraft, proposal);
  next.coverage = coverage;
  next.candidateFacts = candidateFacts;
  next.candidateStateChanges = candidateStateChanges;
  next.issues = validateProse({ sceneDraft: next, versionId: proposal.version.id, text, plan, coverage, constraints, candidateFacts });
  next.incomplete = incomplete;
  next.status = incomplete ? "incomplete" : "alternative";
  return { sceneDraft: next, context, generatedText: text, model, retriesUsed, incomplete };
}

export async function generateProse(args: ProseGenerationArgs): Promise<ProseGenerationResult> {
  const base = args.manuscript.chapterDrafts.flatMap((item) => item.sceneDrafts).find((item) => item.id === args.request.sceneDraftId)?.versions.find((item) => item.id === args.request.baseVersionId);
  if (!base) throw new GenerationError("当前正文基础版本不存在。", "validation_error");
  validateEditScope(base, args.request.scope);
  const context = buildProseContext(args);
  let lastError = "";
  for (let attempt = 0; attempt <= (args.maxRetries ?? 1); attempt += 1) {
    try {
      const response = await timeout(args.provider.generate({
        systemPrompt: buildProseSystemPrompt(args.request.settings.mode),
        userMessage: buildProseUserMessage(args.request, context), model: args.model,
        temperature: args.request.settings.temperature, maxTokens: args.request.settings.maxTokens,
        stopSequences: args.request.settings.stopSequences, responseFormat: "text", abortSignal: args.abortSignal,
      }), args.timeoutMs ?? 60000, args.abortSignal);
      const text = cleanProse(response.content);
      if (!text) throw new GenerationError("Provider 返回了空正文。", "validation_error", attempt);
      return finalize(args, context, text, response.model, attempt);
    } catch (error) {
      if (error instanceof GenerationError && ["timeout", "cancelled", "validation_error"].includes(error.code)) throw error;
      lastError = (error as Error).message;
      if (attempt >= (args.maxRetries ?? 1)) throw new GenerationError(`正文生成失败：${lastError}。原稿已保留。`, "provider_error", attempt);
    }
  }
  throw new GenerationError("正文生成失败。", "provider_error");
}

export async function generateProseStream(args: ProseGenerationArgs, onChunk?: (temporaryText: string) => void): Promise<ProseGenerationResult> {
  const base = args.manuscript.chapterDrafts.flatMap((item) => item.sceneDrafts).find((item) => item.id === args.request.sceneDraftId)?.versions.find((item) => item.id === args.request.baseVersionId);
  if (!base) throw new GenerationError("当前正文基础版本不存在。", "validation_error");
  validateEditScope(base, args.request.scope);
  if (!args.provider.generateStream) return generateProse(args);
  const context = buildProseContext(args);
  let text = ""; let incomplete = false;
  try {
    const stream = args.provider.generateStream({ systemPrompt: buildProseSystemPrompt(args.request.settings.mode), userMessage: buildProseUserMessage(args.request, context), model: args.model, temperature: args.request.settings.temperature, maxTokens: args.request.settings.maxTokens, stopSequences: args.request.settings.stopSequences, responseFormat: "text", abortSignal: args.abortSignal });
    for await (const chunk of stream) { text += chunk; onChunk?.(text); if (args.abortSignal?.aborted) { incomplete = true; break; } }
  } catch (error) {
    if (!text) throw new GenerationError(`流式生成失败：${(error as Error).message}。原稿已保留。`, "provider_error");
    incomplete = true;
  }
  if (!text) throw new GenerationError("流式生成已取消，未产生可保留内容。", "cancelled");
  return finalize(args, context, cleanProse(text), args.model, 0, incomplete || Boolean(args.abortSignal?.aborted));
}
