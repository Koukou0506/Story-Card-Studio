import { WORK_IMPORT_PARSER_VERSION, type ImportSourceMap } from "@/domain/work-import";
import { stripUnsafeHtml, type ParsedDocumentAdapterResult, type ParsedDocumentSection } from "./structured-parser";

export interface MarkdownParseOptions {
  volumeHeadingLevel?: number; chapterHeadingLevel?: number; ignoreFrontMatter?: boolean; ignoreCodeBlocks?: boolean;
  keepQuotes?: boolean; readInlineHtml?: boolean;
}

function plainInline(value: string, readHtml: boolean): string {
  let result = value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__|\*|_|~~)(.*?)\1/g, "$2")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/, "")
    .replace(/^\s*>\s?/, "");
  if (readHtml) result = stripUnsafeHtml(result); else result = result.replace(/<[^>]+>/g, "");
  return result.trim();
}

export function parseMarkdownDocument(markdown: string, options: MarkdownParseOptions = {}): ParsedDocumentAdapterResult {
  const ignoreFrontMatter = options.ignoreFrontMatter ?? true;
  const ignoreCode = options.ignoreCodeBlocks ?? true;
  const keepQuotes = options.keepQuotes ?? true;
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output: Array<{ text: string; line: number; heading?: number }> = [];
  let inFrontMatter = ignoreFrontMatter && /^---\s*$/.test(lines[0] ?? "");
  let inCode = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (inFrontMatter) { if (index > 0 && /^(?:---|\.\.\.)\s*$/.test(line)) inFrontMatter = false; continue; }
    if (/^\s*(```|~~~)/.test(line)) { inCode = !inCode; if (!ignoreCode) output.push({ text: line, line: index + 1 }); continue; }
    if (inCode && ignoreCode) continue;
    const atx = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (atx) { output.push({ text: plainInline(atx[2], options.readInlineHtml ?? true), line: index + 1, heading: atx[1].length }); continue; }
    const next = lines[index + 1] ?? "";
    if (line.trim() && /^\s*(=+|-+)\s*$/.test(next)) { output.push({ text: plainInline(line, options.readInlineHtml ?? true), line: index + 1, heading: next.trim().startsWith("=") ? 1 : 2 }); index += 1; continue; }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) continue;
    if (!keepQuotes && /^\s*>/.test(line)) continue;
    const text = plainInline(line, options.readInlineHtml ?? true); if (text) output.push({ text, line: index + 1 });
  }
  let rawText = ""; const sections: ParsedDocumentSection[] = []; const sourceFragments: ImportSourceMap[] = [];
  for (const block of output) {
    if (rawText) rawText += "\n\n"; const startOffset = rawText.length; rawText += block.text;
    sourceFragments.push({ documentId: "", relativePath: "", characterStart: startOffset, characterEnd: rawText.length, rawExcerpt: block.text.slice(0, 240), markdownLineStart: block.line, markdownLineEnd: block.line, parserVersion: WORK_IMPORT_PARSER_VERSION, confidence: 1, sourceVersion: 1, contentHash: "", epubSpineIndex: null, epubPath: "", docxParagraphIndex: null, docxHeadingLevel: null, docxPart: null, ocrPage: null, ocrRegion: null });
    if (block.heading) sections.push({ title: block.text, text: block.text, order: sections.length, startOffset, endOffset: rawText.length, headingLevel: block.heading });
  }
  return { rawText, sections, sourceFragments, warnings: [], metadata: { volumeHeadingLevel: options.volumeHeadingLevel ?? 1, chapterHeadingLevel: options.chapterHeadingLevel ?? 2, lineCount: lines.length } };
}
