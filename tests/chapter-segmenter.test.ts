import { describe, expect, it } from "vitest";
import {
  mergeDocumentChapters,
  renameDocumentChapter,
  segmentDocumentChapters,
  splitDocumentChapter,
} from "@/services/document-ingestion/chapter-segmenter";

describe("ChapterSegmenter", () => {
  const text = "序章\n风从江上来。\n\n第一章 雨夜\n她进入旧城。\n\nChapter 2 Return\nHe came back.\n\n后记\n故事到此为止。";

  it("recognizes Chinese, English, prologue and epilogue headings", () => {
    const chapters = segmentDocumentChapters("doc-1", text);
    expect(chapters.map((chapter) => chapter.title)).toEqual(["序章", "第一章 雨夜", "Chapter 2 Return", "后记"]);
    expect(chapters.every((chapter, index) => chapter.order === index)).toBe(true);
    expect(chapters[1].paragraphs[0].text).toContain("她进入旧城");
  });

  it("does not treat inline 第X章 text as a heading", () => {
    const chapters = segmentDocumentChapters("doc-1", "第一章\n他说第2章才会解释原因，但现在不能说。\n事情继续。 ");
    expect(chapters).toHaveLength(1);
  });

  it("does not treat an entire English prose sentence beginning with Chapter as a heading", () => {
    const chapters = segmentDocumentChapters("doc-1", "Chapter 1 The visitor enters town.");
    expect(chapters).toHaveLength(1);
    expect(chapters[0].detectionMethod).toBe("fallback");
    expect(chapters[0].paragraphs[0].text).toContain("visitor enters town");
  });

  it("supports custom patterns and manual rename, split and merge", () => {
    const custom = segmentDocumentChapters("doc-1", "幕之一\n开始。\n幕之二\n结束。", { customPattern: "^幕之[一二三四五六七八九十]+$" });
    expect(custom).toHaveLength(2);
    const renamed = renameDocumentChapter(custom, custom[0].id, "第一幕");
    expect(renamed[0].title).toBe("第一幕");
    const splitAt = renamed[0].startOffset + 3;
    const split = splitDocumentChapter(renamed, renamed[0].id, splitAt, "第一幕下");
    expect(split).toHaveLength(3);
    expect(mergeDocumentChapters(split, split[0].id, split[1].id)).toHaveLength(2);
  });
});
