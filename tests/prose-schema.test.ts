import { describe, expect, it } from "vitest";
import {
  ChapterDraftSchema, EditScopeSchema, LanguageConstraintSchema, ManuscriptSchema, RevisionSchema,
  SceneDraftSchema, StyleProfileSchema, createDraftVersion, createEmptyChapterDraft,
  createEmptyLanguageConstraint, createEmptyManuscript, createEmptySceneDraft, createEmptyStyleProfile, proseBase,
} from "@/domain/prose";

describe("B3 prose schemas", () => {
  it("creates a versioned Manuscript with prompt versions and safe defaults", () => {
    const value = createEmptyManuscript("b2");
    expect(ManuscriptSchema.safeParse(value).success).toBe(true);
    expect(value.dataVersion).toBe(1);
    expect(value.promptVersions.length).toBe(15);
    expect(value.styleProfiles[0].sources).toEqual([]);
  });

  it("validates ChapterDraft and SceneDraft with stable B2 links", () => {
    const chapter = createEmptyChapterDraft("chapter-plan", "chapter-version");
    const scene = createEmptySceneDraft(chapter.id, "scene-plan", "scene-version");
    expect(ChapterDraftSchema.safeParse({ ...chapter, sceneDrafts: [scene] }).success).toBe(true);
    expect(SceneDraftSchema.parse(scene).b2SceneVersionId).toBe("scene-version");
    expect(scene.id).not.toBe(scene.versions[0].id);
  });

  it("Edit Scope has identity, timestamps and safe permissions", () => {
    const scope = EditScopeSchema.parse({ type: "text_range", start: 2, end: 4 });
    expect(scope.id).toBeTruthy();
    expect(scope.allowNewFacts).toBe(false);
    expect(scope.createdAt).toBeTruthy();
  });

  it("validates Revision source and paragraph decisions", () => {
    const version = createDraftVersion("scene", "原文");
    const revision = RevisionSchema.parse({ ...proseBase("revision"), sceneDraftId: "scene", baseVersionId: version.id, suggestedVersionId: "next", operationType: "rewrite", scope: { type: "text_range", start: 0, end: 2 } });
    expect(revision.decision).toBe("pending");
    expect(revision.scope.type).toBe("text_range");
  });

  it("supports reusable Style Profile and scoped Language Constraint", () => {
    const style = createEmptyStyleProfile(); const rule = createEmptyLanguageConstraint();
    rule.scope = "character"; rule.targetIds = ["柳如烟"]; rule.strictness = "hard";
    expect(StyleProfileSchema.parse(style).dialogueRatio).toBe(35);
    expect(LanguageConstraintSchema.parse(rule).strictness).toBe("hard");
  });
});
