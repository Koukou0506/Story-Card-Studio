import type { CharacterCardV2 } from "@/domain/character-card";
import type { ChapterPlanningProject, ChapterPlan, ChapterPlanVersion, ScenePlan, ScenePlanVersion } from "@/domain/chapter-planning";
import type { Lorebook } from "@/domain/lorebook";
import type { PlotAnalysisProject } from "@/domain/plot-analysis";
import type { Manuscript, ProseGenerationRequest, ProseSourceReference, SceneDraft } from "@/domain/prose";
import type { StoryPlan } from "@/domain/story-planning";
import { blocksToText } from "./prose-editing";

export interface ProseContextSource extends ProseSourceReference {
  content: string;
  included: boolean;
  reason: string;
  estimatedTokens: number;
}

export interface ProseContext {
  sources: ProseContextSource[];
  selectedSourceIds: string[];
  estimatedTokens: number;
  tokenBudget: number;
  truncated: boolean;
  truncationWarnings: string[];
  createdAt: string;
}

export interface ProseContextInput {
  manuscript: Manuscript;
  request: ProseGenerationRequest;
  chapterPlanning: ChapterPlanningProject;
  storyPlan?: StoryPlan | null;
  characterCard?: CharacterCardV2 | null;
  lorebooks?: Lorebook[];
  analyses?: PlotAnalysisProject[];
}

const estimate = (value: string) => value.length ? Math.max(1, Math.ceil(value.length / 4)) : 0;

function locate(input: ProseContextInput): { draft: SceneDraft; chapter: ChapterPlan; chapterVersion: ChapterPlanVersion; scene: ScenePlan; sceneVersion: ScenePlanVersion } {
  const draft = input.manuscript.chapterDrafts.flatMap((item) => item.sceneDrafts).find((item) => item.id === input.request.sceneDraftId);
  if (!draft) throw new Error("正文场景不存在。");
  const chapterDraft = input.manuscript.chapterDrafts.find((item) => item.id === draft.chapterDraftId);
  for (const volume of input.chapterPlanning.volumes) for (const chapter of volume.chapters) {
    const chapterVersion = chapter.versions.find((item) => item.id === chapterDraft?.b2ChapterVersionId)
      ?? chapter.versions.find((item) => item.id === chapter.selectedVersionId) ?? chapter.versions[0];
    if (!chapterVersion) continue;
    const scene = chapterVersion.scenes.find((item) => item.id === draft.scenePlanId);
    if (!scene) continue;
    const sceneVersion = scene.versions.find((item) => item.id === draft.b2SceneVersionId)
      ?? scene.versions.find((item) => item.id === scene.selectedVersionId) ?? scene.versions[0];
    if (sceneVersion) return { draft, chapter, chapterVersion, scene, sceneVersion };
  }
  throw new Error("正文场景引用的 B2 场景版本不存在。");
}

function source(value: Omit<ProseContextSource, "estimatedTokens">): ProseContextSource {
  return { ...value, estimatedTokens: estimate(value.content) };
}

function keywords(value: string): string[] {
  return [...new Set(value.match(/[\p{L}\p{N}]{2,}/gu) ?? [])].slice(0, 60);
}

function previousText(input: ProseContextInput, draft: SceneDraft): string {
  const current = draft.versions.find((item) => item.id === input.request.baseVersionId);
  const text = current ? blocksToText(current.blocks) : "";
  const mode = input.request.settings.previousTextMode;
  if (mode === "manual") return input.request.settings.manualPreviousText;
  if (mode === "near_cursor") {
    const point = input.request.scope.start ?? text.length;
    return text.slice(Math.max(0, point - 1600), point);
  }
  if (mode === "scene") return text;
  const chapterDraft = input.manuscript.chapterDrafts.find((item) => item.id === draft.chapterDraftId);
  if (mode === "chapter_summary") return chapterDraft?.summary || text.slice(-1200);
  const ordered = chapterDraft?.sceneDrafts.slice().sort((a, b) => a.order - b.order) ?? [];
  const before = ordered.filter((item) => item.order < draft.order).at(-1);
  const beforeVersion = before?.versions.find((item) => item.id === before.acceptedVersionId) ?? before?.versions.at(-1);
  const ending = beforeVersion ? blocksToText(beforeVersion.blocks).slice(-1600) : "";
  return mode === "previous_scene_ending" ? ending : `${ending}\n${text.slice(-1600)}`.trim();
}

