import type { ChapterPlanningProject, ScenePlanVersion } from "@/domain/chapter-planning";
import type { Manuscript } from "@/domain/prose";
import type { StoryPlan } from "@/domain/story-planning";
import {
  CharacterSnapshotSchema, RelationshipSnapshotSchema, WorldSnapshotSchema, KnowledgeStateSchema,
  ProjectTimelineSchema, ProjectTimelineEventSchema, SceneSummarySchema, ChapterSummarySchema,
  PlanManuscriptDriftSchema, ContinuityIssueSchema, WritingProgressSchema, ProjectHealthReportSchema,
  NextChapterContextPackageSchema, ForeshadowThreadSchema, ForeshadowEventSchema, PlotThreadSchema,
  createContinuitySource, continuityBase, continuityNow,
  type CharacterSnapshot, type RelationshipSnapshot, type WorldSnapshot, type KnowledgeState,
  type ProjectTimeline, type SceneSummary, type ChapterSummary, type PlanManuscriptDrift,
  type ContinuityIssue, type ContinuityProject, type WritingProgress, type ProjectHealthReport,
  type NextChapterContextPackage,
} from "@/domain/continuity";

const acceptedSceneVersion = (manuscript: Manuscript, scenePlanId: string) => {
  for (const chapter of manuscript.chapterDrafts) for (const scene of chapter.sceneDrafts) if (scene.scenePlanId === scenePlanId) {
    const version = scene.versions.find((v) => v.id === scene.acceptedVersionId);
    if (version) return { chapter, scene, version, text: version.blocks.map((b) => b.text).join("\n\n") };
  }
  return null;
};

const adoptedSceneVersion = (b2: ChapterPlanningProject, sceneId: string): { chapterId: string; volumeId: string; scene: ScenePlanVersion } | null => {
  for (const volume of b2.volumes) for (const chapter of volume.chapters) for (const cv of chapter.versions) for (const scene of cv.scenes) if (scene.id === sceneId) {
    const version = scene.versions.find((v) => v.id === scene.adoptedVersionId) ?? scene.versions[0];
    if (version) return { chapterId: chapter.id, volumeId: volume.id, scene: version };
  }
  return null;
};

export function deriveSnapshots(b2Projects: ChapterPlanningProject[], manuscripts: Manuscript[] = []): {
  characters: CharacterSnapshot[]; relationships: RelationshipSnapshot[]; worlds: WorldSnapshot[]; knowledge: KnowledgeState[];
} {
  const characters: CharacterSnapshot[] = []; const relationships: RelationshipSnapshot[] = []; const worlds: WorldSnapshot[] = []; const knowledge: KnowledgeState[] = [];
  let order = 0;
  for (const b2 of b2Projects) {
    for (const volume of b2.volumes) for (const chapter of volume.chapters) {
      const cv = chapter.versions.find((v) => v.id === chapter.adoptedVersionId) ?? chapter.versions[0]; if (!cv) continue;
      for (const scene of cv.scenes) {
        const sv = scene.versions.find((v) => v.id === scene.adoptedVersionId) ?? scene.versions[0]; if (!sv) continue;
        for (const [phase, state] of [["entry", sv.entryState], ["exit", sv.exitState]] as const) {
          const sourceType = phase === "entry" ? "scene_entry" : "scene_exit";
          for (const characterId of state.presentCharacterIds) characters.push(CharacterSnapshotSchema.parse({
            ...continuityBase("character_snapshot"), characterId, chapterId: chapter.id, sceneId: scene.id, order: order * 2 + (phase === "exit" ? 1 : 0),
            time: state.time || sv.time, location: state.location || sv.location, body: state.bodyStates[characterId] ?? "", emotion: state.emotionStates[characterId] ?? "",
            goal: state.currentGoals[characterId] ?? sv.characterGoals[characterId] ?? "", informationIds: state.knownInformationIds, items: state.heldItems[characterId] ?? [],
            unfinishedActions: state.unresolvedConflicts, sources: [createContinuitySource(sourceType, state.id, { sourceName: `${sv.title} ${phase}`, version: sv.id, authority: 6, classification: "project_fact" })],
          }));
          for (const [pair, relation] of Object.entries(state.relationshipStates)) relationships.push(RelationshipSnapshotSchema.parse({
            ...continuityBase("relationship_snapshot"), characterIds: pair.split(/[|,/、与和]/).map((v) => v.trim()).filter(Boolean).slice(0, 2),
            chapterId: chapter.id, sceneId: scene.id, order: order * 2 + (phase === "exit" ? 1 : 0), relationship: relation,
            sources: [createContinuitySource(sourceType, state.id, { sourceName: `${sv.title} ${phase}`, version: sv.id, authority: 6, classification: "project_fact" })],
          }));
          if (state.location) worlds.push(WorldSnapshotSchema.parse({ ...continuityBase("world_snapshot"), entityId: state.location, entityType: "location", chapterId: chapter.id, sceneId: scene.id, order: order * 2, state: `${state.presentCharacterIds.join("、")}在场`, sources: [createContinuitySource(sourceType, state.id, { authority: 6, classification: "project_fact" })] }));
        }
        order++;
      }
    }
    for (const item of b2.informationItems) knowledge.push(KnowledgeStateSchema.parse({
      ...continuityBase("knowledge"), informationId: item.id, title: item.title, content: item.content, public: item.secrecy === "public", secret: item.secrecy === "secret", verified: item.verification === "verified",
      readerStatus: item.readerState === "known" ? "knows" : item.readerState === "misled" ? "believes_false" : "does_not_know",
      holders: Object.entries(item.characterStates).map(([characterId, state]) => ({ characterId, status: state === "known" ? "knows" : state === "misunderstood" ? "believes_false" : "does_not_know" })),
      sources: [createContinuitySource("b2_project", item.id, { sourceName: item.title, version: item.modifiedAt, authority: 6, classification: "project_fact" })],
    }));
  }
  let candidateOrder = order * 2 + 1;
  for (const manuscript of manuscripts) for (const chapter of manuscript.chapterDrafts) for (const scene of chapter.sceneDrafts) for (const change of scene.candidateStateChanges) {
    if (change.decision === "ignored") continue;
    const confirmed = change.decision === "confirmed"; const sources = [createContinuitySource("candidate_state", change.id, { sourceName: scene.title, excerpt: change.triggerText, version: change.versionId, authority: confirmed ? 6 : 7, classification: "project_fact" })];
    if (change.changeType === "character" || change.changeType === "item") characters.push(CharacterSnapshotSchema.parse({ ...continuityBase("character_snapshot"), status: confirmed ? "confirmed" : "candidate", confirmed, characterId: change.entityIds[0] ?? "unknown", chapterId: chapter.chapterPlanId, sceneId: scene.scenePlanId, order: candidateOrder++, body: change.changeType === "character" ? change.after : "", items: change.changeType === "item" ? [change.after] : [], sources }));
    if (change.changeType === "relationship" && change.entityIds.length >= 2) relationships.push(RelationshipSnapshotSchema.parse({ ...continuityBase("relationship_snapshot"), status: confirmed ? "confirmed" : "candidate", confirmed, characterIds: change.entityIds.slice(0, 2), chapterId: chapter.chapterPlanId, sceneId: scene.scenePlanId, order: candidateOrder++, relationship: change.after, sources }));
    if (change.changeType === "world") worlds.push(WorldSnapshotSchema.parse({ ...continuityBase("world_snapshot"), status: confirmed ? "confirmed" : "candidate", confirmed, entityId: change.entityIds[0] ?? "unknown", chapterId: chapter.chapterPlanId, sceneId: scene.scenePlanId, order: candidateOrder++, state: change.after, sources }));
    if (change.changeType === "information") knowledge.push(KnowledgeStateSchema.parse({ ...continuityBase("knowledge"), status: confirmed ? "confirmed" : "candidate", informationId: change.id, title: change.after, content: change.after, holders: change.entityIds.map((characterId) => ({ characterId, status: "knows", channel: change.triggerText, sourceIds: [change.id] })), sources }));
  }
  return { characters, relationships: relationships.filter((item) => item.characterIds.length >= 2), worlds, knowledge };
}

