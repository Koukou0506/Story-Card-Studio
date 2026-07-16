import { createEmptyAnalysisProject, createEmptyBranch, type PlotAnalysisProject, type RevisionSuggestion } from "@/domain/plot-analysis";
import type { ChapterPlanningProject, ScenePlanVersion } from "@/domain/chapter-planning";
import { RevisionSchema, proseBase, type CandidateStateChange, type DraftVersion, type Revision, type SceneDraft } from "@/domain/prose";
import { blocksToText } from "./prose-editing";

export function createAnalysisFromProse(scene: SceneDraft, version: DraftVersion, plan?: ScenePlanVersion, alternatives?: DraftVersion[]): PlotAnalysisProject {
  const project = createEmptyAnalysisProject();
  project.title = `正文分析：${scene.title}`;
  project.input.title = project.title;
  project.input.occurredPlot = plan ? `Scene Plan：目标=${plan.sceneGoal}；转折=${plan.turningPoint}；结果=${plan.result}` : "";
  project.input.proposedPlot = blocksToText(version.blocks);
  project.input.plotGoal = plan?.sceneGoal ?? "检查正文与场景计划的一致性";
  project.input.currentTime = plan?.time ?? "";
  project.input.currentPlace = plan?.location ?? "";
  project.input.participatingCharacters = plan?.presentCharacterIds ?? [];
  project.input.userNotes = `来源：正文版本 ${version.id}；只分析，不自动修改正文或 B2。`;
  if (alternatives?.length) project.input.branches = alternatives.slice(0, 3).map((item, index) => ({ ...createEmptyBranch(index), name: item.name, description: blocksToText(item.blocks), expectedEffect: "比较正文版本", acceptableChanges: "仅提出建议" }));
  project.proposal = { ...project.proposal, occurredPlot: project.input.occurredPlot, proposedPlot: project.input.proposedPlot, plotGoal: project.input.plotGoal, branches: project.input.branches };
  project.selectedCharacterIds = [...project.input.participatingCharacters];
  return project;
}

export function createRevisionTaskFromAnalysis(scene: SceneDraft, baseVersion: DraftVersion, suggestion: RevisionSuggestion): Revision {
  return RevisionSchema.parse({
    ...proseBase("revision"), status: "alternative", sceneDraftId: scene.id,
    baseVersionId: baseVersion.id, suggestedVersionId: baseVersion.id, operationType: "custom_revision",
    scope: { type: "scene", allowStructureChanges: false, allowNewFacts: false, allowDeleteInformation: false },
    userInstruction: `${suggestion.title}：${suggestion.minimumChange}\n副作用：${suggestion.sideEffects.join("；")}`,
    provider: "user", model: "A3 suggestion", sourceVersions: { analysisIssue: suggestion.issueId },
  });
}

/** 只创建 B2 场景版本副本；不会改变 selected/adopted 版本。 */
export function createB2UpdateCopy(project: ChapterPlanningProject, scenePlanId: string, changes: CandidateStateChange[]): ChapterPlanningProject {
  const next = structuredClone(project);
  for (const volume of next.volumes) for (const chapter of volume.chapters) for (const chapterVersion of chapter.versions) {
    const scene = chapterVersion.scenes.find((item) => item.id === scenePlanId);
    if (!scene) continue;
    const current = scene.versions.find((item) => item.id === scene.selectedVersionId) ?? scene.versions[0];
    if (!current) return next;
    const copy = structuredClone(current);
    copy.id = proseBase("b2_scene_candidate_version").id;
    copy.parentVersionId = current.id;
    copy.name = `${current.name} · 正文状态候选`;
    copy.creationReason = "prose_confirmed_state_candidates";
    copy.adopted = false; copy.status = "suggested"; copy.createdAt = new Date().toISOString(); copy.modifiedAt = copy.createdAt;
    copy.notes = [...copy.notes, ...changes.map((item) => `正文候选 ${item.changeType}：${item.before} → ${item.after}（${item.confidence}）`)];
    scene.versions.push(copy);
    next.modifiedAt = new Date().toISOString();
    return next;
  }
  throw new Error("无法在 B2 中找到对应 Scene Plan。");
}
