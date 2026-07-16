import { describe, expect, it } from "vitest";
import {
  ExtractionItemSchema,
  SourceSpanSchema,
  createEmptyDocumentIngestionProject,
  type ExtractionItem,
} from "@/domain/document-ingestion";
import { consolidateDocumentExtractions } from "@/services/document-ingestion/consolidator";

const span = SourceSpanSchema.parse({
  documentId: "doc-1", sourceVersion: 1, chapterId: "chapter-1", chapterTitle: "第一章",
  characterStart: 0, characterEnd: 50, rawTextExcerpt: "柳如烟与旅人进入临水镇。",
  normalizedTextExcerpt: "柳如烟与旅人进入临水镇。", extractionConfidence: "high",
});
const item = (id: string, type: ExtractionItem["type"], name: string, content: string, expression = name) => ExtractionItemSchema.parse({
  id, type, normalizedName: name, originalExpression: expression, content, sourceSpans: [span], confidence: "high", explicitFact: true,
});

describe("document extraction consolidation", () => {
  it("turns traceable chunk items into review-only domain candidates", () => {
    const project = createEmptyDocumentIngestionProject("project-1");
    const result = consolidateDocumentExtractions(project, [
      item("person-liu", "character", "柳如烟", "柳家长女"),
      item("alias-liu", "alias", "柳如烟", "别名称谓", "柳姑娘"),
      item("goal-liu", "goal", "柳如烟", "查清旧案"),
      item("voice-liu", "voice", "柳如烟", "短句、克制"),
      item("person-traveler", "character", "旅人", "调查者"),
      item("relation", "relationship", "柳如烟|旅人", "二人暂时合作"),
      item("place", "location", "临水镇", "一座依水而建的旧城"),
      item("rule", "world_rule", "古玉", "古玉遇水显字"),
      item("event", "current_event", "发现古玉", "柳如烟在雨夜发现古玉"),
      item("time", "time_expression", "雨夜", "事件发生在第一章雨夜"),
      item("plot", "plot_thread", "旧案主线", "追查旧案真相"),
      item("foreshadow", "foreshadow", "水纹", "古玉水纹是后续回收候选"),
    ]);

    expect(result.characterCandidates).toHaveLength(2);
    expect(result.characterCandidates[0].aliases).toContain("柳姑娘");
    expect(result.characterCardDrafts).toHaveLength(2);
    expect(result.voiceProfiles).toHaveLength(1);
    expect(result.relationshipCandidates).toHaveLength(1);
    expect(result.lorebookDrafts[0].lorebook.entries.length).toBeGreaterThanOrEqual(2);
    expect(result.canonCandidates.length).toBeGreaterThan(0);
    expect(result.timelineCandidates.length).toBeGreaterThan(0);
    expect(result.plotThreadCandidates).toHaveLength(1);
    expect(result.foreshadowCandidates).toHaveLength(1);
    expect(result.canonCandidates.every((candidate) => candidate.decision === "pending")).toBe(true);
  });
});
