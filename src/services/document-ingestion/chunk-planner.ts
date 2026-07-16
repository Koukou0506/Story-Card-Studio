import { DocumentChunkSchema, type DocumentChapter, type DocumentChunk } from "@/domain/document-ingestion";
import { createStableId } from "@/domain/lorebook";

interface ChunkPlanInput {
  documentId: string;
  chapters: DocumentChapter[];
  targetCharacters?: number;
  overlapCharacters?: number;
}

interface SentenceUnit { text: string; start: number; end: number; }

function sentenceUnits(chapter: DocumentChapter): SentenceUnit[] {
  const units: SentenceUnit[] = [];
  for (const paragraph of chapter.paragraphs) {
    let cursor = 0;
    for (const match of paragraph.text.matchAll(/[^。！？.!?]+[。！？.!?]+|[^。！？.!?]+$/gu)) {
      const text = match[0].trim();
      if (!text) continue;
      const local = paragraph.text.indexOf(match[0], cursor) + match[0].indexOf(text);
      cursor = local + text.length;
      units.push({ text, start: paragraph.startOffset + local, end: paragraph.startOffset + local + text.length });
    }
  }
  return units;
}

export function planDocumentChunks(input: ChunkPlanInput): DocumentChunk[] {
  const target = Math.max(100, input.targetCharacters ?? 6000);
  const overlapTarget = Math.max(0, Math.min(input.overlapCharacters ?? 400, Math.floor(target / 3)));
  const chunks: DocumentChunk[] = [];
  for (const chapter of [...input.chapters].sort((a, b) => a.order - b.order)) {
    const units = sentenceUnits(chapter);
    let current: SentenceUnit[] = [];
    const flush = () => {
      if (!current.length) return;
      const coreText = current.map((unit) => unit.text).join("");
      const previous = chunks.at(-1);
      const sameChapter = previous?.chapterId === chapter.id;
      const overlap = sameChapter && overlapTarget ? previous.text.slice(-overlapTarget) : "";
      const text = `${overlap}${coreText}`;
      const startOffset = Math.max(chapter.startOffset, current[0].start - overlap.length);
      const endOffset = current.at(-1)!.end;
      chunks.push(DocumentChunkSchema.parse({
        id: createStableId("chunk"), documentId: input.documentId, chapterId: chapter.id, order: chunks.length,
        text, startOffset, endOffset, estimatedTokens: Math.max(1, Math.ceil(text.length / 2)),
        overlapBefore: overlap.length, overlapAfter: 0,
        sourceSpans: [{
          documentId: input.documentId, sourceVersion: 1, chapterId: chapter.id, chapterTitle: chapter.title,
          characterStart: startOffset, characterEnd: endOffset,
          rawTextExcerpt: text.slice(0, 120), normalizedTextExcerpt: text.slice(0, 120), extractionConfidence: "high", mappingStatus: "mapped",
        }],
      }));
      if (previous && sameChapter) previous.overlapAfter = overlap.length;
      current = [];
    };
    for (const unit of units) {
      const length = current.reduce((total, item) => total + item.text.length, 0);
      if (current.length && length + unit.text.length > target) flush();
      current.push(unit);
    }
    flush();
  }
  return chunks;
}

export function deduplicateOverlapExtractions<T extends { id: string; type: string; normalizedName: string; content: string; sourceStart: number; sourceEnd: number }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [item.type, item.normalizedName.normalize("NFKC").toLocaleLowerCase(), item.content.normalize("NFKC"), item.sourceStart, item.sourceEnd].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
