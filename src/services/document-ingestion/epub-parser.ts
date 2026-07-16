import { WORK_IMPORT_PARSER_VERSION, type ImportSourceMap } from "@/domain/work-import";
import { readSafeZip, type SafeArchiveOptions } from "./archive-reader";
import { decodeXmlEntities, stripUnsafeHtml, type ParsedDocumentAdapterResult, type ParsedDocumentSection } from "./structured-parser";

function attr(tag: string, name: string): string { return decodeXmlEntities(tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ?? ""); }
function dirname(path: string) { const at = path.lastIndexOf("/"); return at < 0 ? "" : path.slice(0, at + 1); }
function resolve(base: string, value: string): string {
  const parts = `${dirname(base)}${value}`.split("/"); const out: string[] = [];
  for (const part of parts) { if (!part || part === ".") continue; if (part === "..") { if (!out.length) throw new Error("EPUB 引用路径越过容器根目录。" ); out.pop(); } else out.push(part); }
  return out.join("/");
}
function titleOf(xhtml: string, fallback: string): string {
  const value = xhtml.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1] ?? xhtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return value ? stripUnsafeHtml(value) : fallback.replace(/\.[^.]+$/, "");
}

export async function parseEpubDocument(data: ArrayBuffer, options: SafeArchiveOptions = {}): Promise<ParsedDocumentAdapterResult> {
  const entries = await readSafeZip(data, options);
  const decoder = new TextDecoder();
  if (decoder.decode(entries.get("mimetype")?.data ?? new Uint8Array()).trim() !== "application/epub+zip") throw new Error("文件不是有效 EPUB 容器：mimetype 缺失或不正确。" );
  const container = entries.get("META-INF/container.xml");
  if (!container) throw new Error("EPUB 缺少 META-INF/container.xml。" );
  const containerXml = decoder.decode(container.data);
  const opfPath = attr(containerXml.match(/<rootfile\b[^>]*>/i)?.[0] ?? "", "full-path");
  if (!opfPath || !entries.has(opfPath)) throw new Error("EPUB Container 未指向可读取的 OPF。" );
  const opf = decoder.decode(entries.get(opfPath)!.data);
  const manifest = new Map<string, { href: string; type: string; properties: string }>();
  for (const match of opf.matchAll(/<item\b[^>]*>/gi)) manifest.set(attr(match[0], "id"), { href: attr(match[0], "href"), type: attr(match[0], "media-type"), properties: attr(match[0], "properties") });
  const spineIds = [...opf.matchAll(/<itemref\b[^>]*>/gi)].map((match) => attr(match[0], "idref")).filter(Boolean);
  if (!spineIds.length) throw new Error("EPUB OPF 没有可用 Spine 阅读顺序。" );
  const nav = [...manifest.values()].find((item) => /(^|\s)nav(\s|$)/.test(item.properties));
  const ncx = [...manifest.values()].find((item) => item.type === "application/x-dtbncx+xml");
  const warnings: string[] = [];
  if (!nav && !ncx) warnings.push("EPUB 缺少 Navigation/NCX 目录，已按 Spine 生成章节结构。" );
  const sections: ParsedDocumentSection[] = [];
  const sourceFragments: ImportSourceMap[] = [];
  let rawText = "";
  for (const [order, id] of spineIds.entries()) {
    const item = manifest.get(id);
    if (!item) { warnings.push(`Spine 引用了 Manifest 中不存在的项目：${id}`); continue; }
    const path = resolve(opfPath, item.href.split("#")[0]);
    const entry = entries.get(path);
    if (!entry) { warnings.push(`Spine 正文缺失：${path}`); continue; }
    const xhtml = decoder.decode(entry.data);
    const text = stripUnsafeHtml(xhtml);
    if (!text) { warnings.push(`Spine 正文为空：${path}`); continue; }
    if (rawText) rawText += "\n\n";
    const startOffset = rawText.length;
    rawText += text;
    const title = titleOf(xhtml, path);
    sections.push({ title, text, order: sections.length, startOffset, endOffset: rawText.length, sourcePath: path });
    sourceFragments.push({ documentId: "", relativePath: path, characterStart: startOffset, characterEnd: rawText.length, rawExcerpt: text.slice(0, 240), epubSpineIndex: order, epubPath: path, parserVersion: WORK_IMPORT_PARSER_VERSION, confidence: 1, sourceVersion: 1, contentHash: "", docxParagraphIndex: null, docxHeadingLevel: null, docxPart: null, markdownLineStart: null, markdownLineEnd: null, ocrPage: null, ocrRegion: null });
  }
  if (!rawText) throw new Error("EPUB Spine 没有提取到有效正文，文件可能受保护或损坏。" );
  return { rawText, sections, sourceFragments, warnings, metadata: { opfPath, spineItemCount: spineIds.length, hasNavigation: Boolean(nav || ncx) } };
}
