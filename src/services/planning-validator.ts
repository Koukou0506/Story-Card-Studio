import { createStableId } from "@/domain/lorebook";
import type { OutlineVariant, PlanningIssue, PlotBeat } from "@/domain/story-planning";

const issue = (
  type: string,
  severity: PlanningIssue["severity"],
  rationale: string,
  beatIds: string[] = [],
  characterIds: string[] = [],
  confidence: PlanningIssue["confidence"] = "high",
): PlanningIssue => ({
  id: createStableId("planning_issue"),
  dataVersion: 1,
  status: "draft",
  sources: [],
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  type,
  severity,
  confidence,
  beatIds,
  characterIds,
  rationale,
  minimumRevision: "补充最小必要的原因、事件或状态说明。",
  sideEffects: ["可能增加大纲长度或改变节奏。"],
});

export function findDependencyCycles(beats: PlotBeat[]): string[][] {
  const graph = new Map<string, string[]>();
  beats.forEach((beat) => graph.set(beat.id, beat.dependencies
    .filter((dependency) => ["causes", "enables", "motivates", "reveals", "prevents", "complicates", "resolves"].includes(dependency.type))
    .map((dependency) => dependency.toBeatId)));
  const cycles: string[][] = [];
  const visit = (node: string, path: string[]) => {
    const index = path.indexOf(node);
    if (index >= 0) { cycles.push([...path.slice(index), node]); return; }
    for (const next of graph.get(node) || []) visit(next, [...path, node]);
  };
  for (const id of graph.keys()) visit(id, []);
  return cycles.filter((cycle, index, all) => all.findIndex((candidate) => [...candidate].sort().join() === [...cycle].sort().join()) === index);
}

