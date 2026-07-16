import { describe, expect, it } from "vitest";
import {
  CanonLedgerSchema, CanonFactSchema, CanonConflictSchema, RetconRecordSchema, ProjectEntitySchema, EntityAliasSchema,
  CharacterSnapshotSchema, RelationshipSnapshotSchema, WorldSnapshotSchema, KnowledgeStateSchema, PlotThreadSchema,
  PlotThreadEventSchema, OpenQuestionSchema, ForeshadowThreadSchema, ForeshadowEventSchema, ProjectTimelineSchema,
  ProjectTimelineEventSchema, ChapterSummarySchema, SceneSummarySchema, PlanManuscriptDriftSchema, ContinuityIssueSchema,
  ProjectHealthReportSchema, WritingProgressSchema, WritingGoalSchema, NextChapterContextPackageSchema, ContinuityProjectSchema,
  createEmptyContinuityProject, createCanonFact, continuityBase,
} from "@/domain/continuity";
import { createEmptyProjectDraft } from "@/domain/project-draft";
import { createEmptyLorebook, createEmptyLorebookEntry } from "@/domain/lorebook";
import { confirmCanonFact, createRetcon, detectCanonConflicts, mergeCanonFacts, CANON_AUTHORITY } from "@/services/continuity-canon";
import { buildProjectEntityIndex, searchProjectIndex } from "@/services/continuity-index";

describe("C1 runtime schemas", () => {
  it("parses the complete ContinuityProject with safe defaults", () => {
    const project = createEmptyContinuityProject(); expect(ContinuityProjectSchema.parse(project)).toEqual(project);
    expect(project.canonLedger.facts).toEqual([]); expect(project.promptVersions).toHaveLength(11); expect(project.dataVersion).toBe(1);
  });

  it("gives every requested model id, version, status, sources and timestamps", () => {
    const b = continuityBase("test");
    const values = [
      CanonLedgerSchema.parse({ ...b }), CanonFactSchema.parse({ ...b }), CanonConflictSchema.parse({ ...b, conflictType: "direct_content", factIds: ["a", "b"] }),
      RetconRecordSchema.parse({ ...b, oldFactId: "a", newFactId: "b" }), ProjectEntitySchema.parse({ ...b, entityType: "character", name: "甲" }), EntityAliasSchema.parse({ ...b, entityId: "e", value: "别名" }),
      CharacterSnapshotSchema.parse({ ...b, characterId: "c" }), RelationshipSnapshotSchema.parse({ ...b, characterIds: ["a", "b"] }), WorldSnapshotSchema.parse({ ...b, entityId: "w" }),
      KnowledgeStateSchema.parse({ ...b, informationId: "i" }), PlotThreadSchema.parse({ ...b }), PlotThreadEventSchema.parse({ ...b, threadId: "t", eventType: "advanced" }),
      OpenQuestionSchema.parse({ ...b }), ForeshadowThreadSchema.parse({ ...b }), ForeshadowEventSchema.parse({ ...b, threadId: "f", eventType: "setup" }),
      ProjectTimelineSchema.parse({ ...b }), ProjectTimelineEventSchema.parse({ ...b }), ChapterSummarySchema.parse({ ...b, chapterId: "c", sourceManuscriptId: "m" }),
      SceneSummarySchema.parse({ ...b, chapterId: "c", sceneId: "s", sourceManuscriptId: "m" }), PlanManuscriptDriftSchema.parse({ ...b, driftType: "major_addition" }),
      ContinuityIssueSchema.parse({ ...b, type: "test", severity: "minor", confidence: "low" }), ProjectHealthReportSchema.parse({ ...b, generatedAt: b.createdAt }),
      WritingGoalSchema.parse({ ...b }), WritingProgressSchema.parse({ ...b }), NextChapterContextPackageSchema.parse({ ...b }),
    ];
    for (const value of values) { expect(value.id).toBeTruthy(); expect(value.dataVersion).toBe(1); expect(value.status).toBeTruthy(); expect(value.sources).toEqual([]); expect(value.createdAt).toBeTruthy(); }
  });
});

