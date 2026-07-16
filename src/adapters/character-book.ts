import { z } from "zod";
import {
  CharacterBookSchema,
  type CharacterBook,
  type CharacterBookEntry,
} from "@/domain/character-card";
import {
  createEmptyLorebook,
  createStableId,
  LorebookSchema,
  type Lorebook,
  type LorebookEntry,
} from "@/domain/lorebook";
import type { AdapterExportResult, AdapterImportResult, LorebookAdapter } from "./types";
import { unknownFields } from "./types";

const BOOK_KEYS = ["name", "description", "scan_depth", "token_budget", "recursive_scanning", "extensions", "entries"] as const;
const ENTRY_KEYS = ["keys", "content", "extensions", "enabled", "insertion_order", "case_sensitive", "name", "priority", "id", "comment", "selective", "secondary_keys", "constant", "position"] as const;

const LOGIC_FROM_ST: Record<number, LorebookEntry["activation"]["secondaryLogic"]> = {
  0: "and_any", 1: "not_all", 2: "not_any", 3: "and_all",
};
const LOGIC_TO_ST = { and_any: 0, not_all: 1, not_any: 2, and_all: 3 } as const;

function value<T>(record: Record<string, unknown>, key: string, fallback: T): T {
  return record[key] === undefined ? fallback : record[key] as T;
}

export class CharacterBookAdapter implements LorebookAdapter<CharacterBook> {
  readonly format = "character_book_v2" as const;

  detect(data: unknown): boolean {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    const record = data as Record<string, unknown>;
    return Array.isArray(record.entries) && !("spec" in record);
  }

  validate(data: unknown) {
    const result = CharacterBookSchema.safeParse(data);
    return result.success
      ? { success: true as const, data: result.data }
      : { success: false as const, error: result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("；") };
  }

  import(data: unknown, options?: { name?: string }): AdapterImportResult {
    const result = this.validate(data);
    if (!result.success) throw new Error(`Character Book 校验失败：${result.error}`);
    const source = result.data;
    const now = new Date().toISOString();
    const book = createEmptyLorebook(source.name || options?.name || "角色内嵌世界书");
    const sourceRecord = source as CharacterBook & Record<string, unknown>;

    book.description = source.description || "";
    book.scanDepth = source.scan_depth ?? null;
    book.tokenBudget = source.token_budget ?? null;
    book.recursiveScanning = source.recursive_scanning ?? false;
    book.extensions = structuredClone(source.extensions);
    book.metadata = {
      ...book.metadata,
      sourceFormat: this.format,
      importedAt: now,
      modifiedAt: now,
    };
    book.formatSpecificData.characterBook = {
      unknownBookFields: unknownFields(sourceRecord, BOOK_KEYS),
    };
    book.entries = source.entries.map((entry, index) => this.importEntry(entry, index));
    return { lorebook: LorebookSchema.parse(book), warnings: [] };
  }

  private importEntry(entry: CharacterBookEntry, index: number): LorebookEntry {
    const extensions = structuredClone(entry.extensions);
    const ext = extensions as Record<string, unknown>;
    const source = entry as CharacterBookEntry & Record<string, unknown>;
    return {
      id: typeof entry.id === "string" && entry.id ? entry.id : createStableId("entry"),
      externalId: entry.id ?? index,
      name: entry.name || entry.comment || "",
      category: value(ext, "story_card_studio/category", "其他"),
      content: entry.content,
      enabled: entry.enabled,
      insertionOrder: entry.insertion_order,
      position: entry.position === "after_char" ? "after_character" : "before_character",
      depth: value(ext, "depth", 4),
      role: (["system", "user", "assistant"] as const)[value(ext, "role", 0)] || "system",
      outletName: value(ext, "outlet_name", ""),
      activation: {
        primaryKeys: entry.keys,
        secondaryKeys: entry.secondary_keys || [],
        secondaryLogic: LOGIC_FROM_ST[value(ext, "selectiveLogic", 0)] || "and_any",
        caseSensitive: entry.case_sensitive ?? value(ext, "case_sensitive", null),
        matchWholeWords: value(ext, "match_whole_words", null),
        constant: entry.constant ?? false,
        selective: entry.selective ?? false,
        recursive: !value(ext, "exclude_recursion", false),
        preventRecursion: value(ext, "prevent_recursion", false),
        delayUntilRecursion: value(ext, "delay_until_recursion", 0),
        probability: value(ext, "probability", 100),
        scanDepth: value(ext, "scan_depth", null),
        sticky: value(ext, "sticky", null),
        cooldown: value(ext, "cooldown", null),
        delay: value(ext, "delay", null),
        group: value(ext, "group", ""),
        groupOverride: value(ext, "group_override", false),
        groupWeight: value(ext, "group_weight", 100),
      },
      extensions,
      formatSpecificData: {
        characterBook: {
          unknownEntryFields: unknownFields(source, ENTRY_KEYS),
          priority: entry.priority,
          comment: entry.comment,
        },
        sillyTavern: {},
      },
      provenance: value(ext, "story_card_studio/provenance", "user_fact"),
      compatibilityWarnings: [],
    };
  }