export function integrateProjectTimeline(storyPlans: StoryPlan[], b2Projects: ChapterPlanningProject[], project: ContinuityProject): ProjectTimeline {
  const events = [...project.timeline.events];
  const seen = new Set(events.map((event) => event.sources[0] ? `${event.sources[0].sourceType}:${event.sources[0].sourceId}` : event.id));
  const add = (event: Parameters<typeof ProjectTimelineEventSchema.parse>[0], key: string) => { if (!seen.has(key)) { events.push(ProjectTimelineEventSchema.parse(event)); seen.add(key); } };
  for (const plan of storyPlans) for (const variant of plan.variants.filter((v) => v.id === plan.adoptedVariantId || v.adopted)) for (const event of variant.timeline.events) add({
    ...continuityBase("timeline_event"), title: event.title, description: `${event.content} ${event.result}`.trim(), timeType: event.timeType === "order_only" ? "order" : event.timeType,
    date: event.date, storyDay: event.storyDay, relativeToEventId: event.relativeToEventId, relativeOffset: event.relativeOffset, order: event.order, location: event.location, characterIds: event.characterIds,
    sources: [createContinuitySource("timeline", event.id, { sourceName: event.title, version: variant.modifiedAt, authority: 5, classification: "project_fact" })],
  }, `timeline:${event.id}`);
  let order = events.length;
  for (const b2 of b2Projects) for (const volume of b2.volumes) for (const chapter of volume.chapters) {
    const cv = chapter.versions.find((v) => v.id === chapter.adoptedVersionId) ?? chapter.versions[0]; if (!cv) continue;
    for (const scene of cv.scenes) { const sv = scene.versions.find((v) => v.id === scene.adoptedVersionId) ?? scene.versions[0]; if (!sv) continue;
      add({ ...continuityBase("timeline_event"), title: sv.title, description: `${sv.action} ${sv.result}`.trim(), timeType: "order", order: order++, location: sv.location,
        characterIds: sv.presentCharacterIds, chapterId: chapter.id, sceneId: scene.id, sources: [createContinuitySource("scene_plan", scene.id, { version: sv.id, authority: 6, classification: "project_fact" })] }, `scene_plan:${scene.id}`);
    }
  }
  for (const fact of project.canonLedger.facts.filter((f) => f.factType === "time" || f.factType === "event")) add({
    ...continuityBase("timeline_event"), title: fact.title, description: fact.content, timeType: fact.effectiveFrom ? "date" : "unknown", date: fact.effectiveFrom, order: order++, characterIds: fact.entityIds,
    status: fact.status === "confirmed" || fact.status === "locked" ? "confirmed" : "candidate", sources: [createContinuitySource("canon", fact.id, { version: fact.modifiedAt, authority: fact.authority, classification: fact.status === "candidate" ? "unknown" : "confirmed_fact" })],
  }, `canon:${fact.id}`);
  for (const snapshot of project.characterSnapshots) add({ ...continuityBase("timeline_event"), title: `${snapshot.characterId} 状态`, description: `${snapshot.body} ${snapshot.emotion} ${snapshot.goal}`.trim(), timeType: snapshot.time ? "unknown" : "order", order: snapshot.order, start: snapshot.time, location: snapshot.location, characterIds: [snapshot.characterId], chapterId: snapshot.chapterId, sceneId: snapshot.sceneId, status: snapshot.confirmed ? "confirmed" : "candidate", sources: snapshot.sources }, `character_snapshot:${snapshot.id}`);
  for (const thread of project.plotThreads) for (const event of thread.events) add({ ...continuityBase("timeline_event"), title: `${thread.title} · ${event.eventType}`, description: event.summary, timeType: "order", order: event.order, chapterId: event.chapterId, sceneId: event.sceneId, characterIds: thread.characterIds, status: event.status === "occurred" ? "confirmed" : "candidate", sources: [...thread.sources, ...event.sources] }, `plot_thread:${event.id}`);
  for (const thread of project.foreshadowThreads) for (const event of thread.events) add({ ...continuityBase("timeline_event"), title: `${thread.title} · ${event.eventType}`, description: event.description, timeType: "order", order: event.order, chapterId: event.chapterId, sceneId: event.sceneId, status: event.status === "occurred" ? "confirmed" : "candidate", sources: [...thread.sources, ...event.sources] }, `foreshadow:${event.id}`);
  return ProjectTimelineSchema.parse({ ...project.timeline, events: events.sort((a, b) => a.order - b.order), modifiedAt: continuityNow() });
}

