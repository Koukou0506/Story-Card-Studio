import { describe, expect, it } from "vitest";
import { createImportManifest, naturalSortDocumentNames, processDocumentBundle } from "@/services/document-ingestion/import-manifest";
import { resolveChapterVersions } from "@/services/document-ingestion/chapter-version-resolver";

describe("多文件作品导入", () => {
  it("按常见中英文数字自然排序", () => {
    expect(naturalSortDocumentNames(["第十章.txt", "第二章.txt", "第10章.txt", "第2章.txt", "chapter-10.md", "chapter-2.md"]))
      .toEqual(["chapter-2.md", "chapter-10.md", "第2章.txt", "第二章.txt", "第10章.txt", "第十章.txt"]);
  });

  it("建立混合格式清单并隔离单文件失败", async () => {
    const manifest = createImportManifest("project-1", [
      { name: "2.md", size: 2, type: "text/markdown", relativePath: "卷一/2.md" },
      { name: "1.epub", size: 3, type: "application/epub+zip", relativePath: "卷一/1.epub" },
      { name: "3.docx", size: 4, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    ]);
    const result = await processDocumentBundle(manifest, async (item) => {
      if (item.originalFilename === "2.md") throw new Error("损坏");
      return { documentId: `doc-${item.order}`, chapterIds: [`chapter-${item.order}`], warnings: [] };
    });
    expect(new Set(result.items.map((item) => item.format))).toEqual(new Set(["markdown", "epub", "docx"]));
    expect(result.status).toBe("partially_completed");
    expect(result.items.find((item) => item.originalFilename === "2.md")?.status).toBe("failed");
    expect(result.items.filter((item) => item.status === "ready_for_review")).toHaveLength(2);
  });

  it("识别完全重复、正规化重复和章节修订候选", () => {
    const groups = resolveChapterVersions([
      { id: "a", title: "第一章", text: "风来了。" },
      { id: "b", title: "第一章", text: "风来了。" },
      { id: "c", title: "第一章", text: "风 来了。" },
      { id: "d", title: "第一章", text: "风从北方来了，门被吹开。" },
    ]);
    expect(groups.some((item) => item.relation === "exact_duplicate")).toBe(true);
    expect(groups.some((item) => item.relation === "normalized_duplicate")).toBe(true);
    expect(groups.some((item) => ["probable_revision", "possible_revision"].includes(item.relation))).toBe(true);
    expect(groups.every((item) => item.decision === "pending")).toBe(true);
  });
});
