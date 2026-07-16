import { describe, expect, it } from "vitest";
import {
  DocumentSourceSchema,
  SourceSpanSchema,
} from "@/domain/document-ingestion";
import { ContinuitySourceReferenceSchema } from "@/domain/continuity";
import { ProseSourceReferenceSchema } from "@/domain/prose";
import {
  createDocumentSourceJump,
  describeSourceSpanJump,
  sourceSpanToContinuityReference,
  sourceSpanToProseReference,
} from "@/services/document-ingestion/source-reference";

const source = DocumentSourceSchema.parse({
  id: "doc-1",
  projectId: "project-1",
  originalFilename: "江风.txt",
  displayName: "江风",
  mimeType: "text/plain",
  fileExtension: ".txt",
  fileSize: 1024,
  contentHash: "sha256:novel",
  importTime: "2026-07-15T00:00:00.000Z",
  storageReference: "asset:doc-1:original",
  normalizedTextReference: "asset:doc-1:normalized-text",
  permissionConfirmed: true,
});

const span = SourceSpanSchema.parse({
  documentId: "doc-1",
  sourceVersion: 2,
  chapterId: "chapter-1",
  chapterTitle: "第一章 风从江上来",
  pageStart: 2,
  pageEnd: 3,
  paragraphStart: 4,
  paragraphEnd: 5,
  characterStart: 120,
  characterEnd: 148,
  rawTextExcerpt: "旧城的灯一盏盏亮起来。",
  normalizedTextExcerpt: "旧城的灯一盏盏亮起来。",
  extractionConfidence: "high",
  mappingStatus: "mapped",
});

describe("document source references and jumps", () => {
  it("creates a source jump with the persisted text asset and every available location", () => {
    const jump = createDocumentSourceJump(span, source);

    expect(jump).toMatchObject({
      documentId: "doc-1",
      sourceVersion: 2,
      assetId: "asset:doc-1:normalized-text",
      chapterId: "chapter-1",
      pageStart: 2,
      pageEnd: 3,
      paragraphStart: 4,
      paragraphEnd: 5,
      characterStart: 120,
      characterEnd: 148,
      excerpt: "旧城的灯一盏盏亮起来。",
      mappingStatus: "mapped",
    });
    expect(jump.label).toBe("江风 · 第一章 风从江上来 · 第 2–3 页 · 第 5–6 段 · 字符 120–148");
    expect(describeSourceSpanJump(span, source)).toBe(jump.label);
  });

  it("maps a SourceSpan into a C1-compatible candidate source reference", () => {
    const reference = sourceSpanToContinuityReference(span, source);

    expect(ContinuitySourceReferenceSchema.parse(reference)).toEqual(reference);
    expect(reference).toMatchObject({
      sourceType: "document",
      sourceId: "doc-1",
      sourceName: "江风",
      field: "江风 · 第一章 风从江上来 · 第 2–3 页 · 第 5–6 段 · 字符 120–148",
      excerpt: "旧城的灯一盏盏亮起来。",
      version: "2",
      authority: 7,
      classification: "source_setting",
      locked: false,
      valid: true,
    });
  });

  it("maps a SourceSpan into a B3-compatible candidate source reference", () => {
    const reference = sourceSpanToProseReference(span, source);

    expect(ProseSourceReferenceSchema.parse(reference)).toEqual(reference);
    expect(reference).toMatchObject({
      sourceType: "document",
      sourceId: "doc-1",
      sourceName: "江风",
      excerpt: "旧城的灯一盏盏亮起来。",
      version: "2",
      authority: 4,
      locked: false,
      allowModelChange: false,
      valid: true,
    });
  });

  it("uses raw excerpts and marks approximate or unavailable source mappings", () => {
    const approximate = SourceSpanSchema.parse({
      ...span,
      chapterId: null,
      chapterTitle: "",
      pageStart: null,
      pageEnd: null,
      paragraphStart: null,
      paragraphEnd: null,
      normalizedTextExcerpt: "",
      rawTextExcerpt: "只保留原文摘录",
      mappingStatus: "approximate",
    });
    const unmapped = SourceSpanSchema.parse({ ...approximate, mappingStatus: "unmapped" });

    expect(createDocumentSourceJump(approximate).label)
      .toBe("文档 doc-1 · 字符 120–148 · 近似定位");
    expect(createDocumentSourceJump(approximate).excerpt).toBe("只保留原文摘录");
    expect(createDocumentSourceJump(unmapped).label)
      .toBe("文档 doc-1 · 字符 120–148 · 原文位置未映射");
    expect(sourceSpanToContinuityReference(approximate)).toMatchObject({
      field: "文档 doc-1 · 字符 120–148 · 近似定位",
      valid: true,
    });
    expect(sourceSpanToProseReference(approximate)).toMatchObject({
      field: "文档 doc-1 · 字符 120–148 · 近似定位",
      valid: true,
    });
    expect(sourceSpanToContinuityReference(unmapped).valid).toBe(false);
    expect(sourceSpanToProseReference(unmapped).valid).toBe(false);
  });

  it("rejects a mismatched document source instead of creating a misleading jump", () => {
    const otherSource = DocumentSourceSchema.parse({ ...source, id: "doc-2" });
    expect(() => createDocumentSourceJump(span, otherSource)).toThrow("SourceSpan 与 DocumentSource 不匹配");
  });

  it("falls back to extracted text when cleaned text is not retained", () => {
    const extractedOnly = DocumentSourceSchema.parse({
      ...source,
      rawTextReference: "asset:doc-1:raw-text",
      normalizedTextReference: null,
    });

    expect(createDocumentSourceJump(span, extractedOnly).assetId).toBe("asset:doc-1:raw-text");
  });

  it("describes structured document and OCR locations without losing the character range", () => {
    const structured = SourceSpanSchema.parse({
      ...span,
      relativePath: "卷一/chapter-02.xhtml",
      epubSpineIndex: 1,
      epubPath: "OEBPS/chapter-02.xhtml",
      docxParagraphIndex: 8,
      docxHeadingLevel: 2,
      docxPart: "footnote",
      markdownLineStart: 20,
      markdownLineEnd: 24,
      ocrPage: 3,
      ocrVersion: "tesseract-5",
    });

    expect(describeSourceSpanJump(structured, source)).toContain("卷一/chapter-02.xhtml");
    expect(describeSourceSpanJump(structured, source)).toContain("EPUB Spine 2");
    expect(describeSourceSpanJump(structured, source)).toContain("DOCX 脚注 · 第 9 段 · Heading 2");
    expect(describeSourceSpanJump(structured, source)).toContain("Markdown 第 20–24 行");
    expect(describeSourceSpanJump(structured, source)).toContain("OCR 第 3 页");
    expect(describeSourceSpanJump(structured, source)).toContain("字符 120–148");
  });
});