export function validatePlanning(variant: OutlineVariant, baseline?: OutlineVariant): PlanningIssue[] {
  const result: PlanningIssue[] = [];
  const bible = variant.storyBible;
  const beats = variant.outline.beats;
  const beatIds = new Set(beats.map((beat) => beat.id));
  const planIds = new Set(variant.characterPlans.map((plan) => plan.id));

  if (!bible.coreConflict.trim()) result.push(issue("missing_core_conflict", "major", "故事圣经缺少核心冲突。"));
  if (!bible.protagonistGoal.trim()) result.push(issue("unclear_protagonist_goal", "major", "主角目标不明确。"));
  if (!bible.stakes.trim() || !bible.costs.trim()) result.push(issue("insufficient_stakes", "moderate", "风险或代价不足。"));

  for (const beat of beats) {
    if (!beat.title.trim() || !beat.summary.trim()) result.push(issue("empty_plot_beat", "major", "情节节点缺少标题或摘要。", [beat.id]));
    if (!beat.trigger.trim()) result.push(issue("missing_trigger", "moderate", `节点“${beat.title}”没有触发原因。`, [beat.id]));
    if (beat.directResult.trim() && !beat.mainAction.trim()) result.push(issue("missing_intermediate_step", "major", `节点“${beat.title}”有结果但缺少主要行动。`, [beat.id]));
    if (beat.characterIds.length && !beat.prerequisites.length && !beat.trigger.trim()) result.push(issue("missing_motivation", "moderate", `节点“${beat.title}”缺少人物行动动机或前置条件。`, [beat.id], beat.characterIds, "medium"));
    if (/高潮|死亡|政变|战争/.test(`${beat.title}${beat.summary}`) && !beat.longTermConsequences.length) result.push(issue("major_event_no_aftermath", "major", "重大事件没有后续影响。", [beat.id]));
    if ((beat.newInformation.length || beat.worldChanges.length) && !beat.newSettingMarked) result.push(issue("unmarked_new_setting", "minor", "新增关键设定或信息尚未标记。", [beat.id]));
    for (const dependency of beat.dependencies) {
      if (!beatIds.has(dependency.fromBeatId) || !beatIds.has(dependency.toBeatId)) result.push(issue("missing_dependency_node", "major", "因果依赖引用了不存在的节点。", [beat.id]));
      if (dependency.fromBeatId === dependency.toBeatId) result.push(issue("self_dependency", "major", "节点存在自我依赖。", [beat.id]));
    }
    for (const change of beat.characterChanges) {
      if (!change.reason.trim()) result.push(issue("character_change_without_reason", "moderate", `${change.characterName} 的状态变化缺少原因。`, [beat.id], [change.characterId], "medium"));
    }
    for (const change of beat.relationshipChanges) {
      if (!change.trigger.trim()) result.push(issue("relationship_change_without_trigger", "major", "关系变化缺少触发事件。", [beat.id], change.characterIds));
    }
    for (const change of beat.worldChanges) {
      if (!change.reason.trim()) result.push(issue("world_change_without_reason", "moderate", `${change.entity} 的世界状态变化缺少原因。`, [beat.id]));
    }
    if (beat.sources.some((source) => !source.valid)) result.push(issue("invalid_source_reference", "major", "情节节点包含无效来源引用。", [beat.id]));
  }

  for (const section of variant.outline.sections) {
    const missing = section.beatIds.filter((id) => !beatIds.has(id));
    if (missing.length) result.push(issue("section_missing_beat", "major", `阶段“${section.name}”引用了不存在的节点。`, missing));
  }

  for (const cycle of findDependencyCycles(beats)) result.push(issue("causal_cycle", "critical", `因果依赖形成循环：${cycle.join(" → ")}`, cycle));
  const order = new Map(beats.map((beat, index) => [beat.id, index]));
  for (const beat of beats) for (const dependency of beat.dependencies) {
    if (["causes", "enables", "reveals", "motivates"].includes(dependency.type)
      && (order.get(dependency.fromBeatId) ?? 0) > (order.get(dependency.toBeatId) ?? 0)) {
      result.push(issue("effect_before_cause", "major", "必要原因或信息出现在结果之后。", [dependency.fromBeatId, dependency.toBeatId]));
    }
  }

  for (const arc of variant.characterArcs) {
    const references = [arc.incitingEventBeatId, arc.firstActiveChoiceBeatId, arc.midpointChangeBeatId, arc.greatestFailureBeatId, arc.finalChoiceBeatId, ...arc.escalationBeatIds].filter(Boolean);
    if (!references.length || references.some((id) => !beatIds.has(id))) result.push(issue("arc_without_events", "major", "角色弧没有有效对应情节事件。", references, [arc.characterPlanId]));
    if (!planIds.has(arc.characterPlanId)) result.push(issue("arc_missing_character_plan", "major", "角色弧引用了不存在的角色规划。", [], [arc.characterPlanId]));
  }
  for (const relationship of variant.relationshipArcs) if (!(relationship.turningBeatIds || []).length) result.push(issue("relationship_without_trigger", "moderate", "关系路线没有对应转折事件。", [], relationship.characterIds || []));

  const events = [...variant.timeline.events].sort((left, right) => left.order - right.order);
  const eventIds = new Set(events.map((event) => event.id));
  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const current = events[index];
    if (current.storyDay !== null && previous.storyDay !== null && current.storyDay < previous.storyDay) result.push(issue("timeline_conflict", "major", "时间线故事日顺序倒置。", [previous.plotBeatId, current.plotBeatId].filter(Boolean)));
    if (current.storyDay !== null && previous.storyDay === current.storyDay && current.location && previous.location && current.location !== previous.location && current.characterIds.some((id) => previous.characterIds.includes(id))) result.push(issue("travel_anomaly", "moderate", "同一角色同日跨地点，未记录路程或耗时。", [previous.plotBeatId, current.plotBeatId].filter(Boolean), current.characterIds, "medium"));
  }
  for (const event of events) {
    if (event.relativeToEventId && !eventIds.has(event.relativeToEventId)) result.push(issue("missing_timeline_reference", "major", "相对时间引用了不存在的事件。", event.plotBeatId ? [event.plotBeatId] : []));
    if (event.plotBeatId && !beatIds.has(event.plotBeatId)) result.push(issue("timeline_missing_beat", "major", "时间线引用了不存在的情节节点。"));
    if ((event.characterChanges || []).some((change) => !change.reason.trim()) || (event.worldChanges || []).some((change) => !change.reason.trim())) result.push(issue("timeline_state_without_reason", "moderate", "时间线状态变化缺少原因。", event.plotBeatId ? [event.plotBeatId] : []));
  }

  const characterStates = new Map<string, string>();
  const relationshipStates = new Map<string, string>();
  const worldStates = new Map<string, string>();
  for (const beat of beats) {
    for (const change of beat.characterChanges) {
      const previous = characterStates.get(change.characterId);
      if (previous && change.before && previous !== change.before) result.push(issue("character_state_conflict", "major", `${change.characterName} 的前置状态与上一节点结果不一致。`, [beat.id], [change.characterId]));
      characterStates.set(change.characterId, change.after);
    }
    for (const change of beat.relationshipChanges) {
      const key = [...change.characterIds].sort().join("|");
      const previous = relationshipStates.get(key);
      if (previous && change.before && previous !== change.before) result.push(issue("relationship_state_conflict", "major", "关系变化前状态与上一节点结果不一致。", [beat.id], change.characterIds));
      relationshipStates.set(key, change.after);
    }
    for (const change of beat.worldChanges) {
      const previous = worldStates.get(change.entity);
      if (previous && change.before && previous !== change.before) result.push(issue("world_state_conflict", "major", `${change.entity} 的世界状态前后冲突。`, [beat.id]));
      worldStates.set(change.entity, change.after);
    }
    if (beat.prerequisites.some((item) => /知道|获悉|得知/.test(item)) && !beats.slice(0, beats.indexOf(beat)).some((candidate) => candidate.newInformation.length || candidate.dependencies.some((dependency) => dependency.type === "reveals"))) result.push(issue("information_before_acquired", "major", "节点使用了此前尚未获得的信息。", [beat.id]));
    if (/不出现手机|禁止现代科技/.test(bible.worldRulesSummary) && /手机|互联网|微信/.test(`${beat.summary}${beat.mainAction}`)) result.push(issue("world_rule_conflict", "critical", "情节违反故事圣经中的世界规则。", [beat.id]));
  }
  for (const arc of variant.characterArcs) {
    const character = variant.characterPlans.find((plan) => plan.id === arc.characterPlanId);
    if (character && arc.endingState && !beats.some((beat) => beat.characterChanges.some((change) => change.characterId === character.characterId))) result.push(issue("declared_change_missing", "major", `${character.characterName} 声明了角色弧变化，但节点没有记录状态变化。`, [], [character.characterId]));
  }
  const invalidSources = [
    ...bible.sources,
    ...bible.constraints.flatMap((constraint) => constraint.sources),
    ...variant.characterPlans.flatMap((item) => item.sources || []),
    ...variant.characterArcs.flatMap((item) => item.sources || []),
    ...variant.relationshipArcs.flatMap((item) => item.sources || []),
    ...variant.outline.sections.flatMap((item) => item.sources || []),
    ...variant.timeline.events.flatMap((item) => item.sources || []),
  ].filter((source) => !source.valid);
  if (invalidSources.length) result.push(issue("invalid_source_reference", "major", `规划包含 ${invalidSources.length} 个无效来源引用。`));
  if (!beats.some((beat) => /高潮/.test(beat.title) && bible.coreConflict && beat.purpose.includes(bible.coreConflict.slice(0, 8)))) result.push(issue("climax_unrelated", "moderate", "高潮与核心冲突的关联不明确。"));
  if (!bible.endingDirection.trim()) result.push(issue("ending_unresolved", "moderate", "结局方向没有回应主要问题。"));
  const summaries = beats.map((beat) => beat.summary).filter((summary) => summary.length > 30);
  if (new Set(summaries).size < summaries.length) result.push(issue("duplicate_content", "minor", "多个节点正文高度重复。"));

  if (baseline) {
    for (const field of baseline.storyBible.lockedFields) if (JSON.stringify((baseline.storyBible as Record<string, unknown>)[field]) !== JSON.stringify((bible as Record<string, unknown>)[field])) result.push(issue("locked_content_changed", "critical", `锁定字段 ${field} 被修改。`));
    const lockedBeatIds = new Set(baseline.outline.beats.filter((beat) => beat.locked || beat.status === "locked").map((beat) => beat.id));
    for (const id of lockedBeatIds) if (!beats.some((beat) => beat.id === id)) result.push(issue("locked_content_changed", "critical", `锁定节点 ${id} 被删除。`, [id]));
    for (const baselineBeat of baseline.outline.beats.filter((beat) => beat.locked || beat.status === "locked")) {
      const current = beats.find((beat) => beat.id === baselineBeat.id);
      if (current && JSON.stringify(current) !== JSON.stringify(baselineBeat)) result.push(issue("locked_content_changed", "critical", `锁定节点 ${baselineBeat.title} 被修改。`, [baselineBeat.id]));
    }
  }
  return result;
}
