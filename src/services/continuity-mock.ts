import {
  CanonConflictSchema, CharacterSnapshotSchema, RelationshipSnapshotSchema, KnowledgeStateSchema,
  PlotThreadSchema, PlotThreadEventSchema, OpenQuestionSchema, ForeshadowThreadSchema, ForeshadowEventSchema,
  ProjectTimelineEventSchema, PlanManuscriptDriftSchema, RetconRecordSchema, NextChapterContextPackageSchema,
  createEmptyContinuityProject, createCanonFact, createContinuitySource, continuityBase, continuityNow,
  type ContinuityProject,
} from "@/domain/continuity";
import { buildProjectHealthReport, validateContinuity } from "./continuity-engine";

export function createMockContinuityProject(): ContinuityProject {
  const project = createEmptyContinuityProject("烟雨江南 · 连续性中心");
  const source = (id: string, name: string, authority = 3) => createContinuitySource("user", id, { sourceName: name, authority, classification: "confirmed_fact", valid: true });
  const confirmed = [
    createCanonFact({ title: "柳如烟的身份", content: "柳如烟是临水镇柳家的继承人。", factType: "character", entityIds: ["char-liu"], status: "locked", locked: true, authority: 1, sources: [source("user-liu", "用户锁定设定", 1)] }),
    createCanonFact({ title: "古玉限制", content: "古玉不能被普通外力摧毁。", factType: "world_rule", entityIds: ["item-jade"], status: "confirmed", authority: 4, sources: [source("world-jade", "世界书：古玉", 4)] }),
    createCanonFact({ title: "旧案发生时间", content: "旧案发生在故事开始前十二年。", factType: "time", entityIds: ["event-old-case"], status: "confirmed", authority: 2, sources: [source("fact-old-case", "用户确认事实", 2)] }),
    createCanonFact({ title: "顾临川的目标", content: "顾临川追查旧案是为了洗清父亲的污名。", factType: "character", entityIds: ["char-gu"], status: "confirmed", authority: 3, sources: [source("draft-gu-goal", "采用正文第三章", 3)] }),
    createCanonFact({ title: "密道出口", content: "柳家密道出口位于城南废祠。", factType: "location", entityIds: ["loc-tunnel", "loc-temple"], status: "confirmed", authority: 3, sources: [source("draft-tunnel", "采用正文第四章", 3)] }),
  ];
  const candidates = [
    createCanonFact({ title: "古玉会发热", content: "古玉接近真凶时会变热。", factType: "ability", entityIds: ["item-jade"], status: "candidate", authority: 7, sources: [createContinuitySource("candidate_fact", "candidate-heat", { authority: 7, classification: "project_fact" })] }),
    createCanonFact({ title: "掌柜旧身份", content: "客栈掌柜可能曾是县衙书吏。", factType: "character", entityIds: ["char-keeper"], status: "candidate", authority: 8, sources: [createContinuitySource("model_inference", "inference-keeper", { authority: 8, classification: "model_inference" })] }),
    createCanonFact({ title: "雨夜暗号", content: "连续敲窗三次是旧案同盟的暗号。", factType: "secret", entityIds: ["secret-knock"], status: "candidate", authority: 7, sources: [createContinuitySource("candidate_fact", "candidate-knock", { authority: 7, classification: "project_fact" })] }),
  ];
  const oldFact = createCanonFact({ title: "旧版密道出口", content: "柳家密道出口位于河边仓库。", factType: "location", entityIds: ["loc-tunnel"], status: "retconned", authority: 5, sources: [source("plan-tunnel-old", "旧规划", 5)] });
  const conflictFact = createCanonFact({ title: "古玉限制", content: "古玉可以被铁锤轻易击碎。", factType: "world_rule", entityIds: ["item-jade"], status: "disputed", authority: 7, sources: [createContinuitySource("candidate_fact", "candidate-break-jade", { authority: 7, classification: "project_fact" })] });
  const conflict = CanonConflictSchema.parse({ ...continuityBase("canon_conflict"), conflictType: "direct_content", factIds: [confirmed[1].id, conflictFact.id], description: "古玉是否可以被普通外力摧毁存在直接冲突。", sources: [...confirmed[1].sources, ...conflictFact.sources] });
  const retcon = RetconRecordSchema.parse({ ...continuityBase("retcon"), oldFactId: oldFact.id, newFactId: confirmed[4].id, reason: "第四章采用正文改变了密道出口以支持高潮路线。", effectiveScope: "第四章及以后", affectedChapterIds: ["chapter-4", "chapter-5"], affectedCharacterIds: ["char-liu"], sourceIdsToReview: ["plan-tunnel-old"], sources: [...oldFact.sources, ...confirmed[4].sources] });
  project.canonLedger = { ...project.canonLedger, facts: [...confirmed, ...candidates, oldFact, conflictFact], conflicts: [conflict], retcons: [retcon] };

  project.characterSnapshots = [
    CharacterSnapshotSchema.parse({ ...continuityBase("character_snapshot"), status: "confirmed", confirmed: true, characterId: "char-liu", chapterId: "chapter-4", sceneId: "scene-4-3", order: 43, time: "故事第4天夜", location: "柳家旧宅", body: "左臂轻伤", emotion: "警惕但坚定", goal: "带出证据", informationIds: ["info-ledger"], items: ["古玉", "账册残页"], unfinishedActions: ["确认账册真伪"], sources: [source("scene-4-3-exit", "第四章场景3离场状态", 6)] }),
    CharacterSnapshotSchema.parse({ ...continuityBase("character_snapshot"), status: "candidate", characterId: "char-gu", chapterId: "chapter-4", sceneId: "scene-4-3", order: 43, time: "故事第4天夜", location: "柳家旧宅", body: "无明显外伤", emotion: "因怀疑而克制", goal: "保护柳如烟并核实证据", informationIds: ["info-ledger"], items: ["短刀"], unfinishedActions: ["查找证人"], sources: [createContinuitySource("scene_exit", "scene-4-3-exit", { authority: 6, classification: "project_fact" })] }),
  ];
  project.relationshipSnapshots = [
    RelationshipSnapshotSchema.parse({ ...continuityBase("relationship_snapshot"), status: "confirmed", confirmed: true, characterIds: ["char-liu", "char-gu"], chapterId: "chapter-3", order: 30, relationship: "暂时合作", trust: "有限信任", power: "信息不对称", sources: [source("scene-3-exit", "第三章结束状态", 6)] }),
    RelationshipSnapshotSchema.parse({ ...continuityBase("relationship_snapshot"), status: "candidate", characterIds: ["char-liu", "char-gu"], chapterId: "chapter-4", order: 43, relationship: "互相保护", trust: "谨慎增加", power: "趋于平衡", sources: [createContinuitySource("scene_exit", "scene-4-3-exit", { authority: 6, classification: "project_fact" })] }),
  ];
  project.knowledgeStates = [KnowledgeStateSchema.parse({ ...continuityBase("knowledge"), status: "conflicted", informationId: "info-killer", title: "旧案真凶身份", content: "真凶是县丞。", readerStatus: "does_not_know", public: false, secret: true, verified: false, holders: [{ characterId: "char-liu", status: "knows", acquiredAt: "第三章", channel: "", sourceIds: [] }], sources: [createContinuitySource("model_inference", "knowledge-early", { authority: 8, classification: "model_inference" })] })];

  project.plotThreads = [
    PlotThreadSchema.parse({ ...continuityBase("plot_thread"), status: "active", title: "旧案真相", description: "追查十二年前旧案", characterIds: ["char-liu", "char-gu"], currentState: "取得账册残页", nextNode: "寻找书吏证人", plannedResolutionLocation: "第八章", events: [PlotThreadEventSchema.parse({ ...continuityBase("thread_event"), threadId: "thread-case", eventType: "advanced", chapterId: "chapter-4", order: 4, summary: "找到账册残页" })], sources: [source("beat-old-case", "B1 旧案剧情线", 5)] }),
    PlotThreadSchema.parse({ ...continuityBase("plot_thread"), status: "active", title: "柳家名誉", description: "公开真相对柳家的代价", characterIds: ["char-liu"], currentState: "舆论尚未爆发", nextNode: "证据公开", plannedResolutionLocation: "终章", sources: [source("beat-family", "B1 家族代价剧情线", 5)] }),
    PlotThreadSchema.parse({ ...continuityBase("plot_thread"), status: "paused", title: "古玉来源", description: "古玉真正来源仍未知", currentState: "仅确认不能普通摧毁", nextNode: "后续作品再探索", plannedResolutionLocation: "有意开放", sources: [source("world-jade", "世界书：古玉", 4)] }),
  ];
  project.openQuestions = [
    OpenQuestionSchema.parse({ ...continuityBase("open_question"), question: "谁篡改了旧案账册？", plotThreadIds: [project.plotThreads[0].id], introducedAt: "第二章", plannedAnswerLocation: "第七章", sources: [source("question-ledger", "第二章悬念", 3)] }),
    OpenQuestionSchema.parse({ ...continuityBase("open_question"), question: "古玉为何选择柳如烟？", plotThreadIds: [project.plotThreads[2].id], introducedAt: "第一章", plannedAnswerLocation: "", sources: [source("question-jade", "第一章悬念", 3)] }),
  ];
  project.foreshadowThreads = [
    ForeshadowThreadSchema.parse({ ...continuityBase("foreshadow_thread"), status: "reinforced", title: "账册墨色差异", description: "暗示账册被后期篡改", expectedPayoff: "揭示篡改者", plannedPayoffLocation: "第七章", events: [ForeshadowEventSchema.parse({ ...continuityBase("foreshadow_event"), threadId: "ink", eventType: "setup", chapterId: "chapter-2", order: 2, description: "墨色不一" }), ForeshadowEventSchema.parse({ ...continuityBase("foreshadow_event"), threadId: "ink", eventType: "reinforcement", chapterId: "chapter-4", order: 4, description: "纸张年份不符" })], sources: [source("foreshadow-ink", "B2 铺垫", 6)] }),
    ForeshadowThreadSchema.parse({ ...continuityBase("foreshadow_thread"), status: "due", overdue: true, title: "三声敲窗", description: "旧案同盟暗号", expectedPayoff: "同盟现身", plannedPayoffLocation: "第五章", events: [ForeshadowEventSchema.parse({ ...continuityBase("foreshadow_event"), threadId: "knock", eventType: "setup", chapterId: "chapter-1", order: 1, description: "雨夜三声敲窗" })], sources: [source("foreshadow-knock", "第一章正文", 3)] }),
  ];
  project.timeline.events = [
    ProjectTimelineEventSchema.parse({ ...continuityBase("timeline_event"), status: "confirmed", title: "柳如烟抵达旧宅", timeType: "story_day", storyDay: 4, order: 40, location: "柳家旧宅", characterIds: ["char-liu"], chapterId: "chapter-4", sources: [source("timeline-liu-home", "第四章正文", 3)] }),
    ProjectTimelineEventSchema.parse({ ...continuityBase("timeline_event"), status: "conflicted", title: "柳如烟同时在县衙", timeType: "story_day", storyDay: 4, order: 40, location: "县衙", characterIds: ["char-liu"], chapterId: "chapter-4", sources: [createContinuitySource("model_inference", "timeline-liu-yamen", { authority: 8, classification: "model_inference" })] }),
  ];
  project.drifts = [PlanManuscriptDriftSchema.parse({ ...continuityBase("drift"), driftType: "character_choice", planSourceId: "scene-4-3", manuscriptSourceId: "draft-4-3", chapterId: "chapter-4", sceneId: "scene-4-3", description: "规划中柳如烟独自离开；正文中她选择与顾临川同行。", impact: "关系线提前推进。", recommendation: "标记为有意偏差，或创建 B2 规划副本补记。", sources: [source("scene-plan-4-3", "B2 场景计划", 6), source("draft-4-3", "采用正文", 3)] })];
  project.contextPackages = [NextChapterContextPackageSchema.parse({ ...continuityBase("next_context"), chapterId: "chapter-5", chapterGoal: "找到书吏证人并确认账册篡改", previousEndingState: "柳如烟与顾临川携残页离开旧宅", plotThreadIds: project.plotThreads.filter((t) => t.status === "active").map((t) => t.id), characterSnapshotIds: project.characterSnapshots.map((s) => s.id), relationshipSnapshotIds: project.relationshipSnapshots.map((s) => s.id), knowledgeStateIds: project.knowledgeStates.map((s) => s.id), currentItems: ["古玉", "账册残页", "短刀"], unfinishedActions: ["确认账册真伪", "查找书吏证人"], foreshadowIds: project.foreshadowThreads.map((f) => f.id), payoffIds: [project.foreshadowThreads[1].id], prohibitedEarlyEvents: ["直接公开真凶身份"], canonFactIds: confirmed.map((f) => f.id), characterCardIds: ["char-liu", "char-gu"], lorebookEntryIds: ["world-jade"], languageRules: ["对话保持含蓄克制"], povRules: ["第三人称限知：柳如烟"], continuityRisks: ["柳如烟提前知道真凶且缺少渠道", "第4天地点冲突"], lockedFields: ["chapterGoal", "prohibitedEarlyEvents"], sources: confirmed.flatMap((f) => f.sources) })];
  project.issues = validateContinuity(project);
  project.healthReports = [buildProjectHealthReport(project)];
  project.modifiedAt = continuityNow();
  return project;
}
