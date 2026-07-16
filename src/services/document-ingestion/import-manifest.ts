import {
  ImportManifestSchema, type ImportManifest, type ImportManifestItem, type WorkImportFormat,
  workImportId, workImportNow,
} from "@/domain/work-import";
import { sanitizeDocumentFilename } from "./file-validator";

export interface ImportFileDescriptor { name: string; size: number; type: string; relativePath?: string; contentHash?: string; }
export interface BundleParseResult { documentId: string; chapterIds: string[]; warnings: string[]; }

const chineseDigits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function chineseNumber(value: string): number {
  if (!value) return 0;
  let total = 0; let current = 0;
  for (const char of value) {
    if (char in chineseDigits) current = chineseDigits[char];
    else if (char === "十") { total += (current || 1) * 10; current = 0; }
    else if (char === "百") { total += (current || 1) * 100; current = 0; }
    else if (char === "千") { total += (current || 1) * 1000; current = 0; }
  }
  return total + current;
}

function naturalParts(value: string): Array<string | number> {
  const normalized = value.normalize("NFKC").toLocaleLowerCase().replace(/[零〇一二两三四五六七八九十百千]+/g, (match) => String(chineseNumber(match)));
  return normalized.split(/(\d+)/).filter(Boolean).map((part) => /^\d+$/.test(part) ? Number(part) : part);
}

export function compareDocumentNames(left: string, right: string): number {
  const a = naturalParts(left); const b = naturalParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if (a[index] === undefined) return -1; if (b[index] === undefined) return 1;
    if (a[index] === b[index]) continue;
    if (typeof a[index] === "number" && typeof b[index] === "number") return (a[index] as number) - (b[index] as number);
    if (typeof a[index] === "number") return -1; if (typeof b[index] === "number") return 1;
    const leftLatin = /^[a-z]/i.test(a[index] as string); const rightLatin = /^[a-z]/i.test(b[index] as string);
    if (leftLatin !== rightLatin) return leftLatin ? -1 : 1;
    return String(a[index]).localeCompare(String(b[index]), "zh-CN");
  }
  return left.localeCompare(right, "zh-CN");
}
export function naturalSortDocumentNames(names: string[]): string[] { return [...names].sort(compareDocumentNames); }

export function detectWorkImportFormat(name: string, mimeType = ""): WorkImportFormat {
  const lower = name.toLocaleLowerCase();
  if (lower.endsWith(".txt")) return "txt"; if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".epub")) return "epub"; if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".md") || lower.endsWith(".markdown") || mimeType === "text/markdown") return "markdown";
  throw new Error(`不支持的作品文件格式：${name}`);
}

export function createImportManifest(projectId: string, files: ImportFileDescriptor[]): ImportManifest {
  const now = workImportNow();
  const ordered = [...files].sort((a, b) => compareDocumentNames(a.relativePath || a.name, b.relativePath || b.name));
  return ImportManifestSchema.parse({
    id: workImportId("manifest"), projectId, createdAt: now, modifiedAt: now,
    items: ordered.map((file, order) => ({
      id: workImportId("manifest_item"), originalFilename: file.name, safeFilename: sanitizeDocumentFilename(file.name),
      relativePath: file.relativePath ?? "", format: detectWorkImportFormat(file.name, file.type), mimeType: file.type,
      fileSize: file.size, contentHash: file.contentHash ?? "", order,
      volumeName: (file.relativePath ?? "").replace(/\\/g, "/").split("/").slice(0, -1).join("/"),
    })),
  });
}

export function reorderManifestItem(manifest: ImportManifest, itemId: string, direction: -1 | 1): ImportManifest {
  const items = [...manifest.items].sort((a, b) => a.order - b.order); const index = items.findIndex((item) => item.id === itemId); const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return manifest;
  [items[index], items[target]] = [items[target], items[index]];
  return ImportManifestSchema.parse({ ...manifest, items: items.map((item, order) => ({ ...item, order })), modifiedAt: workImportNow() });
}

export async function processDocumentBundle(manifest: ImportManifest, parse: (item: ImportManifestItem) => Promise<BundleParseResult>, signal?: AbortSignal): Promise<ImportManifest> {
  const items: ImportManifestItem[] = [];
  for (const item of [...manifest.items].sort((a, b) => a.order - b.order)) {
    if (signal?.aborted) {
      items.push({ ...item, status: "cancelled", errors: [...item.errors, "任务已取消。"] }); continue;
    }
    if (item.excluded) { items.push({ ...item, status: "completed" }); continue; }
    try {
      const parsed = await parse({ ...item, status: "extracting" });
      items.push({ ...item, status: "ready_for_review", documentId: parsed.documentId, chapterIds: parsed.chapterIds, warnings: [...item.warnings, ...parsed.warnings] });
    } catch (error) {
      items.push({ ...item, status: "failed", errors: [...item.errors, (error as Error).message], retryCount: item.retryCount + 1 });
    }
  }
  const completedItemIds = items.filter((item) => ["ready_for_review", "completed"].includes(item.status)).map((item) => item.id);
  const failedItemIds = items.filter((item) => item.status === "failed").map((item) => item.id);
  const status = signal?.aborted ? "cancelled" : failedItemIds.length ? (completedItemIds.length ? "partially_completed" : "failed") : "ready_for_review";
  return ImportManifestSchema.parse({ ...manifest, status, items, checkpoint: { completedItemIds, failedItemIds, savedAt: workImportNow() }, modifiedAt: workImportNow() });
}
