import { describe, expect, it } from "vitest";
import {
  characterCandidateToCardDraft,
  createLanguageConstraintCandidates,
  createLorebookDraftFromCandidates,
  styleStatisticsToProfileCandidate,
} from "@/services/document-ingestion/converters";
import { CharacterCandidateSchema, GenericDocumentCandidateSchema, SourceSpanSchema } from "@/domain/document-ingestion";
import { calculateStyleStatistics } from "@/services/document-ingestion/style-statistics";

const span = SourceSpanSchema.parse({
  documentId: "doc-1", sourceVersion: 1, chapterId: "ch-1", chapterTitle: "第一章",
  characterStart: 5, characterEnd: 18, rawTextExcerpt: "柳如烟按住古玉。", normalizedTextExcerpt: "柳如烟按住古玉。",
});

describe("document ingestion converters", () => {
  it("creates a source-bound Character Card draft without inventing missing fields", () => {
    const candidate = CharacterCandidateSchema.parse({
      id: "character-1", name: "柳如烟", aliases: ["柳姑娘"], identity: ["柳家长女"],
      stableTraits: ["谨慎"], situationalBehaviors: ["雨夜中一度冲动"], goals: ["查清旧案"],
      informationGaps: ["年龄未知"], sourceSpans: [span], authority: "document_explicit",
    });
    const draft = characterCandidateToCardDraft(candidate);
    expect(draft.status).toBe("draft");
    expect(draft.decision).toBe("pending");
    expect(draft.card.data.name).toBe("柳如烟");
    expect(draft.card.data.personality).toContain("谨慎");
    expect(draft.card.data.personality).not.toContain("冲动型人格");
    expect(draft.card.data.extensions.document_ingestion).toBeTruthy();
  });

  it("creates independent Lorebook entries with precise keywords and source spans", () => {
    const candidates = ["临水镇", "古玉"].map((name, index) => GenericDocumentCandidateSchema.parse({
      id: `candidate-${index}`, name, description: `${name}的独立设定。`, content: `${name}的独立设定。`,
      candidateType: "entity", sourceSpans: [span], authority: "document_explicit",
    }));
    const draft = createLorebookDraftFromCandidates("小说世界书草稿", candidates);
    expect(draft.status).toBe("draft");
    expect(draft.lorebook.entries).toHaveLength(2);
    expect(draft.lorebook.entries[0].activation.primaryKeys).toEqual(["临水镇"]);
    expect(draft.lorebook.entries[0].extensions.documentSourceSpans).toEqual([span]);
  });

  it("maps statistics to a candidate Style Profile and non-hard language rules", () => {
    const stats = calculateStyleStatistics("我推开门。\n\n“别动。”我说。", [12]);
    const profile = styleStatisticsToProfileCandidate("doc-1", ["ch-1"], stats, [span]);
    const constraints = createLanguageConstraintCandidates("doc-1", stats, [span]);
    expect(profile.userConfirmed).toBe(false);
    expect(profile.profile.status).toBe("alternative");
    expect(profile.profile.dialogueRatio).toBe(Math.round(stats.dialogueRatio * 100));
    expect(constraints.length).toBeGreaterThanOrEqual(3);
    expect(constraints.every((item) => item.constraint.strictness !== "hard" && item.decision === "pending")).toBe(true);
  });
});
