import type {
  ChapterPlan,
  ChapterPlanningIssue,
  ChapterPlanningProject,
  ChapterPlanVersion,
  PlotBeatCoverage,
  ScenePlan,
  ScenePlanVersion,
} from "@/domain/chapter-planning";
import { createStableId } from "@/domain/lorebook";
import type { OutlineVariant } from "@/domain/story-planning";

const selectedChapter = (chapter: ChapterPlan) => chapter.versions.find((item) => item.id === chapter.selectedVersionId) ?? chapter.versions[0];
const selectedScene = (scene: ScenePlan) => scene.versions.find((item) => item.id === scene.selectedVersionId) ?? scene.versions[0];

function createIssue(
  type: string,
  severity: ChapterPlanningIssue["severity"],
  rationale: string,
  ids: { volumeId?: string; chapterId?: string; sceneId?: string; characters?: string[] } = {},
  confidence: ChapterPlanningIssue["confidence"] = "high",
  heuristic = false,
): ChapterPlanningIssue {
  const now = new Date().toISOString();
  return {
    id: createStableId("chapter_issue"),
    dataVersion: 1,
    status: "draft",
    sources: [],
    createdAt: now,
    modifiedAt: now,
    type,
    severity,
    confidence,
    volumeId: ids.volumeId ?? "",
    chapterId: ids.chapterId ?? "",
    sceneId: ids.sceneId ?? "",
    characterIds: ids.characters ?? [],
    rationale,
    minimumRevision: "补充最小必要的目标、因果、状态、铺垫或来源说明。",
    sideEffects: ["可能改变章节节奏或增加过渡篇幅。"],
    heuristic,
    resolution: "unresolved",
  };
}

export function calculatePlotBeatCoverage(project: ChapterPlanningProject, variant: OutlineVariant): PlotBeatCoverage[] {
  const chapters = project.volumes.flatMap((volume) => volume.chapters.map((chapter) => ({ chapter, version: selectedChapter(chapter) }))).filter((item) => item.version);
  return variant.outline.beats.map((beat) => {
    const completionChapterIds = chapters.filter((item) => item.version!.b1PlotBeatIds.includes(beat.id)).map((item) => item.chapter.id);
    const setupLocationIds: string[] = [];
    const payoffLocationIds: string[] = [];
    for (const { version } of chapters) {
      for (const scene of version!.scenes) {
        const sceneVersion = selectedScene(scene);
        if (!sceneVersion?.b1PlotBeatIds.includes(beat.id)) continue;
        if (sceneVersion.sceneFunctions.includes("setup")) setupLocationIds.push(scene.id);
        if (sceneVersion.sceneFunctions.includes("resolution") || sceneVersion.sceneFunctions.includes("aftermath")) payoffLocationIds.push(scene.id);
      }
    }
    const duplicated = completionChapterIds.length > 1;
    const missing = completionChapterIds.length === 0;
    let status: PlotBeatCoverage["status"] = "planned";
    if (missing) status = "uncovered";
    else if (duplicated) status = "duplicated";
    else if (setupLocationIds.length && payoffLocationIds.length) status = "covered";
    else if (setupLocationIds.length || payoffLocationIds.length) status = "partially_covered";
    return { plotBeatId: beat.id, completionChapterIds, setupLocationIds, payoffLocationIds, status, duplicated, missing, deviationNotes: [] };
  });
}

type Difference = { type: string; detail: string };
function stateDifferences(exit: ScenePlanVersion["exitState"], entry: ScenePlanVersion["entryState"]): Difference[] {
  const differences: Difference[] = [];
  if (exit.time && entry.time && exit.time !== entry.time) differences.push({ type: "time_conflict", detail: `${exit.time} -> ${entry.time}` });
  if (exit.location && entry.location && exit.location !== entry.location) differences.push({ type: "location_conflict", detail: `${exit.location} -> ${entry.location}` });
  for (const [id, state] of Object.entries(exit.bodyStates)) {
    if (entry.bodyStates[id] && entry.bodyStates[id] !== state) differences.push({ type: "body_state_conflict", detail: `${id}: ${state} -> ${entry.bodyStates[id]}` });
  }
  for (const [id, state] of Object.entries(exit.emotionStates)) {
    if (entry.emotionStates[id] && entry.emotionStates[id] !== state) differences.push({ type: "emotion_state_conflict", detail: `${id}: ${state} -> ${entry.emotionStates[id]}` });
  }
  for (const [id, state] of Object.entries(exit.currentGoals)) {
    if (entry.currentGoals[id] && entry.currentGoals[id] !== state) differences.push({ type: "character_goal_jump", detail: `${id}: ${state} -> ${entry.currentGoals[id]}` });
  }
  for (const [id, state] of Object.entries(exit.relationshipStates)) {
    if (entry.relationshipStates[id] && entry.relationshipStates[id] !== state) differences.push({ type: "relationship_state_conflict", detail: `${id}: ${state} -> ${entry.relationshipStates[id]}` });
  }
  for (const [id, items] of Object.entries(exit.heldItems)) {
    if (entry.heldItems[id] && JSON.stringify([...entry.heldItems[id]].sort()) !== JSON.stringify([...items].sort())) {
      differences.push({ type: "item_state_conflict", detail: id });
    }
  }
  for (const informationId of exit.knownInformationIds) {
    if (!entry.knownInformationIds.includes(informationId)) differences.push({ type: "information_state_conflict", detail: informationId });
  }
  return differences;
}

