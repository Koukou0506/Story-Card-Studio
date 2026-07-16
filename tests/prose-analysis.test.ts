import { describe, expect, it } from "vitest";
import { createEmptyLanguageConstraint, createEmptySceneDraft } from "@/domain/prose";
import { createMockChapterPlanningProject } from "@/services/chapter-planning-mock";
import { analyzeScenePlanCoverage, extractCandidateFacts, extractCandidateStateChanges } from "@/services/prose-analysis";
import { validateProse } from "@/services/prose-validator";

const project = createMockChapterPlanningProject();
const plan = project.volumes[0].chapters[0].versions[0].scenes[0].versions[0];
const scene = createEmptySceneDraft("chapter", "scene", plan.id);
const text = "柳如烟想保护古玉，却被旅人阻止。就在这时出现超出预期的证据，她发现临水镇北桥下藏着密室。柳如烟从犹疑变为坚定，终于离开柳宅。";
const context = { sources: [{ sourceType: "scene_plan" as const, sourceId: "scene", sourceName: "计划", field: "scene", excerpt: "", version: plan.id, authority: 1, locked: true, allowModelChange: false, valid: true, content: JSON.stringify(plan), included: true, reason: "", estimatedTokens: 1 }], selectedSourceIds: ["scene"], estimatedTokens: 1, tokenBudget: 1000, truncated: false, truncationWarnings: [], createdAt: new Date().toISOString() };

describe("B3 prose post processing", () => {
  it("evaluates Scene Plan coverage with semantic and structural cues", () => {
    const coverage = analyzeScenePlanCoverage(scene.id, text, plan);
    expect(coverage).toHaveLength(10);
    expect(coverage.find((item) => item.element === "goal")?.status).not.toBe("missing");
    expect(coverage.find((item) => item.element === "turning_point")?.textRanges.length).toBeGreaterThan(0);
  });

  it("extracts candidate facts without writing to project sources", () => {
    const facts = extractCandidateFacts(scene.id, "version", text, context);
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((item) => item.decision === "pending")).toBe(true);
  });

  it("extracts candidate state changes and compares exit state", () => {
    const changes = extractCandidateStateChanges(scene.id, "version", text, plan);
    expect(changes.some((item) => item.changeType === "character")).toBe(true);
    expect(changes[0].matchesSceneExitState).not.toBeUndefined();
  });

  it("detects person, tense and hard language violations", () => {
    const bad = "我看见柳如烟走来。曾经她沉默，此刻她将会立刻信任他。她不由得叹气。";
    const rule = createEmptyLanguageConstraint(); rule.strictness = "hard"; rule.negativeExamples = ["不由得"];
    const coverage = analyzeScenePlanCoverage(scene.id, bad, plan);
    const types = validateProse({ sceneDraft: scene, versionId: scene.versions[0].id, text: bad, plan, coverage, constraints: [rule] }).map((item) => item.type);
    expect(types).toEqual(expect.arrayContaining(["person_drift", "tense_drift", "hard_language_constraint_violation"]));
  });

  it("marks plan omissions as heuristic issues", () => {
    const coverage = analyzeScenePlanCoverage(scene.id, "天空下着雨。", plan);
    const issues = validateProse({ sceneDraft: scene, versionId: scene.versions[0].id, text: "天空下着雨。", plan, coverage });
    expect(issues.some((item) => item.type === "core_conflict_missing" && item.heuristic)).toBe(true);
  });
});
