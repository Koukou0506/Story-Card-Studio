import type { CharacterCardV2 } from "@/domain/character-card";
import {
  ChapterPlanningProjectSchema,
  createEmptyChapterVersion,
  createEmptySceneVersion,
  type ChapterPlan,
  type ChapterPlanningProject,
  type ScenePlan,
  type VolumePlan,
} from "@/domain/chapter-planning";
import type { Lorebook } from "@/domain/lorebook";
import type { PlotAnalysisProject } from "@/domain/plot-analysis";
import type { StoryPlan } from "@/domain/story-planning";
import {
  buildAlternativeChapterPrompt,
  buildChapterPlanningRepairPrompt,
  buildChapterPlanningUserMessage,
  buildChapterPrompt,
  buildForeshadowPrompt,
  buildInformationPrompt,
  buildLocalRevisionPrompt,
  buildPovPrompt,
  buildScenePrompt,
  buildStatePrompt,
  buildVolumePrompt,
} from "@/prompts/chapter-planning-v1";
import type { IProviderAdapter } from "@/providers/types";
import { buildChapterPlanningContext } from "./chapter-planning-context-builder";
import { validateChapterPlanningReferences } from "./chapter-planning-references";
import { validateChapterPlanning } from "./chapter-planning-validator";
import { GenerationError } from "./generator";

export type ChapterPlanningMode =
  | "volumes" | "volume_chapters" | "beat_chapters" | "chapter_scenes" | "missing_scenes"
  | "regenerate_chapter" | "regenerate_scene" | "chapter_hook" | "scene_conflict" | "turning_point"
  | "states" | "information" | "analysis_revision" | "alternative_chapter" | "pov" | "foreshadow";

const promptBuilders: Record<ChapterPlanningMode, () => string> = {
  volumes: buildVolumePrompt,
  volume_chapters: buildChapterPrompt,
  beat_chapters: buildChapterPrompt,
  chapter_scenes: buildScenePrompt,
  missing_scenes: buildScenePrompt,
  regenerate_chapter: buildLocalRevisionPrompt,
  regenerate_scene: buildLocalRevisionPrompt,
  chapter_hook: buildLocalRevisionPrompt,
  scene_conflict: buildLocalRevisionPrompt,
  turning_point: buildLocalRevisionPrompt,
  states: buildStatePrompt,
  information: buildInformationPrompt,
  analysis_revision: buildAlternativeChapterPrompt,
  alternative_chapter: buildAlternativeChapterPrompt,
  pov: buildPovPrompt,
  foreshadow: buildForeshadowPrompt,
};

function extractJson(text: string) {
  const value = text.trim();
  try {
    JSON.parse(value);
    return value;
  } catch {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return fenced;
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start >= 0 && end > start) return value.slice(start, end + 1).replace(/,(\s*[}\]])/g, "$1");
    throw new GenerationError("无法提取章节规划 JSON。", "parse_error");
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new GenerationError("章节规划生成超时。", "timeout")), timeoutMs);
    const cancel = () => {
      clearTimeout(timer);
      reject(new GenerationError("章节规划生成已取消。", "cancelled"));
    };
    if (signal?.aborted) return cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    promise.then((value) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      resolve(value);
    }).catch((error) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(error);
    });
  });
}

function normalizeLinks(project: ChapterPlanningProject, storyPlan: StoryPlan) {
  const variant = storyPlan.variants.find((item) => item.id === project.b1VariantId)
    ?? storyPlan.variants.find((item) => item.id === storyPlan.selectedVariantId)
    ?? storyPlan.variants[0];
  if (!variant) return project;
  const next = structuredClone(project);
  next.b1PlanId = storyPlan.id;
  next.b1VariantId = variant.id;
  let beatIndex = 0;
  for (const volume of next.volumes) {
    const section = variant.outline.sections[volume.order];
    if (section && !volume.plotSectionId) volume.plotSectionId = section.id;
    for (const chapter of volume.chapters) {
      for (const version of chapter.versions) {
        version.volumeId = volume.id;
        // Existing non-empty ids remain visible so the validator can report B1 deviation.
        if (!version.b1PlotBeatIds.length && variant.outline.beats[beatIndex]) {
          version.b1PlotBeatIds = [variant.outline.beats[beatIndex++].id];
        }
        for (const scene of version.scenes) {
          scene.chapterId = chapter.id;
          for (const sceneVersion of scene.versions) {
            if (!sceneVersion.b1PlotBeatIds.length) sceneVersion.b1PlotBeatIds = [...version.b1PlotBeatIds];
          }
        }
      }
    }
    volume.plotBeatIds = [...new Set(volume.chapters.flatMap((chapter) => chapter.versions[0]?.b1PlotBeatIds ?? []))];
  }
  return next;
}