const sentences = (text: string) => text.split(/(?<=[。！？!?])|\n+/).map((s) => s.trim()).filter(Boolean);
export function summarizeAcceptedManuscript(manuscript: Manuscript, previousSceneSummaries: SceneSummary[] = [], previousChapterSummaries: ChapterSummary[] = []): { scenes: SceneSummary[]; chapters: ChapterSummary[] } {
  const scenes: SceneSummary[] = [];
  const chapters: ChapterSummary[] = [];
  for (const chapter of manuscript.chapterDrafts) {
    const chapterVersions: string[] = []; const chapterEvents: Array<{ content: string; classification: "fact"; sourceIds: string[] }> = [];
    for (const scene of chapter.sceneDrafts) {
      const accepted = scene.versions.find((version) => version.id === scene.acceptedVersionId); if (!accepted) continue;
      chapterVersions.push(accepted.id); const text = accepted.blocks.map((block) => block.text).join("\n"); const items = sentences(text).slice(0, 4).map((content) => ({ content: content.slice(0, 220), classification: "fact" as const, sourceIds: accepted.blocks.filter((b) => b.text.includes(content)).map((b) => b.id) }));
      chapterEvents.push(...items);
      const previous = previousSceneSummaries.find((summary) => summary.sceneId === scene.scenePlanId);
      scenes.push(SceneSummarySchema.parse({ ...continuityBase("scene_summary"), status: "current", chapterId: chapter.chapterPlanId, sceneId: scene.scenePlanId,
        sourceManuscriptId: manuscript.id, sourceDraftVersionIds: [accepted.id], majorEvents: items, newFacts: scene.candidateFacts.filter((f) => f.versionId === accepted.id).map((f) => ({ content: f.content, classification: "fact", sourceIds: [f.id] })),
        characterChanges: scene.candidateStateChanges.filter((c) => c.versionId === accepted.id && c.changeType === "character").map((c) => ({ content: `${c.before} → ${c.after}`, classification: "inference", sourceIds: [c.id] })),
        relationshipChanges: scene.candidateStateChanges.filter((c) => c.versionId === accepted.id && c.changeType === "relationship").map((c) => ({ content: `${c.before} → ${c.after}`, classification: "inference", sourceIds: [c.id] })),
        endingState: items.at(-1)?.content ?? "", sources: [createContinuitySource("draft_version", accepted.id, { sourceName: scene.title, version: accepted.modifiedAt, authority: 3, classification: "project_fact" })],
        createdAt: previous?.createdAt ?? continuityNow(),
      }));
    }
    if (chapterVersions.length) { const previous = previousChapterSummaries.find((summary) => summary.chapterId === chapter.chapterPlanId); chapters.push(ChapterSummarySchema.parse({
      ...continuityBase("chapter_summary"), status: "current", chapterId: chapter.chapterPlanId, sourceManuscriptId: manuscript.id, sourceDraftVersionIds: chapterVersions,
      majorEvents: chapterEvents.slice(0, 10), endingState: chapterEvents.at(-1)?.content ?? "", sources: chapterVersions.map((id) => createContinuitySource("draft_version", id, { sourceName: chapter.title, authority: 3, classification: "project_fact" })), createdAt: previous?.createdAt ?? continuityNow(),
    })); }
  }
  return { scenes, chapters };
}

