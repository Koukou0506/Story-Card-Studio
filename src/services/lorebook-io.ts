import type { CharacterBook, CharacterCardV2 } from "@/domain/character-card";
import type { Lorebook, LorebookSourceFormat } from "@/domain/lorebook";
import {
  CharacterBookAdapter,
  SillyTavernWorldInfoAdapter,
  type CompatibilityWarning,
} from "@/adapters";
import { sanitizeFilename } from "./import-export";

const characterBookAdapter = new CharacterBookAdapter();
const worldInfoAdapter = new SillyTavernWorldInfoAdapter();

export function detectLorebookFormat(data: unknown): LorebookSourceFormat | null {
  if (worldInfoAdapter.detect(data)) return worldInfoAdapter.format;
  if (characterBookAdapter.detect(data)) return characterBookAdapter.format;
  return null;
}

export function importLorebookJSON(
  text: string,
  options?: { name?: string; format?: LorebookSourceFormat },
): { lorebook: Lorebook; warnings: CompatibilityWarning[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`文件不是有效的 JSON：${(error as Error).message}`);
  }
  const format = options?.format || detectLorebookFormat(parsed);
  if (format === "sillytavern_world_info") return worldInfoAdapter.import(parsed, options);
  if (format === "character_book_v2") return characterBookAdapter.import(parsed, options);
  throw new Error("无法识别世界书格式：需要 SillyTavern 独立 World Info 或 Character Card V2 Character Book。 ");
}

export function exportStandaloneWorldInfo(book: Lorebook) {
  const result = worldInfoAdapter.export(book);
  return { ...result, json: JSON.stringify(result.data, null, 2) };
}

export function exportCharacterBook(book: Lorebook) {
  return characterBookAdapter.export(book);
}

export function readCharacterBook(card: CharacterCardV2) {
  if (!card.data.character_book) throw new Error("当前角色卡不包含 data.character_book。");
  const result = characterBookAdapter.import(card.data.character_book, { name: card.data.character_book.name || `${card.data.name}的世界书` });
  result.lorebook.metadata.linkedCharacterIds = [card.data.name || "current-character"];
  return result;
}

export function writeCharacterBook(card: CharacterCardV2, book: Lorebook): {
  card: CharacterCardV2;
  characterBook: CharacterBook;
  warnings: CompatibilityWarning[];
} {
  const result = characterBookAdapter.export(book);
  return {
    card: {
      ...card,
      data: { ...card.data, character_book: result.data, extensions: { ...card.data.extensions } },
    },
    characterBook: result.data,
    warnings: result.warnings,
  };
}

export function lorebookFilename(book: Lorebook): string {
  return `${sanitizeFilename(book.name || "world_info")}.json`;
}

export function downloadLorebook(book: Lorebook): CompatibilityWarning[] {
  const result = exportStandaloneWorldInfo(book);
  const blob = new Blob([result.json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = lorebookFilename(book);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return result.warnings;
}

export interface LorebookMergePreview {
  merged: Lorebook;
  added: string[];
  modified: string[];
  conflicts: Array<{ existingId: string; incomingId: string; reason: string }>;
  preserved: string[];
}

function semanticKey(entry: Lorebook["entries"][number]): string {
  const keys = entry.activation.primaryKeys.map(k => k.trim().toLocaleLowerCase()).sort().join("|");
  return `${entry.name.trim().toLocaleLowerCase()}::${keys}`;
}

export function previewLorebookMerge(existing: Lorebook, incoming: Lorebook): LorebookMergePreview {
  const merged = structuredClone(existing);
  const added: string[] = [];
  const modified: string[] = [];
  const preserved: string[] = [];
  const conflicts: LorebookMergePreview["conflicts"] = [];

  for (const candidate of incoming.entries) {
    const match = merged.entries.find(entry =>
      entry.id === candidate.id ||
      (entry.externalId !== null && candidate.externalId !== null && String(entry.externalId) === String(candidate.externalId)) ||
      semanticKey(entry) === semanticKey(candidate));
    if (!match) {
      merged.entries.push(structuredClone(candidate));
      added.push(candidate.id);
      continue;
    }
    if (JSON.stringify(match) === JSON.stringify(candidate)) {
      preserved.push(match.id);
      continue;
    }
    if (match.content !== candidate.content) {
      conflicts.push({ existingId: match.id, incomingId: candidate.id, reason: "相同 ID/名称与关键词的正文不同；已保留原条目，等待用户处理。" });
      preserved.push(match.id);
      continue;
    }
    const index = merged.entries.indexOf(match);
    merged.entries[index] = { ...match, ...candidate, id: match.id };
    modified.push(match.id);
  }
  merged.metadata.modifiedAt = new Date().toISOString();
  return { merged, added, modified, conflicts, preserved };
}
