import { describe, expect, it } from "vitest";
import { createEmptyCharacterCard } from "@/domain/character-card";
import { createEmptyProjectDraft, migrateProjectDraft, PROJECT_DATA_VERSION } from "@/domain/project-draft";
import { EditScopeSchema, ProseGenerationRequestSchema, createTextBlocks } from "@/domain/prose";
import { createEmptyStoryPlan } from "@/domain/story-planning";
import { MockProvider } from "@/providers/mock";
import { createMockChapterPlanningProject } from "@/services/chapter-planning-mock";
import { exportManuscriptJSON, exportManuscriptMarkdown, exportManuscriptPlainText, importManuscriptJSON } from "@/services/prose-export";
import { generateProse, generateProseStream } from "@/services/prose-generator";
import { createAnalysisFromProse, createB2UpdateCopy } from "@/services/prose-integration";
import { createManuscriptFromChapterPlanning, updateSceneDraft } from "@/services/prose-project";
import { validateProseSourceReference } from "@/services/prose-references";

function setup(mode: "full_scene" | "continue" | "rewrite" | "expand" | "compress" = "full_scene") {
  const chapterPlanning = createMockChapterPlanningProject();
  const manuscript = createManuscriptFromChapterPlanning(chapterPlanning);
  const chapter = manuscript.chapterDrafts[0]; const scene = chapter.sceneDrafts[0]; const base = scene.versions[0];
  if (mode !== "full_scene") base.blocks = createTextBlocks("原始正文。", "accepted");
  const scope = mode === "continue" ? EditScopeSchema.parse({ type: "text_range", start: 5, end: 5 }) : mode === "rewrite" || mode === "expand" || mode === "compress" ? EditScopeSchema.parse({ type: "text_range", start: 0, end: 5 }) : EditScopeSchema.parse({ type: "scene" });
  const request = ProseGenerationRequestSchema.parse({ manuscriptId: manuscript.id, chapterDraftId: chapter.id, sceneDraftId: scene.id, baseVersionId: base.id, scope, settings: { mode, stream: false, contextBudget: 1000 } });
  return { chapterPlanning, manuscript, chapter, scene, base, request };
}

describe("B3 Mock Provider complete flow", () => {
  it("generates a complete scene as an alternative version with post processing", async () => {
    const value = setup(); const result = await generateProse({ ...value, storyPlan: createEmptyStoryPlan(), characterCard: createEmptyCharacterCard(), lorebooks: [], analyses: [], provider: new MockProvider(), model: "mock-model", timeoutMs: 3000, maxRetries: 0 });
    expect(result.sceneDraft.versions).toHaveLength(2); expect(result.sceneDraft.acceptedVersionId).toBeNull();
    expect(result.sceneDraft.coverage).toHaveLength(10); expect(result.sceneDraft.candidateFacts.length).toBeGreaterThan(0); expect(result.sceneDraft.candidateStateChanges.length).toBeGreaterThan(0);
    expect(result.sceneDraft.issues.map((item) => item.type)).toEqual(expect.arrayContaining(["person_drift", "tense_drift"]));
  });

  it("supports cursor continuation without changing text outside scope", async () => {
    const value = setup("continue"); const result = await generateProse({ ...value, characterCard: createEmptyCharacterCard(), provider: new MockProvider(), model: "mock-model", timeoutMs: 3000, maxRetries: 0 });
    expect(result.generatedText).toContain("账页"); expect(result.sceneDraft.revisions[0].scope.type).toBe("text_range");
  });

  it("preserves a cancelled stream as incomplete temporary version", async () => {
    const value = setup(); const controller = new AbortController();
    const result = await generateProseStream({ ...value, characterCard: createEmptyCharacterCard(), provider: new MockProvider(), model: "mock-model", abortSignal: controller.signal }, (text) => { if (text.length > 40) controller.abort(); });
    expect(result.incomplete).toBe(true); expect(result.sceneDraft.versions.at(-1)?.status).toBe("incomplete"); expect(result.generatedText.length).toBeGreaterThan(0);
  });

  it("builds a budgeted inspectable context with truncation protection", async () => {
    const value = setup(); value.request.settings.contextBudget = 256;
    const result = await generateProse({ ...value, characterCard: createEmptyCharacterCard(), provider: new MockProvider(), model: "mock-model", timeoutMs: 3000, maxRetries: 0 });
    expect(result.context.estimatedTokens).toBeLessThanOrEqual(256); expect(result.context.sources.some((item) => item.sourceType === "scene_plan")).toBe(true);
  });

  it("marks nonexistent or excluded prose references invalid", async () => {
    const value = setup(); const result = await generateProse({ ...value, characterCard: createEmptyCharacterCard(), provider: new MockProvider(), model: "mock-model", timeoutMs: 3000, maxRetries: 0 });
    const valid = result.sceneDraft.versions.at(-1)!.sources[0];
    expect(validateProseSourceReference(valid, result.context).valid).toBe(true);
    expect(validateProseSourceReference({ ...valid, sourceId: "missing" }, result.context).valid).toBe(false);
  });

  it("exports Markdown, plain text and JSON round trip without secrets", async () => {
    const value = setup(); const result = await generateProse({ ...value, characterCard: createEmptyCharacterCard(), provider: new MockProvider(), model: "mock-model", timeoutMs: 3000, maxRetries: 0 });
    const manuscript = updateSceneDraft(value.manuscript, { ...result.sceneDraft, acceptedVersionId: result.sceneDraft.versions.at(-1)!.id });
    expect(exportManuscriptMarkdown(manuscript)).toContain("## "); expect(exportManuscriptPlainText(manuscript)).toContain("柳如烟");
    const json = exportManuscriptJSON(manuscript); expect(importManuscriptJSON(json)).toEqual(manuscript); expect(json).not.toContain("apiKey");
  });

  it("creates A3 input and a non-adopted B2 update copy", async () => {
    const value = setup(); const result = await generateProse({ ...value, characterCard: createEmptyCharacterCard(), provider: new MockProvider(), model: "mock-model", timeoutMs: 3000, maxRetries: 0 });
    const version = result.sceneDraft.versions.at(-1)!; const analysis = createAnalysisFromProse(result.sceneDraft, version);
    expect(analysis.input.proposedPlot).toContain("柳如烟");
    const beforeSelected = value.chapterPlanning.volumes[0].chapters[0].versions[0].scenes[0].selectedVersionId;
    const copy = createB2UpdateCopy(value.chapterPlanning, result.sceneDraft.scenePlanId, result.sceneDraft.candidateStateChanges);
    const scene = copy.volumes[0].chapters[0].versions[0].scenes[0]; expect(scene.versions.length).toBeGreaterThan(1); expect(scene.selectedVersionId).toBe(beforeSelected);
  });

  it("migrates a B2 v5 project without data loss", () => {
    const draft = createEmptyProjectDraft(); const chapterPlanning = createMockChapterPlanningProject();
    const raw = { ...draft, dataVersion: 5, chapterPlanningProjects: [chapterPlanning] } as Record<string, unknown>; delete raw.manuscripts; delete raw.selectedManuscriptId;
    const migrated = migrateProjectDraft(raw); expect(migrated.dataVersion).toBe(PROJECT_DATA_VERSION); expect(migrated.chapterPlanningProjects[0].id).toBe(chapterPlanning.id); expect(migrated.manuscripts).toEqual([]);
  });
});