export function markStaleSummaries(manuscripts: Manuscript[], scenes: SceneSummary[], chapters: ChapterSummary[]): { scenes: SceneSummary[]; chapters: ChapterSummary[] } {
  const acceptedIds = new Set(manuscripts.flatMap((m) => m.chapterDrafts.flatMap((c) => c.sceneDrafts.map((s) => s.acceptedVersionId).filter(Boolean) as string[])));
  const update = <T extends SceneSummary | ChapterSummary>(summary: T): T => summary.sourceDraftVersionIds.every((id) => acceptedIds.has(id)) ? summary : { ...summary, stale: true, status: "stale", modifiedAt: continuityNow() };
  return { scenes: scenes.map(update), chapters: chapters.map(update) };
}

export function analyzePlanManuscriptDrift(b2Projects: ChapterPlanningProject[], manuscripts: Manuscript[]): PlanManuscriptDrift[] {
  const drifts: PlanManuscriptDrift[] = [];
  for (const b2 of b2Projects) for (const volume of b2.volumes) for (const chapter of volume.chapters) {
    const cv = chapter.versions.find((v) => v.id === chapter.adoptedVersionId) ?? chapter.versions[0]; if (!cv) continue;
    for (const scene of cv.scenes) { const sv = scene.versions.find((v) => v.id === scene.adoptedVersionId) ?? scene.versions[0]; if (!sv) continue;
      const manuscript = manuscripts.find((m) => m.b2ProjectId === b2.id); const prose = manuscript ? acceptedSceneVersion(manuscript, scene.id) : null;
      if (!prose) { drifts.push(PlanManuscriptDriftSchema.parse({ ...continuityBase("drift"), driftType: "planned_event_missing", planSourceId: scene.id, chapterId: chapter.id, sceneId: scene.id, description: `计划场景“${sv.title}”尚无采用正文。`, recommendation: "生成或采用该场景正文。", sources: [createContinuitySource("scene_plan", scene.id, { version: sv.id, authority: 6, classification: "project_fact" })] })); continue; }
      const missingCoverage = prose.scene.coverage.filter((item) => item.status === "missing" || item.status === "contradicted");
      for (const coverage of missingCoverage) drifts.push(PlanManuscriptDriftSchema.parse({ ...continuityBase("drift"), driftType: coverage.element === "information_change" ? "information_reveal" : coverage.element === "relationship_change" ? "relationship_change" : coverage.element === "exit_state" ? "ending_state" : "planned_event_missing", planSourceId: scene.id, manuscriptSourceId: prose.version.id, chapterId: chapter.id, sceneId: scene.id, description: coverage.rationale || `正文未覆盖 ${coverage.label || coverage.element}。`, recommendation: "确认这是有意偏差，或创建正文修订任务。", sources: [...coverage.sources, createContinuitySource("draft_version", prose.version.id, { authority: 3, classification: "project_fact" })] }));
      if (prose.scene.candidateFacts.some((f) => f.versionId === prose.version.id && f.importance === "high" && !f.alreadyExists)) drifts.push(PlanManuscriptDriftSchema.parse({ ...continuityBase("drift"), driftType: "major_addition", planSourceId: scene.id, manuscriptSourceId: prose.version.id, chapterId: chapter.id, sceneId: scene.id, description: "采用正文包含规划未记录的重要新增事实。", recommendation: "审阅候选事实；需要时创建规划副本。", sources: [createContinuitySource("draft_version", prose.version.id, { authority: 3, classification: "project_fact" })] }));
    }
  }
  return drifts;
}

const issue = (type: string, title: string, patch: Partial<ContinuityIssue> = {}): ContinuityIssue => ContinuityIssueSchema.parse({ ...continuityBase("continuity_issue"), type, title, severity: "moderate", confidence: "medium", ...patch });