function preserveLockedVolumes(existing: ChapterPlanningProject, generated: ChapterPlanningProject) {
  const next = structuredClone(generated);
  for (const locked of existing.volumes.filter((item) => item.locked)) {
    const byId = next.volumes.findIndex((item) => item.id === locked.id);
    const byOrder = next.volumes.findIndex((item) => item.order === locked.order);
    const index = byId >= 0 ? byId : byOrder;
    if (index >= 0) next.volumes[index] = structuredClone(locked);
    else next.volumes.push(structuredClone(locked));
  }
  return next;
}

function preserveLockedChapters(existing: ChapterPlan[], generated: ChapterPlan[], volumeId: string) {
  const next = structuredClone(generated);
  for (const item of next) {
    item.volumeId = volumeId;
    for (const version of item.versions) version.volumeId = volumeId;
  }
  for (const locked of existing.filter((item) => item.locked)) {
    const byId = next.findIndex((item) => item.id === locked.id);
    const byOrder = next.findIndex((item) => item.order === locked.order);
    const index = byId >= 0 ? byId : byOrder;
    if (index >= 0) next[index] = structuredClone(locked);
    else next.push(structuredClone(locked));
  }
  return next;
}

function findVolume(project: ChapterPlanningProject, volumeId?: string) {
  return project.volumes.find((item) => item.id === volumeId) ?? project.volumes[0];
}

function findChapter(volume: VolumePlan, chapterId?: string) {
  return volume.chapters.find((item) => item.id === chapterId) ?? volume.chapters[0];
}

function findScene(chapter: ChapterPlan, sceneId?: string): ScenePlan | undefined {
  const version = chapter.versions.find((item) => item.id === chapter.selectedVersionId) ?? chapter.versions[0];
  return version?.scenes.find((item) => item.id === sceneId) ?? version?.scenes[0];
}

function mergeScope(
  existing: ChapterPlanningProject,
  generated: ChapterPlanningProject,
  mode: ChapterPlanningMode,
  scope: { volumeId?: string; chapterId?: string; sceneId?: string },
) {
  if (mode === "volumes" || mode === "analysis_revision") return preserveLockedVolumes(existing, generated);
  const next = structuredClone(existing);
  const volume = findVolume(next, scope.volumeId);
  const generatedVolume = generated.volumes[0];
  if (!volume || !generatedVolume) return next;

  if (mode === "volume_chapters" || mode === "beat_chapters") {
    if (volume.locked) return next;
    volume.chapters = preserveLockedChapters(volume.chapters, generatedVolume.chapters, volume.id);
    return next;
  }

  const chapter = findChapter(volume, scope.chapterId);
  const generatedChapter = generatedVolume.chapters[0];
  if (!chapter || !generatedChapter || chapter.locked) return next;
  const current = chapter.versions.find((item) => item.id === chapter.selectedVersionId) ?? chapter.versions[0];
  const proposal = generatedChapter.versions[0];
  if (!current || !proposal) return next;

  proposal.id = createEmptyChapterVersion(volume.id).id;
  proposal.parentVersionId = current.id;
  proposal.volumeId = volume.id;
  proposal.name = mode === "alternative_chapter" ? `${current.name} 替代版` : `${current.name} 修订版`;
  proposal.creationReason = mode;
  for (const field of current.lockedFields) {
    (proposal as unknown as Record<string, unknown>)[field] = (current as unknown as Record<string, unknown>)[field];
  }

  if (mode === "chapter_scenes" || mode === "missing_scenes") {
    const lockedScenes = current.scenes.filter((item) => item.locked);
    const generatedScenes = proposal.scenes.filter((item) => !lockedScenes.some((old) => old.id === item.id));
    proposal.scenes = mode === "missing_scenes"
      ? [...current.scenes, ...generatedScenes]
      : [...generatedScenes, ...lockedScenes];
  } else if (["regenerate_scene", "scene_conflict", "turning_point", "states", "pov"].includes(mode)) {
    proposal.scenes = structuredClone(current.scenes);
    const scene = findScene({ ...chapter, versions: [proposal], selectedVersionId: proposal.id }, scope.sceneId);
    const generatedScene = generatedChapter.versions[0].scenes[0];
    if (scene && generatedScene && !scene.locked) {
      const old = scene.versions.find((item) => item.id === scene.selectedVersionId) ?? scene.versions[0];
      const sceneProposal = generatedScene.versions[0];
      if (old && sceneProposal) {
        sceneProposal.id = createEmptySceneVersion().id;
        sceneProposal.parentVersionId = old.id;
        sceneProposal.creationReason = mode;
        for (const field of old.lockedFields) {
          (sceneProposal as unknown as Record<string, unknown>)[field] = (old as unknown as Record<string, unknown>)[field];
        }
        if (mode === "scene_conflict" || mode === "turning_point") {
          const limited = structuredClone(old);
          limited.id = sceneProposal.id;
          limited.parentVersionId = old.id;
          limited.creationReason = mode;
          if (mode === "scene_conflict") {
            limited.conflictType = sceneProposal.conflictType;
            limited.opposingForce = sceneProposal.opposingForce;
          } else limited.turningPoint = sceneProposal.turningPoint;
          scene.versions.push(limited);
          scene.selectedVersionId = limited.id;
        } else {
          scene.versions.push(sceneProposal);
          scene.selectedVersionId = sceneProposal.id;
        }
      }
    }
  } else if (mode === "chapter_hook") {
    const hook = proposal.hook;
    Object.assign(proposal, structuredClone(current), {
      id: proposal.id,
      parentVersionId: current.id,
      name: proposal.name,
      creationReason: mode,
      hook,
      createdAt: proposal.createdAt,
      modifiedAt: new Date().toISOString(),
    });
  }

  chapter.versions.push(proposal);
  chapter.selectedVersionId = proposal.id;
  if (mode === "information") {
    next.informationItems = generated.informationItems;
    next.informationReveals = generated.informationReveals;
  }
  if (mode === "foreshadow") next.foreshadows = generated.foreshadows;
  return next;
}