  export(book: Lorebook): AdapterExportResult<CharacterBook> {
    const validated = LorebookSchema.parse(book);
    const warnings = validated.entries.flatMap(entry => {
      const unsupported = entry.position !== "before_character" && entry.position !== "after_character";
      const entryWarnings = unsupported ? [{
        code: "character_book_position_extension",
        message: `条目“${entry.name || entry.id}”的位置只能通过 SillyTavern extensions 表达，其他 CCv2 前端可能忽略。`,
        entryId: entry.id,
        lossy: true,
      }] : [];
      const st = entry.formatSpecificData.sillyTavern;
      if (Object.keys(st).some(key => !["displayIndex"].includes(key)) || entry.activation.sticky || entry.activation.cooldown || entry.activation.delay || entry.activation.group) {
        entryWarnings.push({ code: "character_book_advanced_extensions",
          message: `条目“${entry.name || entry.id}”含 SillyTavern 高级规则；已写入 extensions，但非 SillyTavern CCv2 前端可能忽略其行为。`,
          entryId: entry.id, lossy: true });
      }
      return entryWarnings;
    });
    const saved = validated.formatSpecificData.characterBook.unknownBookFields;
    const unknownBookFields = saved && typeof saved === "object" && !Array.isArray(saved)
      ? saved as Record<string, unknown> : {};
    const data: CharacterBook = {
      ...unknownBookFields,
      name: validated.name,
      description: validated.description,
      scan_depth: validated.scanDepth ?? undefined,
      token_budget: validated.tokenBudget ?? undefined,
      recursive_scanning: validated.recursiveScanning,
      extensions: structuredClone(validated.extensions),
      entries: validated.entries.map((entry, index) => this.exportEntry(entry, index)),
    };
    return { data: CharacterBookSchema.parse(data), warnings };
  }

  private exportEntry(entry: LorebookEntry, index: number): CharacterBookEntry {
    const saved = entry.formatSpecificData.characterBook.unknownEntryFields;
    const unknownEntryFields = saved && typeof saved === "object" && !Array.isArray(saved)
      ? saved as Record<string, unknown> : {};
    const extensions = {
      ...entry.extensions,
      "story_card_studio/category": entry.category,
      "story_card_studio/provenance": entry.provenance,
      position: positionToNumber(entry.position),
      depth: entry.depth,
      role: roleToNumber(entry.role),
      outlet_name: entry.outletName,
      probability: entry.activation.probability,
      selectiveLogic: LOGIC_TO_ST[entry.activation.secondaryLogic],
      scan_depth: entry.activation.scanDepth,
      match_whole_words: entry.activation.matchWholeWords,
      exclude_recursion: !entry.activation.recursive,
      prevent_recursion: entry.activation.preventRecursion,
      delay_until_recursion: entry.activation.delayUntilRecursion,
      group: entry.activation.group,
      group_override: entry.activation.groupOverride,
      group_weight: entry.activation.groupWeight,
      sticky: entry.activation.sticky,
      cooldown: entry.activation.cooldown,
      delay: entry.activation.delay,
    };
    return {
      ...unknownEntryFields,
      keys: entry.activation.primaryKeys,
      content: entry.content,
      extensions,
      enabled: entry.enabled,
      insertion_order: entry.insertionOrder,
      case_sensitive: entry.activation.caseSensitive ?? undefined,
      name: entry.name || undefined,
      priority: typeof entry.formatSpecificData.characterBook.priority === "number"
        ? entry.formatSpecificData.characterBook.priority : undefined,
      id: entry.externalId ?? index,
      comment: typeof entry.formatSpecificData.characterBook.comment === "string"
        ? entry.formatSpecificData.characterBook.comment : entry.name || undefined,
      selective: entry.activation.selective,
      secondary_keys: entry.activation.secondaryKeys,
      constant: entry.activation.constant,
      position: entry.position === "after_character" ? "after_char" : "before_char",
    };
  }
}

export function positionToNumber(position: LorebookEntry["position"]): number {
  return { before_character: 0, after_character: 1, author_note_top: 2, author_note_bottom: 3,
    at_depth: 4, before_examples: 5, after_examples: 6, outlet: 7 }[position];
}

export function numberToPosition(position: number): LorebookEntry["position"] {
  return (["before_character", "after_character", "author_note_top", "author_note_bottom",
    "at_depth", "before_examples", "after_examples", "outlet"] as const)[position] || "before_character";
}

function roleToNumber(role: LorebookEntry["role"]): number {
  return { system: 0, user: 1, assistant: 2 }[role];
}
