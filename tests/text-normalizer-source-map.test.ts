import { describe, expect, it } from "vitest";
import { mapNormalizedRange, normalizeDocumentText } from "@/services/document-ingestion/text-normalizer";

describe("document text normalizer and raw mapping", () => {
  it("removes repeated headers/page numbers while preserving raw offsets", () => {
    const raw = "示例小说\n第一章\r\n江　风\t吹过。\n1\f示例小说\n第二章\r\n夜色渐深。\n2";
    const result = normalizeDocumentText(raw);
    expect(result.normalizedText).not.toContain("示例小说");
    expect(result.normalizedText).not.toMatch(/^1$|^2$/m);
    expect(result.normalizedText).toContain("江 风 吹过。");

    const start = result.normalizedText.indexOf("江 风");
    const mapped = mapNormalizedRange(result.offsetMap, start, start + 3);
    expect(raw.slice(mapped.rawStart, mapped.rawEnd)).toContain("江　风");
    expect(mapped.status).not.toBe("unmapped");
  });

  it("removes unsafe controls without changing semantic punctuation", () => {
    const result = normalizeDocumentText("第一章\u0000\n她说：“不要改写。”\u200b");
    expect(result.normalizedText).toBe("第一章\n她说：“不要改写。”");
    expect(result.warnings.join(" ")).toContain("控制字符");
  });
});
