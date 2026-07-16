import { ChapterVersionCandidateSchema, type ChapterVersionCandidate, type ChapterVersionCandidate as Candidate, workImportId } from "@/domain/work-import";

export interface ChapterVersionInput { id: string; title: string; text: string; contentHash?: string; }
function normalized(text: string) { return text.normalize("NFKC").replace(/[\s\p{P}\p{S}]+/gu, "").toLocaleLowerCase(); }
function grams(text: string): Set<string> { const value = normalized(text); const set = new Set<string>(); for (let index = 0; index < value.length - 1; index += 1) set.add(value.slice(index, index + 2)); return set; }
function similarity(left: string, right: string): number {
  const a = grams(left); const b = grams(right); if (!a.size && !b.size) return normalized(left) === normalized(right) ? 1 : 0;
  const intersection = [...a].filter((value) => b.has(value)).length; return intersection / Math.max(1, a.size + b.size - intersection);
}

export function resolveChapterVersions(chapters: ChapterVersionInput[]): ChapterVersionCandidate[] {
  const results: Candidate[] = [];
  for (let left = 0; left < chapters.length; left += 1) for (let right = left + 1; right < chapters.length; right += 1) {
    const a = chapters[left]; const b = chapters[right]; const score = similarity(a.text, b.text); const sameTitle = normalized(a.title) === normalized(b.title);
    let relation: Candidate["relation"] = "unrelated"; const reasons: string[] = [];
    if ((a.contentHash && a.contentHash === b.contentHash) || a.text === b.text) { relation = "exact_duplicate"; reasons.push("正文或文件哈希完全相同"); }
    else if (normalized(a.text) === normalized(b.text)) { relation = "normalized_duplicate"; reasons.push("忽略空白和标点后正文相同"); }
    else if (normalized(a.text).includes(normalized(b.text)) || normalized(b.text).includes(normalized(a.text))) { relation = "partial_overlap"; reasons.push("一个文本包含另一个文本"); }
    else if (sameTitle && score >= 0.55) { relation = "probable_revision"; reasons.push("标题相同且正文高度相似"); }
    else if (sameTitle && score >= 0.08) { relation = "possible_revision"; reasons.push("标题相同且正文部分相似"); }
    else if (sameTitle) { relation = "title_conflict"; reasons.push("标题相同但正文不同"); }
    results.push(ChapterVersionCandidateSchema.parse({ id: workImportId("chapter_version"), chapterIds: [a.id, b.id], relation, similarity: Math.round(score * 1000) / 1000, reasons }));
  }
  return results;
}