export function validateContinuity(project: ContinuityProject): ContinuityIssue[] {
  const issues: ContinuityIssue[] = [];
  for (const conflict of project.canonLedger.conflicts.filter((c) => c.status === "open")) issues.push(issue("canon_conflict", "存在未处理的 Canon 冲突", { severity: "major", confidence: "high", heuristic: false, sources: conflict.sources, affectedEntityIds: conflict.factIds, rationale: conflict.description, minimumRevision: "打开冲突并明确保留、替换、分时生效或 Retcon。" }));
  for (const fact of project.canonLedger.facts.filter((f) => f.status === "deprecated" && project.timeline.events.some((e) => e.sources.some((s) => s.sourceId === f.id)))) issues.push(issue("deprecated_fact_used", "废弃事实仍被时间线使用", { severity: "major", confidence: "high", heuristic: false, affectedEntityIds: fact.entityIds, sources: fact.sources, minimumRevision: "更新引用或恢复事实状态。" }));
  for (const retcon of project.canonLedger.retcons.filter((r) => r.sourceIdsToReview.length > 0)) issues.push(issue("retcon_not_synchronized", "Retcon 仍有待复查来源", { severity: "moderate", confidence: "high", heuristic: false, affectedChapterIds: retcon.affectedChapterIds, affectedEntityIds: retcon.affectedCharacterIds, sources: retcon.sources, rationale: `${retcon.sourceIdsToReview.length} 个来源待复查。`, minimumRevision: "逐项复查并从清单移除已同步来源。" }));
  const characterSnapshots = [...project.characterSnapshots].sort((a, b) => a.order - b.order);
  for (let i = 0; i < characterSnapshots.length; i++) for (let j = i + 1; j < characterSnapshots.length; j++) {
    const a = characterSnapshots[i], b = characterSnapshots[j]; if (a.characterId !== b.characterId || a.order !== b.order) continue;
    if (a.location && b.location && a.location !== b.location) issues.push(issue("character_location_conflict", "角色同一时点出现在不同地点", { severity: "critical", confidence: "high", heuristic: false, affectedChapterIds: [a.chapterId, b.chapterId].filter(Boolean), affectedEntityIds: [a.characterId], sources: [...a.sources, ...b.sources], rationale: `${a.location} / ${b.location}`, minimumRevision: "修正地点或补充移动时间。" }));
    if (a.body && b.body && a.body !== b.body) issues.push(issue("body_state_conflict", "角色身体状态互相冲突", { severity: "major", confidence: "high", heuristic: false, affectedEntityIds: [a.characterId], sources: [...a.sources, ...b.sources], minimumRevision: "明确状态变化触发事件。" }));
  }
  for (const relation of project.relationshipSnapshots) { const previous = project.relationshipSnapshots.filter((r) => r.characterIds.sort().join("|") === relation.characterIds.sort().join("|") && r.order < relation.order).sort((a, b) => b.order - a.order)[0]; if (previous && previous.relationship !== relation.relationship && relation.sources.length === 0) issues.push(issue("relationship_jump", "关系变化缺少可校验来源", { affectedEntityIds: relation.characterIds, rationale: `${previous.relationship} → ${relation.relationship}`, minimumRevision: "补充触发场景或标记为候选。" })); }
  for (const knowledge of project.knowledgeStates) {
    if (knowledge.public && knowledge.secret) issues.push(issue("secret_state_conflict", "同一信息同时标记为公开与秘密", { confidence: "high", heuristic: false, affectedEntityIds: [knowledge.informationId], sources: knowledge.sources, minimumRevision: "明确公开范围和生效时间。" }));
    for (const holder of knowledge.holders) if ((holder.status === "knows" || holder.status === "believes_true") && !holder.channel.trim()) issues.push(issue("knowledge_channel_missing", "角色知情缺少获取渠道", { severity: "major", affectedEntityIds: [holder.characterId, knowledge.informationId], sources: knowledge.sources, rationale: `${holder.characterId} 已知“${knowledge.title}”，但未记录渠道。`, minimumRevision: "关联揭示场景或补充渠道。" }));
  }
  const timeline = [...project.timeline.events].sort((a, b) => a.order - b.order);
  for (let i = 0; i < timeline.length; i++) for (let j = i + 1; j < timeline.length; j++) { const a = timeline[i], b = timeline[j]; const shared = a.characterIds.filter((id) => b.characterIds.includes(id)); if (a.order === b.order && shared.length && a.location && b.location && a.location !== b.location) issues.push(issue("timeline_location_conflict", "时间线同序地点冲突", { severity: "critical", confidence: "high", heuristic: false, affectedChapterIds: [a.chapterId, b.chapterId].filter(Boolean), affectedEntityIds: shared, sources: [...a.sources, ...b.sources], minimumRevision: "调整顺序、地点或增加移动事件。" })); }
  for (const thread of project.plotThreads) if (thread.status === "active" && !thread.events.some((e) => e.eventType === "advanced" || e.eventType === "resolved")) issues.push(issue("stalled_plot_thread", "活跃剧情线长期无推进", { severity: "minor", confidence: "medium", affectedEntityIds: [thread.id], sources: thread.sources, rationale: thread.title, minimumRevision: "安排推进节点，或明确暂停。" }));
  for (const question of project.openQuestions.filter((q) => q.status === "unanswered" && !q.plannedAnswerLocation)) issues.push(issue("open_question_unplanned", "关键问题未安排回答位置", { severity: "minor", confidence: "medium", affectedEntityIds: [question.id], sources: question.sources, rationale: question.question, minimumRevision: "设置计划回答章节，或标记为有意开放。" }));
  for (const thread of project.foreshadowThreads) {
    const setupOrders = thread.events.filter((e) => e.eventType === "setup").map((e) => e.order); const payoffOrders = thread.events.filter((e) => e.eventType === "payoff").map((e) => e.order);
    if (payoffOrders.length && !setupOrders.length) issues.push(issue("payoff_without_setup", "存在无铺垫回收", { severity: "major", confidence: "high", heuristic: false, affectedEntityIds: [thread.id], sources: thread.sources, minimumRevision: "补充设置位置或取消回收标记。" }));
    if (setupOrders.length && payoffOrders.some((p) => p < Math.min(...setupOrders))) issues.push(issue("payoff_before_setup", "伏笔回收早于设置", { severity: "major", confidence: "high", heuristic: false, affectedEntityIds: [thread.id], sources: thread.sources, minimumRevision: "调整事件顺序。" }));
    if (thread.overdue || thread.status === "due") issues.push(issue("foreshadow_overdue", "计划章节已过但伏笔未回收", { severity: "moderate", confidence: "medium", affectedEntityIds: [thread.id], sources: thread.sources, minimumRevision: "安排回收、延期或废弃。" }));
  }
  for (const drift of project.drifts.filter((d) => d.status === "open")) issues.push(issue("plan_manuscript_drift", "规划与正文存在未处理偏差", { severity: drift.driftType === "ending_state" ? "major" : "moderate", confidence: "high", heuristic: false, affectedChapterIds: [drift.chapterId].filter(Boolean), sources: drift.sources, rationale: drift.description, minimumRevision: drift.recommendation }));
  for (const summary of [...project.chapterSummaries, ...project.sceneSummaries].filter((s) => s.stale)) issues.push(issue("stale_summary", "正文变化后摘要已过期", { severity: "minor", confidence: "high", heuristic: false, affectedChapterIds: [summary.chapterId], sources: summary.sources, minimumRevision: "基于当前采用正文重新生成摘要。" }));
  for (const fact of project.canonLedger.facts.filter((f) => f.locked && f.conflictFactIds.length)) issues.push(issue("locked_canon_violated", "锁定 Canon 存在冲突引用", { severity: "critical", confidence: "high", heuristic: false, affectedEntityIds: fact.entityIds, sources: fact.sources, rationale: fact.content, minimumRevision: "保留锁定事实；创建修订任务或显式 Retcon。" }));
  const ageFacts = project.canonLedger.facts.filter((f) => f.factType === "character" && /\d+\s*岁/.test(f.content) && !["deprecated", "retconned"].includes(f.status));
  for (let i = 0; i < ageFacts.length; i++) for (let j = i + 1; j < ageFacts.length; j++) if (ageFacts[i].entityIds.some((id) => ageFacts[j].entityIds.includes(id)) && ageFacts[i].content.match(/\d+/)?.[0] !== ageFacts[j].content.match(/\d+/)?.[0]) issues.push(issue("character_age_conflict", "人物年龄记录冲突", { severity: "major", confidence: "high", heuristic: false, affectedEntityIds: ageFacts[i].entityIds, sources: [...ageFacts[i].sources, ...ageFacts[j].sources], rationale: `${ageFacts[i].content} / ${ageFacts[j].content}`, minimumRevision: "确认时间点或统一年龄事实。" }));
  for (let i = 1; i < characterSnapshots.length; i++) { const prev = characterSnapshots[i - 1], next = characterSnapshots[i]; if (prev.characterId !== next.characterId) continue;
    if (prev.location && next.location && prev.location !== next.location && next.order - prev.order <= 1 && prev.time === next.time) issues.push(issue("travel_time_insufficient", "角色移动时间可能不足", { severity: "moderate", confidence: "medium", affectedChapterIds: [prev.chapterId, next.chapterId].filter(Boolean), affectedEntityIds: [next.characterId], sources: [...prev.sources, ...next.sources], rationale: `${prev.location} → ${next.location}，时间均为 ${next.time || "同序"}`, minimumRevision: "增加移动时间、过场或修正地点。" }));
    if (/(伤|骨折|中毒|昏迷)/.test(prev.body) && /(无伤|痊愈|健康|正常)/.test(next.body) && next.order - prev.order <= 2) issues.push(issue("injury_recovery_abnormal", "伤势恢复可能过快", { severity: "moderate", confidence: "medium", affectedEntityIds: [next.characterId], sources: [...prev.sources, ...next.sources], rationale: `${prev.body} → ${next.body}`, minimumRevision: "补充治疗与时间，或降低恢复程度。" }));
    if (prev.goal && next.goal && prev.goal !== next.goal && next.order - prev.order <= 1 && next.sources.length === 0) issues.push(issue("character_goal_jump", "角色目标突然改变", { severity: "moderate", confidence: "medium", affectedEntityIds: [next.characterId], rationale: `${prev.goal} → ${next.goal}`, minimumRevision: "补充目标变化的触发事件。" }));
  }
  for (const thread of project.plotThreads.filter((t) => t.status === "resolved")) for (const question of project.openQuestions.filter((q) => q.plotThreadIds.includes(thread.id) && (q.status === "unanswered" || q.status === "partially_answered"))) issues.push(issue("resolved_thread_still_open", "已解决剧情线仍有开放问题", { severity: "moderate", confidence: "high", heuristic: false, affectedEntityIds: [thread.id, question.id], sources: [...thread.sources, ...question.sources], minimumRevision: "确认问题是否已回答，或重新打开剧情线。" }));
  for (const thread of project.foreshadowThreads.filter((f) => f.status === "abandoned" && f.events.some((e) => e.eventType === "payoff"))) issues.push(issue("abandoned_foreshadow_used", "已废弃伏笔仍被正文回收", { severity: "major", confidence: "high", heuristic: false, affectedEntityIds: [thread.id], sources: thread.sources, minimumRevision: "恢复伏笔状态、移除回收或创建 Retcon。" }));
  const invalidSources = [project.canonLedger, ...project.entities, ...project.characterSnapshots, ...project.relationshipSnapshots, ...project.worldSnapshots, ...project.knowledgeStates, ...project.plotThreads, ...project.openQuestions, ...project.foreshadowThreads, project.timeline, ...project.chapterSummaries, ...project.sceneSummaries, ...project.drifts].flatMap((value) => value.sources.filter((source) => !source.valid));
  if (invalidSources.length) issues.push(issue("stale_source_version", "存在失效或过期来源引用", { severity: "moderate", confidence: "high", heuristic: false, sources: invalidSources, rationale: `${invalidSources.length} 条来源无效。`, minimumRevision: "重新选择当前版本来源并刷新引用。" }));
  return issues;
}

