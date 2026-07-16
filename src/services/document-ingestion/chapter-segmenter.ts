import { DocumentChapterSchema, DocumentParagraphSchema, type DocumentChapter, type DocumentParagraph } from "@/domain/document-ingestion";
import { createStableId } from "@/domain/lorebook";

export interface ChapterSegmentationOptions {
  customPattern?: string;
}

interface LineInfo { text: string; start: number; end: number; }

const CHINESE_HEADING = /^(?:(?:第[零〇一二三四五六七八九十百千万\d]{1,12}[章节卷部回篇])(?:[：:\s　].{0,40})?|卷[零〇一二三四五六七八九十百千万\d]{1,8}(?:[：:\s　].{0,40})?|序章|楔子|前言|后记|番外(?:[：:\s　].{0,30})?)$/u;
const ENGLISH_HEADING = /^(?:chapter\s+(?:\d+|[ivxlcdm]+)(?:[:.\s-].{0,40})?|prologue|epilogue|preface|afterword)(?:\s.*)?$/i;

function linesOf(text: string): LineInfo[] {
  const lines: LineInfo[] = [];
  let start = 0;
  for (const match of text.matchAll(/.*(?:\n|$)/g)) {
    if (!match[0]) continue;
    const raw = match[0];
    lines.push({ text: raw.replace(/\n$/, ""), start, end: start + raw.length });
    start += raw.length;
  }
  return lines;
}

function paragraphsOf(content: string, absoluteStart: number): DocumentParagraph[] {
  const paragraphs: DocumentParagraph[] = [];
  for (const match of content.matchAll(/[^\n]+/g)) {
    const text = match[0].trim();
    if (!text) continue;
    const leading = match[0].indexOf(text);
    const startOffset = absoluteStart + (match.index ?? 0) + leading;
    paragraphs.push(DocumentParagraphSchema.parse({
      id: createStableId("paragraph"), order: paragraphs.length, text,
      startOffset, endOffset: startOffset + text.length,
    }));
  }
  return paragraphs;
}

export function segmentDocumentChapters(documentId: string, text: string, options: ChapterSegmentationOptions = {}): DocumentChapter[] {
  let custom: RegExp | null = null;
  if (options.customPattern) custom = new RegExp(options.customPattern, "iu");
  const headings = linesOf(text).filter((line) => {
    const value = line.text.trim();
    if (!value || value.length > 80) return false;
    const sentenceLike = /[。！？.!?]$/u.test(value) && (value.split(/\s+/).length > 3 || value.length > 32);
    if (sentenceLike) return false;
    return CHINESE_HEADING.test(value) || ENGLISH_HEADING.test(value) || Boolean(custom?.test(value));
  });
  if (!headings.length) {
    return [DocumentChapterSchema.parse({
      id: createStableId("chapter"), documentId, order: 0, startOffset: 0, endOffset: text.length,
      paragraphs: paragraphsOf(text, 0), confidence: 0.2, detectionMethod: "fallback",
    })];
  }
  return headings.map((heading, order) => {
    const endOffset = headings[order + 1]?.start ?? text.length;
    const title = heading.text.trim();
    const contentStart = heading.end;
    const method = custom?.test(title)
      ? "custom_regex"
      : ENGLISH_HEADING.test(title) ? "english_heading" : "pattern";
    return DocumentChapterSchema.parse({
      id: createStableId("chapter"), documentId, title, normalizedTitle: title.normalize("NFKC"), order,
      startOffset: heading.start, endOffset, paragraphs: paragraphsOf(text.slice(contentStart, endOffset), contentStart),
      confidence: method === "custom_regex" ? 0.95 : 0.9, detectionMethod: method,
    });
  });
}

function normalizeOrder(chapters: DocumentChapter[]): DocumentChapter[] {
  return chapters.map((chapter, order) => ({ ...chapter, order }));
}

export function renameDocumentChapter(chapters: DocumentChapter[], chapterId: string, title: string): DocumentChapter[] {
  return chapters.map((chapter) => chapter.id === chapterId
    ? { ...chapter, title, normalizedTitle: title.normalize("NFKC"), detectionMethod: "manual", userConfirmed: true }
    : chapter);
}

export function splitDocumentChapter(chapters: DocumentChapter[], chapterId: string, splitOffset: number, secondTitle = "新章节"): DocumentChapter[] {
  const index = chapters.findIndex((chapter) => chapter.id === chapterId);
  if (index < 0) return chapters;
  const original = chapters[index];
  if (splitOffset <= original.startOffset || splitOffset >= original.endOffset) throw new Error("拆分位置必须位于章节范围内。");
  const first = { ...original, endOffset: splitOffset, paragraphs: original.paragraphs.filter((paragraph) => paragraph.startOffset < splitOffset), detectionMethod: "manual" as const, userConfirmed: true };
  const second = DocumentChapterSchema.parse({
    ...original, id: createStableId("chapter"), title: secondTitle, normalizedTitle: secondTitle.normalize("NFKC"),
    startOffset: splitOffset, paragraphs: original.paragraphs.filter((paragraph) => paragraph.endOffset > splitOffset),
    detectionMethod: "manual", userConfirmed: true,
  });
  return normalizeOrder([...chapters.slice(0, index), first, second, ...chapters.slice(index + 1)]);
}

export function mergeDocumentChapters(chapters: DocumentChapter[], firstId: string, secondId: string): DocumentChapter[] {
  const firstIndex = chapters.findIndex((chapter) => chapter.id === firstId);
  const secondIndex = chapters.findIndex((chapter) => chapter.id === secondId);
  if (firstIndex < 0 || secondIndex !== firstIndex + 1) throw new Error("只能合并相邻章节。");
  const first = chapters[firstIndex];
  const second = chapters[secondIndex];
  const merged = {
    ...first, endOffset: second.endOffset,
    paragraphs: [...first.paragraphs, ...second.paragraphs].map((paragraph, order) => ({ ...paragraph, order })),
    detectionMethod: "manual" as const, userConfirmed: true,
  };
  return normalizeOrder([...chapters.slice(0, firstIndex), merged, ...chapters.slice(secondIndex + 1)]);
}

export function reorderDocumentChapters(chapters: DocumentChapter[], chapterId: string, direction: -1 | 1): DocumentChapter[] {
  const index = chapters.findIndex((chapter) => chapter.id === chapterId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= chapters.length) return chapters;
  const next = [...chapters];
  [next[index], next[target]] = [next[target], next[index]];
  return normalizeOrder(next.map((chapter) => ({ ...chapter, detectionMethod: "manual", userConfirmed: true })));
}
