import type { ImportSourceMap } from "@/domain/work-import";

export interface ParsedDocumentSection {
  title: string;
  text: string;
  order: number;
  startOffset: number;
  endOffset: number;
  headingLevel?: number;
  sourcePath?: string;
}

export interface ParsedDocumentAdapterResult {
  rawText: string;
  sections: ParsedDocumentSection[];
  sourceFragments: ImportSourceMap[];
  warnings: string[];
  metadata: Record<string, unknown>;
}

export function decodeXmlEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (_, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? `&${entity};`;
  });
}

export function stripUnsafeHtml(value: string): string {
  const safe = value
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, "")
    .replace(/<object\b[\s\S]*?<\/object\s*>/gi, "")
    .replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|tr|section|article)>/gi, "\n")
    .replace(/<img\b[^>]*\balt\s*=\s*["']([^"']*)["'][^>]*>/gi, "[图片：$1]")
    .replace(/<[^>]+>/g, "");
  return decodeXmlEntities(safe).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
