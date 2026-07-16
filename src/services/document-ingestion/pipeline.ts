import {
  DocumentAnalysisConfigSchema,
  DocumentSourceSchema,
  type DocumentAnalysisConfig,
  type DocumentChapter,
  type DocumentChunk,
  type DocumentSource,
} from "@/domain/document-ingestion";
import { createStableId } from "@/domain/lorebook";
import { type DocumentAssetStorage, createDocumentAssetRecord } from "@/storage/document-assets";
import { inspectDocumentFile } from "./file-validator";
import { parseTxtDocument, type SupportedTextEncoding } from "./txt-parser";
import { parsePdfDocument } from "./pdf-parser";
import { parseEpubDocument } from "./epub-parser";
import { parseDocxDocument, type DocxParseOptions } from "./docx-parser";
import { parseMarkdownDocument, type MarkdownParseOptions } from "./markdown-parser";
import { mapNormalizedRange, normalizeDocumentText } from "./text-normalizer";
import { segmentDocumentChapters } from "./chapter-segmenter";
import { planDocumentChunks } from "./chunk-planner";

export interface LocalIngestionOptions {
  file: File;
  projectId: string;
  permissionConfirmed: boolean;
  storage: DocumentAssetStorage;
  config?: Partial<DocumentAnalysisConfig>;
  encoding?: SupportedTextEncoding;
  pdfPassword?: string;
  knownHashes?: string[];
  maxBytes?: number;
  retainOriginalFile?: boolean;
  retainExtractedText?: boolean;
  signal?: AbortSignal;
  docxOptions?: DocxParseOptions;
  markdownOptions?: MarkdownParseOptions;
  relativePath?: string;
}

export interface LocalIngestionResult {
  source: DocumentSource;
  chapters: DocumentChapter[];
  chunks: DocumentChunk[];
  normalizedText: string;
  offsetMap: ReturnType<typeof normalizeDocumentText>["offsetMap"];
  warnings: string[];
}

const MIME_BY_FORMAT = {
  txt: "text/plain",
  pdf: "application/pdf",
  epub: "application/epub+zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  markdown: "text/markdown",
} as const;

