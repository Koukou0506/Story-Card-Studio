import {
  DocumentSourceSchema,
  SourceSpanSchema,
  type DocumentSource,
  type SourceSpan,
} from "@/domain/document-ingestion";
import {
  ContinuitySourceReferenceSchema,
  type ContinuitySourceReference,
} from "@/domain/continuity";
import {
  ProseSourceReferenceSchema,
  type ProseSourceReference,
} from "@/domain/prose";

export interface DocumentSourceJump {
  documentId: string;
  sourceVersion: number;
  assetId: string | null;
  documentName: string;
  chapterId: string | null;
  chapterTitle: string;
  pageStart: number | null;
  pageEnd: number | null;
  paragraphStart: number | null;
  paragraphEnd: number | null;
  characterStart: number;
  characterEnd: number;
  excerpt: string;
  mappingStatus: SourceSpan["mappingStatus"];
  label: string;
}

function displayRange(
  prefix: string,
  start: number | null,
  end: number | null,
  suffix: string,
  offset = 0,
): string | null {
  const first = start ?? end;
  if (first === null) return null;
  const last = end ?? first;
  const displayStart = first + offset;
  const displayEnd = last + offset;
  return displayStart === displayEnd
    ? `${prefix}${displayStart} ${suffix}`
    : `${prefix}${displayStart}–${displayEnd} ${suffix}`;
}

function documentName(source: DocumentSource | undefined, documentId: string): string {
  return source?.displayName.trim() || source?.originalFilename.trim() || `文档 ${documentId}`;
}

const DOCX_PART_LABELS: Record<NonNullable<SourceSpan["docxPart"]>, string> = {
  body: "正文",
  footnote: "脚注",
  endnote: "尾注",
  comment: "注释",
  table: "表格",
  image: "图片引用",
};

export function createDocumentSourceJump(
  inputSpan: SourceSpan,
  inputSource?: DocumentSource,
): DocumentSourceJump {
  const span = SourceSpanSchema.parse(inputSpan);
  const source = inputSource ? DocumentSourceSchema.parse(inputSource) : undefined;
  if (source && source.id !== span.documentId) {
    throw new Error("SourceSpan 与 DocumentSource 不匹配。");
  }
  const name = documentName(source, span.documentId);
  const excerpt = span.normalizedTextExcerpt.trim()
    ? span.normalizedTextExcerpt
    : span.rawTextExcerpt;
  const locations = [
    span.relativePath.trim() || null,
    span.chapterTitle.trim() || null,
    span.epubSpineIndex !== null
      ? `EPUB Spine ${span.epubSpineIndex + 1}${span.epubPath.trim() ? ` · ${span.epubPath}` : ""}`
      : span.epubPath.trim() || null,
    span.docxPart || span.docxParagraphIndex !== null || span.docxHeadingLevel !== null
      ? [
          `DOCX ${span.docxPart ? DOCX_PART_LABELS[span.docxPart] : "正文"}`,
          span.docxParagraphIndex !== null ? `第 ${span.docxParagraphIndex + 1} 段` : null,
          span.docxHeadingLevel !== null ? `Heading ${span.docxHeadingLevel}` : null,
        ].filter(Boolean).join(" · ")
      : null,
    span.markdownLineStart !== null || span.markdownLineEnd !== null
      ? displayRange("Markdown 第 ", span.markdownLineStart, span.markdownLineEnd, "行")
      : null,
    span.ocrPage !== null
      ? `OCR 第 ${span.ocrPage} 页${span.ocrVersion.trim() ? ` · ${span.ocrVersion}` : ""}`
      : null,
    displayRange("第 ", span.pageStart, span.pageEnd, "页"),
    displayRange("第 ", span.paragraphStart, span.paragraphEnd, "段", 1),
    `字符 ${span.characterStart}–${span.characterEnd}`,
    span.mappingStatus === "approximate"
      ? "近似定位"
      : span.mappingStatus === "unmapped" ? "原文位置未映射" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    documentId: span.documentId,
    sourceVersion: span.sourceVersion,
    assetId: source?.normalizedTextReference ?? source?.rawTextReference ?? source?.storageReference ?? null,
    documentName: name,
    chapterId: span.chapterId,
    chapterTitle: span.chapterTitle,
    pageStart: span.pageStart,
    pageEnd: span.pageEnd,
    paragraphStart: span.paragraphStart,
    paragraphEnd: span.paragraphEnd,
    characterStart: span.characterStart,
    characterEnd: span.characterEnd,
    excerpt,
    mappingStatus: span.mappingStatus,
    label: [name, ...locations].join(" · "),
  };
}

export function describeSourceSpanJump(span: SourceSpan, source?: DocumentSource): string {
  return createDocumentSourceJump(span, source).label;
}

export function sourceSpanToContinuityReference(
  span: SourceSpan,
  source?: DocumentSource,
): ContinuitySourceReference {
  const jump = createDocumentSourceJump(span, source);
  return ContinuitySourceReferenceSchema.parse({
    sourceType: "document",
    sourceId: jump.documentId,
    sourceName: jump.documentName,
    field: jump.label,
    excerpt: jump.excerpt,
    version: String(jump.sourceVersion),
    authority: 7,
    classification: "source_setting",
    locked: false,
    valid: jump.mappingStatus !== "unmapped",
  });
}

export function sourceSpanToProseReference(
  span: SourceSpan,
  source?: DocumentSource,
): ProseSourceReference {
  const jump = createDocumentSourceJump(span, source);
  return ProseSourceReferenceSchema.parse({
    sourceType: "document",
    sourceId: jump.documentId,
    sourceName: jump.documentName,
    field: jump.label,
    excerpt: jump.excerpt,
    version: String(jump.sourceVersion),
    authority: 4,
    locked: false,
    allowModelChange: false,
    valid: jump.mappingStatus !== "unmapped",
  });
}