export function calculateWritingProgress(manuscripts: Manuscript[], b2Projects: ChapterPlanningProject[], existingGoals: WritingProgress["goals"] = []): WritingProgress {
  const chapterWords: WritingProgress["chapterWords"] = []; const sceneWords: WritingProgress["sceneWords"] = []; let totalWords = 0; let acceptedScenes = 0; let revisedScenes = 0; let lastEditedAt = "";
  for (const manuscript of manuscripts) for (const chapter of manuscript.chapterDrafts) { let words = 0; for (const scene of chapter.sceneDrafts) { const version = scene.versions.find((v) => v.id === scene.acceptedVersionId); const count = version?.wordCount ?? 0; if (version) acceptedScenes++; if (scene.revisions.some((r) => r.decision === "accepted" || r.decision === "partially_accepted")) revisedScenes++; words += count; totalWords += count; if (version && version.modifiedAt > lastEditedAt) lastEditedAt = version.modifiedAt; sceneWords.push({ id: scene.id, name: scene.title, words: count, status: version ? "accepted" : "incomplete" }); } chapterWords.push({ id: chapter.id, name: chapter.title, words, status: chapter.sceneDrafts.length > 0 && chapter.sceneDrafts.every((s) => s.acceptedVersionId) ? "complete" : "incomplete" }); }
  const plannedScenes = b2Projects.reduce((sum, b2) => sum + b2.volumes.reduce((vs, v) => vs + v.chapters.reduce((cs, c) => cs + (c.versions.find((x) => x.id === c.adoptedVersionId)?.scenes.length ?? 0), 0), 0), 0);
  const plannedChapters = b2Projects.reduce((sum, b2) => sum + b2.volumes.reduce((vs, v) => vs + v.chapters.length, 0), 0);
  const volumeWords = b2Projects.flatMap((b2) => b2.volumes.map((volume) => ({ id: volume.id, name: volume.title, words: volume.chapters.reduce((sum, chapter) => sum + (chapterWords.find((item) => item.id === chapter.id)?.words ?? 0), 0), status: "tracked" })));
  return WritingProgressSchema.parse({ ...continuityBase("writing_progress"), totalWords, volumeWords, chapterWords, sceneWords,
    planningCompletion: plannedChapters ? Math.round((b2Projects.reduce((s, b) => s + b.volumes.reduce((a, v) => a + v.chapters.length, 0), 0) / plannedChapters) * 100) : 0,
    draftCompletion: plannedScenes ? Math.min(100, Math.round(acceptedScenes / plannedScenes * 100)) : 0, revisionCompletion: acceptedScenes ? Math.round(revisedScenes / acceptedScenes * 100) : 0,
    lastEditedAt, goals: existingGoals.map((goal) => goal.targetType === "words" ? { ...goal, currentValue: totalWords } : goal),
  });
}