export async function generateChapterPlanning(args: {
  project: ChapterPlanningProject;
  mode: ChapterPlanningMode;
  scope: { volumeId?: string; chapterId?: string; sceneId?: string; plotSectionId?: string; plotBeatIds?: string[] };
  storyPlan: StoryPlan;
  characterCard: CharacterCardV2;
  lorebooks: Lorebook[];
  analyses: PlotAnalysisProject[];
  provider: IProviderAdapter;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
  abortSignal?: AbortSignal;
}) {
  const context = buildChapterPlanningContext({
    project: args.project,
    storyPlan: args.storyPlan,
    characterCard: args.characterCard,
    lorebooks: args.lorebooks,
    analyses: args.analyses,
    ...args.scope,
  });
  const maxRetries = args.maxRetries ?? 2;
  let lastError = "";

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await withTimeout(args.provider.generate({
        systemPrompt: promptBuilders[args.mode](),
        userMessage: buildChapterPlanningUserMessage(args.project, context, args.mode, args.scope)
          + (attempt ? `\n${buildChapterPlanningRepairPrompt(lastError)}` : ""),
        model: args.model,
        maxTokens: 14000,
        temperature: 0.35,
        abortSignal: args.abortSignal,
      }), args.timeoutMs ?? 60000, args.abortSignal);

      const parsed = ChapterPlanningProjectSchema.safeParse(JSON.parse(extractJson(response.content)));
      if (!parsed.success) {
        lastError = parsed.error.issues.map((item) => `${item.path.join(".")}: ${item.message}`).join("; ");
        if (attempt < maxRetries) continue;
        throw new GenerationError(`章节规划 Schema 校验失败：${lastError}`, "validation_error", attempt);
      }

      const normalized = normalizeLinks(parsed.data, args.storyPlan);
      const scoped = mergeScope(args.project, normalized, args.mode, args.scope);
      const references = validateChapterPlanningReferences(scoped, context);
      const variant = args.storyPlan.variants.find((item) => item.id === references.project.b1VariantId) ?? args.storyPlan.variants[0];
      const validation = validateChapterPlanning(references.project, variant, args.project);
      return {
        project: {
          ...references.project,
          plotBeatCoverage: validation.coverage,
          issues: validation.issues,
          provider: args.provider.type,
          model: response.model,
          promptVersion: "chapter-planning-v1.0.0",
          modifiedAt: new Date().toISOString(),
        },
        context,
        warnings: references.warnings,
        issues: validation.issues,
        model: response.model,
        retriesUsed: attempt,
      };
    } catch (cause) {
      if (cause instanceof GenerationError && ["timeout", "cancelled"].includes(cause.code)) throw cause;
      lastError = (cause as Error).message;
      if (attempt >= maxRetries) {
        throw cause instanceof GenerationError
          ? cause
          : new GenerationError(`章节规划生成失败：${lastError}`, "provider_error", attempt);
      }
    }
  }
  throw new GenerationError("章节规划生成失败。", "provider_error");
}