describe("C1 Canon authority and confirmation", () => {
  it("uses the documented authority order and only confirms by explicit action", () => {
    expect(CANON_AUTHORITY.locked_user_canon).toBeLessThan(CANON_AUTHORITY.accepted_manuscript);
    expect(CANON_AUTHORITY.accepted_manuscript).toBeLessThan(CANON_AUTHORITY.model_inference);
    const ledger = CanonLedgerSchema.parse({ ...continuityBase("ledger"), facts: [createCanonFact({ content: "候选", status: "candidate", authority: 7 })] });
    expect(ledger.facts[0].status).toBe("candidate"); const confirmed = confirmCanonFact(ledger, ledger.facts[0].id, true);
    expect(confirmed.facts[0].status).toBe("locked"); expect(confirmed.facts[0].authority).toBe(1);
  });

  it("detects direct Canon conflicts", () => {
    const a = createCanonFact({ title: "角色状态", content: "柳如烟仍然活着", entityIds: ["liu"], status: "confirmed" });
    const b = createCanonFact({ title: "角色状态", content: "柳如烟已经死亡", entityIds: ["liu"], status: "candidate" });
    const conflicts = detectCanonConflicts([a, b]); expect(conflicts).toHaveLength(1); expect(conflicts[0].factIds).toEqual([a.id, b.id]);
  });

  it("keeps Retcon history and does not overwrite the old fact", () => {
    const old = createCanonFact({ title: "出口", content: "出口在河边", status: "confirmed" });
    const ledger = CanonLedgerSchema.parse({ ...continuityBase("ledger"), facts: [old] });
    const next = createRetcon(ledger, old.id, { content: "出口在废祠" }, { reason: "采用正文调整", affectedChapterIds: ["ch4"] });
    expect(next.facts.find((f) => f.id === old.id)?.status).toBe("retconned"); expect(next.facts).toHaveLength(2); expect(next.retcons[0].affectedChapterIds).toEqual(["ch4"]);
  });

  it("requires explicit selection before merging facts", () => {
    const a = createCanonFact({ title: "同名", content: "甲" }); const b = createCanonFact({ title: "同名", content: "乙" });
    const ledger = CanonLedgerSchema.parse({ ...continuityBase("ledger"), facts: [a, b] });
    expect(() => mergeCanonFacts(ledger, [a.id], {})).toThrow(); const merged = mergeCanonFacts(ledger, [a.id, b.id], { title: "用户合并" });
    expect(merged.facts.filter((f) => f.status === "deprecated")).toHaveLength(2); expect(merged.facts.some((f) => f.title === "用户合并")).toBe(true);
  });
});

describe("C1 local entity index", () => {
  it("protects same-name entities from automatic merge", () => {
    const draft = createEmptyProjectDraft(); const book = createEmptyLorebook("地点"); const a = createEmptyLorebookEntry(); const b = createEmptyLorebookEntry();
    a.name = "旧宅"; a.category = "地点"; a.content = "柳家的旧宅"; b.name = "旧宅"; b.category = "地点"; b.content = "顾家的旧宅"; book.entries = [a, b]; draft.lorebooks = [book];
    const entities = buildProjectEntityIndex(draft); expect(entities.filter((e) => e.name === "旧宅")).toHaveLength(2);
  });

  it("supports name, content and metadata full-text search", () => {
    const draft = createEmptyProjectDraft(); const book = createEmptyLorebook("世界"); const entry = createEmptyLorebookEntry(); entry.name = "临水镇"; entry.category = "地点"; entry.content = "江南河港，旧案发生地"; book.entries = [entry]; draft.lorebooks = [book];
    const entities = buildProjectEntityIndex(draft); expect(searchProjectIndex(entities, "旧案")[0].name).toBe("临水镇"); expect(searchProjectIndex(entities, "临水", { types: ["location"] })).toHaveLength(1);
  });
});