export function buildProjectHealthReport(project: ContinuityProject): ProjectHealthReport {
  const p = project.writingProgress;
  const report = ProjectHealthReportSchema.parse({ ...continuityBase("health"), totalWords: p.totalWords,
    chapterCompletion: p.chapterWords.length ? Math.round(p.chapterWords.filter((c) => c.status === "complete").length / p.chapterWords.length * 100) : 0,
    sceneCompletion: p.draftCompletion, canonConflicts: project.canonLedger.conflicts.filter((c) => c.status === "open").length,
    severeIssues: project.issues.filter((i) => i.status === "open" && (i.severity === "critical" || i.severity === "major")).length,
    activeThreads: project.plotThreads.filter((t) => t.status === "active").length, stalledThreads: project.issues.filter((i) => i.type === "stalled_plot_thread" && i.status === "open").length,
    openQuestions: project.openQuestions.filter((q) => q.status === "unanswered" || q.status === "partially_answered").length,
    pendingForeshadows: project.foreshadowThreads.filter((f) => !["paid_off", "abandoned", "retconned"].includes(f.status)).length,
    staleSummaries: [...project.chapterSummaries, ...project.sceneSummaries].filter((s) => s.stale).length, drifts: project.drifts.filter((d) => d.status === "open").length,
    candidateFacts: project.canonLedger.facts.filter((f) => f.status === "candidate").length,
    nextInheritanceRisks: project.issues.filter((i) => i.status === "open").slice(0, 5).map((i) => i.title),
    priorities: [project.canonLedger.conflicts.some((c) => c.status === "open") ? "先处理 Canon 冲突" : "Canon 当前无开放冲突", project.foreshadowThreads.some((f) => f.overdue) ? "复查过期伏笔" : "伏笔回收计划可控", project.drifts.some((d) => d.status === "open") ? "确认规划与正文偏差" : "规划与正文偏差已处理"], generatedAt: continuityNow(),
  });
  return report;
}