export async function ingestLocalDocumentFile(options: LocalIngestionOptions): Promise<LocalIngestionResult> {
  if (!options.permissionConfirmed) throw new Error("请先确认你拥有处理该文件的权利。");
  if (options.signal?.aborted) throw new DOMException("文件处理已取消", "AbortError");
  const inspected = await inspectDocumentFile(options.file, { knownHashes: options.knownHashes, maxBytes: options.maxBytes });
  if (!inspected.ok || !inspected.contentHash) throw new Error(inspected.ok ? "无法计算文件哈希。" : inspected.error);
  const config = DocumentAnalysisConfigSchema.parse(options.config ?? {});
  const data = await options.file.arrayBuffer();
  const documentId = createStableId("document");
  const originalAssetId = `asset:${documentId}:original`;
  const rawTextAssetId = `asset:${documentId}:raw-text`;
  const normalizedAssetId = `asset:${documentId}:normalized-text`;
  const retainOriginalFile = options.retainOriginalFile ?? true;
  const retainExtractedText = options.retainExtractedText ?? true;
  if (retainOriginalFile) {
    await options.storage.put(createDocumentAssetRecord({
      id: originalAssetId, documentId, projectId: options.projectId, kind: "original",
      mimeType: options.file.type || (inspected.format === "pdf" ? "application/pdf" : "text/plain"),
      data, contentHash: inspected.contentHash,
    }));
  }

  let rawText = "";
  let encoding: string | null = null;
  let encodingConfidence: number | null = null;
  let pageCount: number | null = null;
  let warnings: string[] = [];
  let terminalStatus: DocumentSource["processingStatus"] | null = null;
  let pdfPages: Array<{ pageNumber: number; startOffset: number; endOffset: number }> = [];
  let structuredFragments: Awaited<ReturnType<typeof parseEpubDocument>>["sourceFragments"] = [];

  if (inspected.format === "txt") {
    const parsed = parseTxtDocument(data, { encoding: options.encoding });
    rawText = parsed.text;
    encoding = parsed.encoding;
    encodingConfidence = parsed.confidence;
    warnings = parsed.warnings;
    if (parsed.needsEncodingChoice && !options.encoding) terminalStatus = "partially_completed";
  } else if (inspected.format === "pdf") {
    const parsed = await parsePdfDocument(data, { password: options.pdfPassword, signal: options.signal });
    rawText = parsed.rawText;
    pageCount = parsed.pageCount;
    warnings = parsed.warnings;
    pdfPages = parsed.pages;
    if (parsed.status === "needs_ocr" || parsed.status === "needs_password" || parsed.status === "failed") terminalStatus = parsed.status;
  } else if (inspected.format === "epub") {
    const parsed = await parseEpubDocument(data); rawText = parsed.rawText; warnings = parsed.warnings; structuredFragments = parsed.sourceFragments;
  } else if (inspected.format === "docx") {
    const parsed = await parseDocxDocument(data, options.docxOptions); rawText = parsed.rawText; warnings = parsed.warnings; structuredFragments = parsed.sourceFragments;
  } else {
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(data);
    const parsed = parseMarkdownDocument(decoded, options.markdownOptions); rawText = parsed.rawText; warnings = parsed.warnings; structuredFragments = parsed.sourceFragments; encoding = "utf-8"; encodingConfidence = 1;
  }

  const now = new Date().toISOString();
  if (terminalStatus === "needs_ocr" || terminalStatus === "needs_password" || terminalStatus === "failed") {
    const source = DocumentSourceSchema.parse({
      id: documentId, projectId: options.projectId, originalFilename: options.file.name,
      displayName: inspected.safeFilename?.replace(/\.(txt|pdf|epub|docx|md|markdown)$/i, "") || options.file.name,
      mimeType: options.file.type || MIME_BY_FORMAT[inspected.format], fileExtension: `.${inspected.format === "markdown" ? options.file.name.toLocaleLowerCase().endsWith(".markdown") ? "markdown" : "md" : inspected.format}`,
      fileSize: options.file.size, contentHash: inspected.contentHash, encoding, encodingConfidence, pageCount,
      importTime: now, permissionConfirmed: true, externalModelPermission: "local_only", warnings,
      retainOriginalFile, retainExtractedText,
      errors: terminalStatus === "failed" ? ["文件解析失败"] : [], processingStatus: terminalStatus,
      processingProgress: terminalStatus === "failed" ? 0 : 20, currentStage: terminalStatus,
      storageReference: retainOriginalFile ? originalAssetId : `not-retained:${documentId}`, relativePath: options.relativePath ?? options.file.webkitRelativePath ?? "",
    });
    return { source, chapters: [], chunks: [], normalizedText: "", offsetMap: [], warnings };
  }

  const normalized = normalizeDocumentText(rawText);
  warnings = [...warnings, ...normalized.warnings];
  if (retainExtractedText) {
    await options.storage.put(createDocumentAssetRecord({ id: rawTextAssetId, documentId, projectId: options.projectId, kind: "raw_text", mimeType: "text/plain", data: rawText, contentHash: `${inspected.contentHash}:raw` }));
    await options.storage.put(createDocumentAssetRecord({ id: normalizedAssetId, documentId, projectId: options.projectId, kind: "normalized_text", mimeType: "text/plain", data: normalized.normalizedText, contentHash: `${inspected.contentHash}:normalized` }));
  }
  const chapters = segmentDocumentChapters(documentId, normalized.normalizedText);
  const chunks = planDocumentChunks({ documentId, chapters, targetCharacters: config.targetChunkCharacters, overlapCharacters: config.overlapCharacters });
  const pageForOffset = (offset: number) => pdfPages.find((page) => offset >= page.startOffset && offset <= page.endOffset)?.pageNumber ?? null;
  chapters.forEach((chapter) => {
    const mapped = mapNormalizedRange(normalized.offsetMap, chapter.startOffset, chapter.endOffset);
    chapter.startPage = pageForOffset(mapped.rawStart);
    chapter.endPage = pageForOffset(Math.max(mapped.rawStart, mapped.rawEnd - 1));
  });
  chunks.forEach((chunk) => chunk.sourceSpans.forEach((span) => {
    const normalizedStart = span.characterStart;
    const normalizedEnd = span.characterEnd;
    const mapped = mapNormalizedRange(normalized.offsetMap, normalizedStart, normalizedEnd);
    span.characterStart = mapped.rawStart;
    span.characterEnd = mapped.rawEnd;
    span.mappingStatus = mapped.status;
    span.normalizedTextExcerpt = normalized.normalizedText.slice(normalizedStart, Math.min(normalizedEnd, normalizedStart + 120));
    span.rawTextExcerpt = rawText.slice(mapped.rawStart, Math.min(mapped.rawEnd, mapped.rawStart + 120));
    span.pageStart = pageForOffset(mapped.rawStart);
    span.pageEnd = pageForOffset(Math.max(mapped.rawStart, mapped.rawEnd - 1));
    const structured = structuredFragments.find((item) => mapped.rawStart >= item.characterStart && mapped.rawStart <= item.characterEnd);
    if (structured) Object.assign(span, {
      relativePath: options.relativePath ?? options.file.webkitRelativePath ?? structured.relativePath,
      epubSpineIndex: structured.epubSpineIndex, epubPath: structured.epubPath,
      docxParagraphIndex: structured.docxParagraphIndex, docxHeadingLevel: structured.docxHeadingLevel, docxPart: structured.docxPart,
      markdownLineStart: structured.markdownLineStart, markdownLineEnd: structured.markdownLineEnd,
    });
  }));
  const paragraphCount = chapters.reduce((total, chapter) => total + chapter.paragraphs.length, 0);
  const source = DocumentSourceSchema.parse({
    id: documentId, projectId: options.projectId, originalFilename: options.file.name,
    displayName: inspected.safeFilename?.replace(/\.(txt|pdf|epub|docx|md|markdown)$/i, "") || options.file.name,
    mimeType: options.file.type || MIME_BY_FORMAT[inspected.format], fileExtension: `.${inspected.format === "markdown" ? options.file.name.toLocaleLowerCase().endsWith(".markdown") ? "markdown" : "md" : inspected.format}`,
    fileSize: options.file.size, contentHash: inspected.contentHash, encoding, encodingConfidence, pageCount,
    chapterCount: chapters.length, paragraphCount, characterCount: normalized.normalizedText.length,
    tokenEstimate: Math.ceil(normalized.normalizedText.length / 2), importTime: now,
    permissionConfirmed: true, externalModelPermission: config.allowExternalModel ? "chunks_only" : "local_only",
    retainOriginalFile, retainExtractedText,
    warnings, processingStatus: terminalStatus ?? "ready_for_review", processingProgress: 100,
    currentStage: "等待用户确认章节与分析配置",
    storageReference: retainOriginalFile ? originalAssetId : `not-retained:${documentId}`,
    rawTextReference: retainExtractedText ? rawTextAssetId : null,
    normalizedTextReference: retainExtractedText ? normalizedAssetId : null, relativePath: options.relativePath ?? options.file.webkitRelativePath ?? "",
  });
  return { source, chapters, chunks, normalizedText: normalized.normalizedText, offsetMap: normalized.offsetMap, warnings };
}