function dependencyCycles(edges: Array<{ from: string; to: string }>) {
  const graph = new Map<string, string[]>();
  for (const edge of edges) graph.set(edge.from, [...(graph.get(edge.from) ?? []), edge.to]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  let cycle = false;
  const visit = (id: string) => {
    if (visiting.has(id)) { cycle = true; return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of graph.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id);
  return cycle;
}

function validateDependencies(project: ChapterPlanningProject, issues: ChapterPlanningIssue[]) {
  const chapters = project.volumes.flatMap((volume) => volume.chapters).sort((a, b) => a.order - b.order);
  const chapterOrder = new Map(chapters.map((item, index) => [item.id, index]));
  const chapterEdges: Array<{ from: string; to: string }> = [];
  for (const chapter of chapters) {
    const version = selectedChapter(chapter);
    for (const dependency of version?.dependencies ?? []) {
      chapterEdges.push({ from: dependency.fromChapterId, to: dependency.toChapterId });
      if (!chapterOrder.has(dependency.fromChapterId) || !chapterOrder.has(dependency.toChapterId)) issues.push(createIssue("missing_chapter_dependency", "major", "章节依赖引用了不存在的章节。", { chapterId: chapter.id }));
      else if (dependency.fromChapterId === dependency.toChapterId) issues.push(createIssue("chapter_self_dependency", "major", "章节不能依赖自身。", { chapterId: chapter.id }));
      else if (chapterOrder.get(dependency.fromChapterId)! >= chapterOrder.get(dependency.toChapterId)!) issues.push(createIssue("chapter_effect_before_cause", "major", "章节结果排在必要原因之前。", { chapterId: dependency.toChapterId }));
    }
  }
  if (dependencyCycles(chapterEdges)) issues.push(createIssue("chapter_dependency_cycle", "critical", "章节依赖存在循环。"));

  const scenes = chapters.flatMap((chapter) => selectedChapter(chapter)?.scenes ?? []).sort((a, b) => a.order - b.order);
  const sceneOrder = new Map(scenes.map((item, index) => [item.id, index]));
  const sceneEdges: Array<{ from: string; to: string }> = [];
  for (const scene of scenes) {
    const version = selectedScene(scene);
    for (const dependency of version?.dependencies ?? []) {
      sceneEdges.push({ from: dependency.fromSceneId, to: dependency.toSceneId });
      if (!sceneOrder.has(dependency.fromSceneId) || !sceneOrder.has(dependency.toSceneId)) issues.push(createIssue("missing_scene_dependency", "major", "场景依赖引用了不存在的场景。", { sceneId: scene.id }));
      else if (dependency.fromSceneId === dependency.toSceneId) issues.push(createIssue("scene_self_dependency", "major", "场景不能依赖自身。", { sceneId: scene.id }));
      else if (sceneOrder.get(dependency.fromSceneId)! >= sceneOrder.get(dependency.toSceneId)!) issues.push(createIssue("scene_effect_before_cause", "major", "场景结果排在必要原因之前。", { sceneId: dependency.toSceneId }));
    }
  }
  if (dependencyCycles(sceneEdges)) issues.push(createIssue("scene_dependency_cycle", "critical", "场景依赖存在循环。"));
}

function selectedScenes(project: ChapterPlanningProject) {
  return project.volumes.flatMap((volume) => volume.chapters.flatMap((chapter) => selectedChapter(chapter)?.scenes ?? []));
}

function validateLockedContent(project: ChapterPlanningProject, baseline: ChapterPlanningProject, issues: ChapterPlanningIssue[]) {
  for (const oldVolume of baseline.volumes) {
    const volume = project.volumes.find((item) => item.id === oldVolume.id);
    if (oldVolume.locked && (!volume || JSON.stringify(volume) !== JSON.stringify(oldVolume))) {
      issues.push(createIssue("locked_content_changed", "critical", `锁定分卷“${oldVolume.title}”被修改。`, { volumeId: oldVolume.id }));
      continue;
    }
    for (const oldChapter of oldVolume.chapters) {
      const chapter = volume?.chapters.find((item) => item.id === oldChapter.id);
      if (oldChapter.locked && (!chapter || JSON.stringify(chapter) !== JSON.stringify(oldChapter))) {
        issues.push(createIssue("locked_content_changed", "critical", "锁定章节被修改。", { volumeId: oldVolume.id, chapterId: oldChapter.id }));
        continue;
      }
      const oldVersion = selectedChapter(oldChapter);
      const version = chapter && selectedChapter(chapter);
      if (oldVersion && version) {
        for (const field of oldVersion.lockedFields) {
          if (JSON.stringify((oldVersion as unknown as Record<string, unknown>)[field]) !== JSON.stringify((version as unknown as Record<string, unknown>)[field])) {
            issues.push(createIssue("locked_content_changed", "critical", `章节锁定字段 ${field} 被修改。`, { chapterId: oldChapter.id }));
          }
        }
        for (const oldScene of oldVersion.scenes) {
          const scene = version.scenes.find((item) => item.id === oldScene.id);
          if (oldScene.locked && (!scene || JSON.stringify(scene) !== JSON.stringify(oldScene))) {
            issues.push(createIssue("locked_content_changed", "critical", "锁定场景被修改。", { chapterId: oldChapter.id, sceneId: oldScene.id }));
            continue;
          }
          const oldSceneVersion = selectedScene(oldScene);
          const sceneVersion = scene && selectedScene(scene);
          if (oldSceneVersion && sceneVersion) {
            for (const field of oldSceneVersion.lockedFields) {
              if (JSON.stringify((oldSceneVersion as unknown as Record<string, unknown>)[field]) !== JSON.stringify((sceneVersion as unknown as Record<string, unknown>)[field])) {
                issues.push(createIssue("locked_content_changed", "critical", `场景锁定字段 ${field} 被修改。`, { sceneId: oldScene.id }));
              }
            }
          }
        }
      }
    }
  }
}

export function validateChapterPlanning(
  project: ChapterPlanningProject,
  variant: OutlineVariant,
  baseline?: ChapterPlanningProject,
): { issues: ChapterPlanningIssue[]; coverage: PlotBeatCoverage[] } {
  const issues: ChapterPlanningIssue[] = [];
  const coverage = calculatePlotBeatCoverage(project, variant);
  const beatIds = new Set(variant.outline.beats.map((beat) => beat.id));

  for (const item of coverage) {
    if (item.missing) issues.push(createIssue("plot_beat_uncovered", "major", `B1 节点 ${item.plotBeatId} 尚未覆盖。`));
    if (item.duplicated) issues.push(createIssue("plot_beat_duplicated", "major", `B1 节点 ${item.plotBeatId} 被多个章节重复完成。`));
  }

  const orderedChapters = [...project.volumes].sort((a, b) => a.order - b.order).flatMap((volume) => {
    if (!volume.goal.trim()) issues.push(createIssue("volume_missing_goal", "major", `分卷“${volume.title}”没有阶段目标。`, { volumeId: volume.id }));
    if (volume.sources.some((source) => !source.valid)) issues.push(createIssue("invalid_source_reference", "major", "分卷包含失效来源引用。", { volumeId: volume.id }));
    return [...volume.chapters].sort((a, b) => a.order - b.order).map((chapter) => ({ volume, chapter, version: selectedChapter(chapter) }));
  });

  let previousScene: ScenePlanVersion | undefined;
  for (let chapterIndex = 0; chapterIndex < orderedChapters.length; chapterIndex += 1) {
    const { volume, chapter, version } = orderedChapters[chapterIndex];
    if (!version) continue;
    if (!version.chapterGoal.trim()) issues.push(createIssue("chapter_missing_goal", "major", `章节“${version.title}”没有章节目标。`, { volumeId: volume.id, chapterId: chapter.id }));
    if (!version.result.trim() && !version.stateChanges.length && !version.informationChanges.length) issues.push(createIssue("chapter_no_change", "major", `章节“${version.title}”没有有效变化。`, { volumeId: volume.id, chapterId: chapter.id }));
    if (version.b1PlotBeatIds.some((id) => !beatIds.has(id))) issues.push(createIssue("b1_deviation", "critical", `章节“${version.title}”引用不存在的 B1 节点。`, { volumeId: volume.id, chapterId: chapter.id }));
    if (version.sources.some((source) => !source.valid) || chapter.sources.some((source) => !source.valid)) issues.push(createIssue("invalid_source_reference", "major", "章节包含失效来源引用。", { chapterId: chapter.id }));

    const scenes = [...version.scenes].sort((a, b) => a.order - b.order);
    const functionKeys = new Set<string>();
    for (const scene of scenes) {
      const sceneVersion = selectedScene(scene);
      if (!sceneVersion) continue;
      if (!sceneVersion.sceneGoal.trim()) issues.push(createIssue("scene_missing_goal", "major", `场景“${sceneVersion.title}”没有场景目标。`, { volumeId: volume.id, chapterId: chapter.id, sceneId: scene.id }));
      if (!sceneVersion.result.trim()) issues.push(createIssue("scene_missing_result", "major", `场景“${sceneVersion.title}”没有结果。`, { chapterId: chapter.id, sceneId: scene.id }));
      if (sceneVersion.presentCharacterIds.length && !Object.keys(sceneVersion.characterGoals).length) issues.push(createIssue("character_missing_motivation", "moderate", `场景“${sceneVersion.title}”中的角色缺少行动目标。`, { chapterId: chapter.id, sceneId: scene.id, characters: sceneVersion.presentCharacterIds }, "medium"));

      if (previousScene) {
        const differences = stateDifferences(previousScene.exitState, sceneVersion.entryState);
        if (differences.length) {
          issues.push(createIssue("scene_state_discontinuity", "major", `场景入口与前一场出口不连续：${differences.map((item) => item.detail).join("；")}`, { chapterId: chapter.id, sceneId: scene.id }));
          for (const difference of differences) issues.push(createIssue(difference.type, "major", difference.detail, { chapterId: chapter.id, sceneId: scene.id }));
        }
      }
      previousScene = sceneVersion;

      if (sceneVersion.pov.perspective === "third_limited" && sceneVersion.pov.povCharacterIds.length !== 1) issues.push(createIssue("pov_configuration", "major", "第三人称限知场景应指定且只指定一个视角角色。", { chapterId: chapter.id, sceneId: scene.id }));
      if (version.pov.perspective !== "multiple" && version.pov.perspective !== "custom" && sceneVersion.pov.perspective !== version.pov.perspective) issues.push(createIssue("chapter_scene_pov_conflict", "moderate", "章节与场景视角配置冲突。", { chapterId: chapter.id, sceneId: scene.id }, "medium"));
      if (!sceneVersion.pov.allowSwitch && sceneVersion.pov.povCharacterIds.length > 1) issues.push(createIssue("unmarked_pov_switch", "major", "场景包含多个视角角色但未允许或标记切换。", { sceneId: scene.id }));
      if (sceneVersion.pov.perspective !== "third_omniscient" && sceneVersion.pov.povCharacterIds.some((id) => !sceneVersion.presentCharacterIds.includes(id))) issues.push(createIssue("pov_cannot_observe", "major", "视角角色不在场，无法直接观察当前事件。", { sceneId: scene.id, characters: sceneVersion.pov.povCharacterIds }));

      for (const revealId of sceneVersion.informationRevealIds) {
        const reveal = project.informationReveals.find((item) => item.id === revealId);
        if (!reveal || !reveal.sourceReferenceIds.length) issues.push(createIssue("reveal_missing_source", "major", "信息揭示缺少来源。", { chapterId: chapter.id, sceneId: scene.id }));
        if (reveal?.isFirstReveal && sceneVersion.entryState.knownInformationIds.includes(reveal.informationItemId)) issues.push(createIssue("information_known_too_early", "major", "角色或读者在首次揭示之前已经知道该信息。", { sceneId: scene.id, characters: reveal.characterIds }));
        const information = reveal && project.informationItems.find((item) => item.id === reveal.informationItemId);
        if (reveal?.isFirstReveal && information?.expectedResolution && !project.foreshadows.some((item) => item.actualPayoffLocationIds.includes(scene.id))) issues.push(createIssue("reveal_missing_setup", "moderate", "关键揭示缺少可见铺垫。", { sceneId: scene.id }, "low", true));
      }

      const functionKey = [...sceneVersion.sceneFunctions].sort().join("|");
      if (functionKey && functionKeys.has(functionKey)) issues.push(createIssue("duplicate_scene_function", "minor", "同一章节存在功能高度重复的场景。", { chapterId: chapter.id, sceneId: scene.id }, "low", true));
      if (functionKey) functionKeys.add(functionKey);
      if (sceneVersion.sceneFunctions.length > 4) issues.push(createIssue("scene_function_overload", "minor", "单场景承担过多功能。", { sceneId: scene.id }, "low", true));
      if (sceneVersion.sources.some((source) => !source.valid) || scene.sources.some((source) => !source.valid)) issues.push(createIssue("invalid_source_reference", "major", "场景包含失效来源引用。", { sceneId: scene.id }));
    }

    if (version.scenes.length > 6 || version.informationChanges.length > 6) issues.push(createIssue("chapter_function_overload", "minor", "单章功能或信息负荷偏高。", { chapterId: chapter.id }, "low", true));
    const isMajor = version.conflictIntensity === 5 || scenes.some((scene) => selectedScene(scene)?.sceneFunctions.includes("climax"));
    const nextVersion = orderedChapters[chapterIndex + 1]?.version;
    if (isMajor && (!nextVersion || (!nextVersion.stateChanges.length && !nextVersion.scenes.some((scene) => selectedScene(scene)?.sceneFunctions.includes("aftermath"))))) {
      issues.push(createIssue("major_event_missing_aftermath", "moderate", "重大事件之后缺少明确余波。", { chapterId: chapter.id }, "medium", true));
    }
  }

  const reveals = [...project.informationReveals].sort((a, b) => a.order - b.order);
  const firstReveals = new Set<string>();
  for (const reveal of reveals) {
    if (reveal.isFirstReveal && firstReveals.has(reveal.informationItemId)) issues.push(createIssue("duplicate_first_reveal", "major", "同一信息被重复标为首次揭示。", { chapterId: reveal.chapterId, sceneId: reveal.sceneId }));
    if (reveal.isFirstReveal) firstReveals.add(reveal.informationItemId);
  }

  const locations = selectedScenes(project).map((scene) => scene.id);
  const labels = new Set<string>();
  for (const foreshadow of project.foreshadows) {
    const setupIndices = foreshadow.setupLocationIds.map((id) => locations.indexOf(id)).filter((index) => index >= 0);
    const payoffIndices = foreshadow.actualPayoffLocationIds.map((id) => locations.indexOf(id)).filter((index) => index >= 0);
    const setup = setupIndices.length ? Math.min(...setupIndices) : Number.POSITIVE_INFINITY;
    const payoff = payoffIndices.length ? Math.min(...payoffIndices) : Number.POSITIVE_INFINITY;
    if (Number.isFinite(payoff) && (!Number.isFinite(setup) || payoff < setup)) issues.push(createIssue("foreshadow_payoff_before_setup", "major", `铺垫“${foreshadow.label}”的回收早于设置。`));
    if (foreshadow.state !== "abandoned" && foreshadow.plannedPayoffLocationIds.length && !foreshadow.actualPayoffLocationIds.length) issues.push(createIssue("foreshadow_missing_payoff", "moderate", `铺垫“${foreshadow.label}”尚未回收。`, {}, "medium", true));
    const referenced = selectedScenes(project).some((scene) => {
      const version = selectedScene(scene);
      return version?.foreshadowSetupIds.includes(foreshadow.id) || version?.foreshadowPayoffIds.includes(foreshadow.id);
    });
    if (foreshadow.state === "abandoned" && referenced) issues.push(createIssue("abandoned_foreshadow_used", "major", `已废弃铺垫“${foreshadow.label}”仍被场景使用。`));
    const key = foreshadow.label.trim().toLocaleLowerCase();
    if (key && labels.has(key)) issues.push(createIssue("duplicate_foreshadow", "minor", `铺垫“${foreshadow.label}”可能重复。`, {}, "low", true));
    if (key) labels.add(key);
  }

  for (let index = 2; index < orderedChapters.length; index += 1) {
    const values = orderedChapters.slice(index - 2, index + 1).map((item) => item.version?.pacingIntensity ?? 3);
    if (values.every((value) => value >= 5)) issues.push(createIssue("continuous_high_intensity", "minor", "连续三章高强度，可能缺少呼吸空间。", {}, "low", true));
    if (values.every((value) => value <= 1)) issues.push(createIssue("continuous_low_intensity", "minor", "连续三章低强度，可能失去推进。", {}, "low", true));
  }

  validateDependencies(project, issues);
  if (baseline) validateLockedContent(project, baseline, issues);
  return { issues, coverage };
}