export function buildNextChapterContextPackage(project: ContinuityProject, b2: ChapterPlanningProject | null, chapterId = ""): NextChapterContextPackage {
  let targetChapterId = chapterId; let goal = ""; let previousEndingState = ""; let povRules: string[] = [];
  if (b2) { const ordered = b2.volumes.flatMap((v) => v.chapters).sort((a, b) => a.order - b.order); const target = targetChapterId ? ordered.find((c) => c.id === targetChapterId) : ordered.find((c) => !project.writingProgress.chapterWords.some((w) => w.id === c.id && w.status === "complete")); if (target) { targetChapterId = target.id; const v = target.versions.find((x) => x.id === target.adoptedVersionId) ?? target.versions[0]; goal = v?.chapterGoal ?? ""; if (v) povRules = [`${v.pov.perspective}: ${v.pov.povCharacterIds.join("、")}`, ...v.pov.customRules]; const index = ordered.indexOf(target); const prev = ordered[index - 1]; if (prev) { const pv = prev.versions.find((x) => x.id === prev.adoptedVersionId) ?? prev.versions[0]; previousEndingState = pv?.result ?? ""; } } }
  const activeThreads = project.plotThreads.filter((t) => t.status === "active"); const relevantFacts = project.canonLedger.facts.filter((f) => f.status === "confirmed" || f.status === "locked").slice(0, 20);
  return NextChapterContextPackageSchema.parse({ ...continuityBase("next_context"), chapterId: targetChapterId, chapterGoal: goal, previousEndingState,
    plotThreadIds: activeThreads.map((t) => t.id), characterSnapshotIds: project.characterSnapshots.sort((a, b) => b.order - a.order).slice(0, 8).map((s) => s.id),
    relationshipSnapshotIds: project.relationshipSnapshots.sort((a, b) => b.order - a.order).slice(0, 5).map((s) => s.id), knowledgeStateIds: project.knowledgeStates.filter((k) => k.status !== "deprecated").map((k) => k.id),
    currentItems: project.characterSnapshots.sort((a, b) => b.order - a.order).flatMap((s) => s.items).slice(0, 20), unfinishedActions: project.characterSnapshots.sort((a, b) => b.order - a.order).flatMap((s) => s.unfinishedActions).slice(0, 20),
    foreshadowIds: project.foreshadowThreads.filter((f) => f.status !== "paid_off" && f.status !== "abandoned").map((f) => f.id), payoffIds: project.foreshadowThreads.filter((f) => f.status === "due").map((f) => f.id),
    prohibitedEarlyEvents: project.timeline.events.filter((e) => e.order > 0 && e.status === "confirmed").slice(-5).map((e) => e.title), canonFactIds: relevantFacts.map((f) => f.id),
    povRules, continuityRisks: project.issues.filter((i) => i.status === "open" && ["critical", "major"].includes(i.severity)).slice(0, 8).map((i) => i.title),
    sources: [...relevantFacts.flatMap((f) => f.sources), ...activeThreads.flatMap((t) => t.sources)],
  });
}

export function importB2Foreshadows(b2Projects: ChapterPlanningProject[]) {
  return b2Projects.flatMap((b2) => b2.foreshadows.map((item) => ForeshadowThreadSchema.parse({
    ...continuityBase("foreshadow_thread"), status: item.actualPayoffLocationIds.length ? "paid_off" : item.setupLocationIds.length ? "planted" : "planned",
    title: item.label, description: item.expectedEffect, expectedPayoff: item.expectedEffect, plannedPayoffLocation: item.plannedPayoffLocationIds.join("、"), importedFromB2Id: item.id,
    events: [
      ...item.setupLocationIds.map((location, order) => ForeshadowEventSchema.parse({ ...continuityBase("foreshadow_event"), threadId: item.id, eventType: "setup", sceneId: location, order })),
      ...item.reinforcementLocationIds.map((location, order) => ForeshadowEventSchema.parse({ ...continuityBase("foreshadow_event"), threadId: item.id, eventType: "reinforcement", sceneId: location, order: order + 100 })),
      ...item.plannedPayoffLocationIds.map((location, order) => ForeshadowEventSchema.parse({ ...continuityBase("foreshadow_event"), threadId: item.id, eventType: "planned_payoff", sceneId: location, order: order + 200 })),
      ...item.actualPayoffLocationIds.map((location, order) => ForeshadowEventSchema.parse({ ...continuityBase("foreshadow_event"), threadId: item.id, eventType: "payoff", sceneId: location, order: order + 300 })),
    ], sources: [createContinuitySource("foreshadow", item.id, { sourceName: item.label, version: item.modifiedAt, authority: 6, classification: "project_fact" })],
  })));
}

export function createPlotThreadsFromPlans(storyPlans: StoryPlan[]) {
  return storyPlans.flatMap((plan) => plan.variants.filter((v) => v.id === plan.adoptedVariantId || v.adopted).flatMap((variant) => variant.outline.sections.map((section) => PlotThreadSchema.parse({
    ...continuityBase("plot_thread"), status: "active", title: section.name, description: section.purpose, plotBeatIds: section.beatIds, currentState: "来自采用规划",
    sources: [createContinuitySource("story_plan", section.id, { sourceName: section.name, version: variant.modifiedAt, authority: 5, classification: "project_fact" })],
  }))));
}
