import { WORK_IMPORT_PARSER_VERSION, type ImportSourceMap } from "@/domain/work-import";
import { readSafeZip, type SafeArchiveOptions } from "./archive-reader";
import { decodeXmlEntities, type ParsedDocumentAdapterResult, type ParsedDocumentSection } from "./structured-parser";

export interface DocxParseOptions extends SafeArchiveOptions {
  includeFootnotes?: boolean; includeEndnotes?: boolean; includeComments?: boolean; includeTables?: boolean;
  revisionMode?: "original" | "final" | "all"; headingVolumeLevel?: number; headingChapterLevel?: number;
}

function textFromRuns(xml: string, mode: "original" | "final" | "all"): string {
  let value = xml;
  if (mode === "final") value = value.replace(/<w:del\b[\s\S]*?<\/w:del>/gi, "");
  if (mode === "original") value = value.replace(/<w:ins\b[\s\S]*?<\/w:ins>/gi, "");
  const pieces: string[] = [];
  for (const match of value.matchAll(/<w:(?:t|delText)\b[^>]*>([\s\S]*?)<\/w:(?:t|delText)>|<w:(?:tab)\b[^>]*\/>|<w:br\b[^>]*\/>/gi)) {
    if (/^<w:tab/i.test(match[0])) pieces.push("\t"); else if (/^<w:br/i.test(match[0])) pieces.push("\n"); else pieces.push(decodeXmlEntities(match[1] ?? ""));
  }
  return pieces.join("");
}

export async function parseDocxDocument(data: ArrayBuffer, options: DocxParseOptions = {}): Promise<ParsedDocumentAdapterResult> {
  const entries = await readSafeZip(data, options);
  if (!entries.has("[Content_Types].xml") || !entries.has("word/document.xml")) throw new Error("文件不是有效 DOCX 容器。" );
  const decoder = new TextDecoder(); const warnings: string[] = [];
  const mode = options.revisionMode ?? "final";
  const documentXml = decoder.decode(entries.get("word/document.xml")!.data);
  const blocks: Array<{ text: string; headingLevel?: number; part: ImportSourceMap["docxPart"]; index: number }> = [];
  const bodyWithoutTables = options.includeTables === false ? documentXml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/gi, "") : documentXml;
  let paragraphIndex = 0;
  for (const match of bodyWithoutTables.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gi)) {
    const text = textFromRuns(match[0], mode).trim();
    const style = match[0].match(/<w:pStyle\b[^>]*w:val=["']([^"']+)["']/i)?.[1] ?? "";
    const heading = style.match(/(?:heading|标题)\s*([1-9])/i)?.[1];
    if (text) blocks.push({ text, headingLevel: heading ? Number(heading) : undefined, part: /<w:tbl\b/i.test(match[0]) ? "table" : "body", index: paragraphIndex });
    paragraphIndex += 1;
  }
  const appendNotes = (path: string, part: "footnote" | "endnote" | "comment", enabled: boolean) => {
    if (!enabled) return;
    const entry = entries.get(path); if (!entry) { warnings.push(`文档引用了${part === "footnote" ? "脚注" : part === "endnote" ? "尾注" : "注释"}，但相应 XML 不可用。`); return; }
    const xml = decoder.decode(entry.data);
    for (const match of xml.matchAll(new RegExp(`<w:${part}\\b[\\s\\S]*?<\\/w:${part}>`, "gi"))) {
      const text = textFromRuns(match[0], mode).trim(); if (text) blocks.push({ text: `[${part === "footnote" ? "脚注" : part === "endnote" ? "尾注" : "注释"}] ${text}`, part, index: paragraphIndex++ });
    }
  };
  appendNotes("word/footnotes.xml", "footnote", options.includeFootnotes ?? true);
  appendNotes("word/endnotes.xml", "endnote", options.includeEndnotes ?? true);
  appendNotes("word/comments.xml", "comment", options.includeComments ?? false);
  if (/<w:(?:ins|del)\b/i.test(documentXml)) warnings.push(`文档包含修订痕迹，当前采用“${mode === "final" ? "修订后" : mode === "original" ? "修订前" : "全部标记"}”文本。`);
  if (entries.has("word/media/")) warnings.push("文档包含图片；当前只保留引用，不分析图片内容。" );
  let rawText = ""; const sections: ParsedDocumentSection[] = []; const sourceFragments: ImportSourceMap[] = [];
  for (const block of blocks) {
    if (rawText) rawText += "\n\n"; const startOffset = rawText.length; rawText += block.text;
    sourceFragments.push({ documentId: "", relativePath: "word/document.xml", characterStart: startOffset, characterEnd: rawText.length, rawExcerpt: block.text.slice(0, 240), docxParagraphIndex: block.index, docxHeadingLevel: block.headingLevel ?? null, docxPart: block.part, parserVersion: WORK_IMPORT_PARSER_VERSION, confidence: 1, sourceVersion: 1, contentHash: "", epubSpineIndex: null, epubPath: "", markdownLineStart: null, markdownLineEnd: null, ocrPage: null, ocrRegion: null });
    if (block.headingLevel) sections.push({ title: block.text, text: block.text, order: sections.length, startOffset, endOffset: rawText.length, headingLevel: block.headingLevel, sourcePath: "word/document.xml" });
  }
  if (!rawText.trim()) throw new Error("DOCX 没有可读取的正文。" );
  return { rawText, sections, sourceFragments, warnings, metadata: { revisionMode: mode, paragraphCount: blocks.length, headingVolumeLevel: options.headingVolumeLevel ?? 1, headingChapterLevel: options.headingChapterLevel ?? 2 } };
}