export function buildProseContext(input: ProseContextInput): ProseContext {
  const { draft, chapter, chapterVersion, scene, sceneVersion } = locate(input);
  const now = new Date().toISOString();
  const sources: ProseContextSource[] = [];
  const push = (item: Omit<ProseContextSource, "estimatedTokens">) => item.content.trim() && sources.push(source(item));
  push({ sourceType: "scene_plan", sourceId: scene.id, sourceName: sceneVersion.title, field: "scene", content: JSON.stringify({ goal: sceneVersion.sceneGoal, time: sceneVersion.time, location: sceneVersion.location, pov: sceneVersion.pov, characters: sceneVersion.presentCharacterIds, conflict: sceneVersion.conflictType, trigger: sceneVersion.trigger, action: sceneVersion.action, turn: sceneVersion.turningPoint, result: sceneVersion.result, exit: sceneVersion.exitState, information: sceneVersion.informationChanges, relationships: sceneVersion.relationshipChanges, sensory: sceneVersion.sensoryFocus, dialogue: sceneVersion.dialogueFunction, words: sceneVersion.estimatedWords }), excerpt: sceneVersion.sceneGoal, version: sceneVersion.id, authority: 1, locked: scene.locked, allowModelChange: false, valid: true, included: true, reason: "当前场景计划是生成的直接约束" });
  push({ sourceType: "chapter_plan", sourceId: chapter.id, sourceName: chapterVersion.title, field: "chapter", content: JSON.stringify({ goal: chapterVersion.chapterGoal, conflict: chapterVersion.mainConflict, pov: chapterVersion.pov, result: chapterVersion.result, hook: chapterVersion.hook }), excerpt: chapterVersion.chapterGoal, version: chapterVersion.id, authority: 2, locked: chapter.locked, allowModelChange: false, valid: true, included: true, reason: "当前章节约束" });
  push({ sourceType: "scene_entry_state", sourceId: sceneVersion.entryState.id, sourceName: "当前场景入口状态", field: "entryState", content: JSON.stringify(sceneVersion.entryState), excerpt: sceneVersion.entryState.location, version: sceneVersion.id, authority: 1, locked: true, allowModelChange: false, valid: true, included: true, reason: "连续性硬约束" });
  push({ sourceType: "scene_exit_state", sourceId: sceneVersion.exitState.id, sourceName: "计划离场状态", field: "exitState", content: JSON.stringify(sceneVersion.exitState), excerpt: sceneVersion.exitState.location, version: sceneVersion.id, authority: 2, locked: false, allowModelChange: false, valid: true, included: true, reason: "正文应覆盖的计划结果" });

  const variant = input.storyPlan?.variants.find((item) => item.id === input.chapterPlanning.b1VariantId);
  for (const beatId of sceneVersion.b1PlotBeatIds) {
    const beat = variant?.outline.beats.find((item) => item.id === beatId);
    if (beat) push({ sourceType: "plot_beat", sourceId: beat.id, sourceName: beat.title, field: "plotBeat", content: JSON.stringify(beat), excerpt: beat.summary, version: beat.modifiedAt, authority: 2, locked: beat.locked, allowModelChange: false, valid: true, included: true, reason: "B1 宏观节点" });
  }

  const characterIds = new Set([...sceneVersion.presentCharacterIds, ...sceneVersion.pov.povCharacterIds]);
  if (input.characterCard?.data.name && (characterIds.size === 0 || characterIds.has(input.characterCard.data.name))) {
    push({ sourceType: "character_card", sourceId: input.characterCard.data.name, sourceName: input.characterCard.data.name, field: "data", content: JSON.stringify({ description: input.characterCard.data.description, personality: input.characterCard.data.personality, scenario: input.characterCard.data.scenario, examples: input.characterCard.data.mes_example }), excerpt: input.characterCard.data.personality, version: input.characterCard.data.character_version, authority: 2, locked: true, allowModelChange: false, valid: true, included: true, reason: "视角或在场角色卡" });
  }

  const relevanceText = JSON.stringify(sceneVersion) + " " + input.request.instruction;
  const keys = keywords(relevanceText);
  for (const book of input.lorebooks ?? []) for (const entry of book.entries) {
    const relevant = entry.enabled && (entry.activation.constant || entry.activation.primaryKeys.some((key) => relevanceText.includes(key)) || keys.some((key) => entry.name.includes(key)));
    if (relevant) push({ sourceType: "lorebook", sourceId: entry.id, sourceName: entry.name, field: "content", content: entry.content, excerpt: entry.content.slice(0, 120), version: book.metadata.modifiedAt, authority: 3, locked: false, allowModelChange: false, valid: true, included: true, reason: "按场景实体与关键词筛选" });
  }
  for (const item of input.chapterPlanning.informationItems.filter((item) => sceneVersion.informationRevealIds.some((id) => input.chapterPlanning.informationReveals.find((reveal) => reveal.id === id)?.informationItemId === item.id))) {
    push({ sourceType: "information", sourceId: item.id, sourceName: item.title, field: "information", content: JSON.stringify(item), excerpt: item.content, version: item.modifiedAt, authority: 2, locked: true, allowModelChange: false, valid: true, included: true, reason: "当前场景信息流" });
  }
  for (const item of input.chapterPlanning.foreshadows.filter((item) => sceneVersion.foreshadowSetupIds.includes(item.id) || sceneVersion.foreshadowPayoffIds.includes(item.id))) {
    push({ sourceType: "foreshadow", sourceId: item.id, sourceName: item.label, field: "foreshadow", content: JSON.stringify(item), excerpt: item.expectedEffect, version: item.modifiedAt, authority: 3, locked: false, allowModelChange: false, valid: true, included: true, reason: "当前场景铺垫或回收" });
  }
  const style = input.manuscript.styleProfiles.find((item) => item.id === input.request.settings.styleProfileId) ?? input.manuscript.styleProfiles.find((item) => item.id === input.manuscript.defaultStyleProfileId);
  if (style) push({ sourceType: "style_profile", sourceId: style.id, sourceName: style.name, field: "style", content: JSON.stringify(style), excerpt: style.overallTone, version: style.modifiedAt, authority: 3, locked: true, allowModelChange: false, valid: true, included: true, reason: "用户选择的抽象风格配置" });
  for (const rule of input.manuscript.languageConstraints.filter((item) => item.enabled && (!input.request.settings.languageConstraintIds.length || input.request.settings.languageConstraintIds.includes(item.id)))) {
    push({ sourceType: "language_constraint", sourceId: rule.id, sourceName: rule.name, field: rule.strictness, content: rule.content, excerpt: rule.content, version: rule.modifiedAt, authority: rule.strictness === "hard" ? 1 : 3, locked: rule.locked, allowModelChange: false, valid: true, included: true, reason: `${rule.strictness} 语言规则` });
  }
  const history = previousText(input, draft);
  push({ sourceType: "previous_prose", sourceId: input.request.baseVersionId, sourceName: "必要前文", field: input.request.settings.previousTextMode, content: history, excerpt: history.slice(-120), version: input.request.baseVersionId, authority: 2, locked: true, allowModelChange: false, valid: true, included: true, reason: "按前文选择策略提供" });
  push({ sourceType: "user_instruction", sourceId: input.request.sceneDraftId, sourceName: "本次修改要求", field: input.request.settings.mode, content: JSON.stringify({ instruction: input.request.instruction, scope: input.request.scope }), excerpt: input.request.instruction, version: now, authority: 1, locked: true, allowModelChange: false, valid: true, included: true, reason: "用户本次明确要求" });

  const budget = input.request.settings.contextBudget || input.manuscript.tokenBudget;
  let used = 0;
  let truncated = false;
  for (const item of sources.sort((a, b) => a.authority - b.authority)) {
    if (used + item.estimatedTokens <= budget) used += item.estimatedTokens;
    else if (item.authority <= 2) {
      const remaining = Math.max(0, budget - used);
      item.content = remaining > 0 ? item.content.slice(0, remaining * 4) : "";
      item.estimatedTokens = estimate(item.content);
      item.included = item.estimatedTokens > 0;
      used += item.estimatedTokens;
      truncated = true;
    } else { item.included = false; item.reason += "；因预算裁剪"; truncated = true; }
  }
  return { sources, selectedSourceIds: sources.filter((item) => item.included).map((item) => item.sourceId), estimatedTokens: used, tokenBudget: budget, truncated, truncationWarnings: truncated ? ["上下文超出预算：已优先保留选区附近文本、入口/出口状态、视角与关键设定，较远正文或低相关资料被裁剪。"] : [], createdAt: now };
}
