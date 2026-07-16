import { z } from "zod";
import {
  createEmptyLorebook,
  createStableId,
  LorebookSchema,
  type Lorebook,
  type LorebookEntry,
} from "@/domain/lorebook";
import { numberToPosition, positionToNumber } from "./character-book";
import type { AdapterExportResult, AdapterImportResult, LorebookAdapter } from "./types";
import { unknownFields } from "./types";

export const SillyTavernWorldInfoEntrySchema = z.object({
  uid: z.union([z.string(), z.number()]),
  key: z.array(z.string()).default([]),
  keysecondary: z.array(z.string()).default([]),
  comment: z.string().default(""),
  content: z.string().default(""),
  constant: z.boolean().default(false),
  vectorized: z.boolean().default(false),
  selective: z.boolean().default(true),
  selectiveLogic: z.number().int().min(0).max(3).default(0),
  addMemo: z.boolean().default(false),
  order: z.number().default(100),
  position: z.number().int().min(0).default(0),
  disable: z.boolean().default(false),
  ignoreBudget: z.boolean().default(false),
  excludeRecursion: z.boolean().default(false),
  preventRecursion: z.boolean().default(false),
  delayUntilRecursion: z.union([z.boolean(), z.number()]).default(false),
  probability: z.number().min(0).max(100).default(100),
  useProbability: z.boolean().default(true),
  depth: z.number().int().min(0).default(4),
  outletName: z.string().default(""),
  group: z.string().default(""),
  groupOverride: z.boolean().default(false),
  groupWeight: z.number().default(100),
  scanDepth: z.number().int().min(0).nullable().default(null),
  caseSensitive: z.boolean().nullable().default(null),
  matchWholeWords: z.boolean().nullable().default(null),
  useGroupScoring: z.boolean().nullable().default(null),
  automationId: z.string().default(""),
  role: z.number().int().min(0).max(2).default(0),
  sticky: z.number().int().min(0).nullable().default(null),
  cooldown: z.number().int().min(0).nullable().default(null),
  delay: z.number().int().min(0).nullable().default(null),
  triggers: z.array(z.string()).default([]),
}).passthrough();

export const SillyTavernWorldInfoSchema = z.object({
  entries: z.record(z.string(), SillyTavernWorldInfoEntrySchema),
}).passthrough();

export type SillyTavernWorldInfo = z.infer<typeof SillyTavernWorldInfoSchema>;
type STEntry = z.infer<typeof SillyTavernWorldInfoEntrySchema>;

const ENTRY_KEYS = Object.keys(SillyTavernWorldInfoEntrySchema.shape);
const LOGIC_FROM_ST = ["and_any", "not_all", "not_any", "and_all"] as const;
const LOGIC_TO_ST = { and_any: 0, not_all: 1, not_any: 2, and_all: 3 } as const;

export class SillyTavernWorldInfoAdapter implements LorebookAdapter<SillyTavernWorldInfo> {
  readonly format = "sillytavern_world_info" as const;

  detect(data: unknown): boolean {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    const entries = (data as Record<string, unknown>).entries;
    return !!entries && typeof entries === "object" && !Array.isArray(entries);
  }

  validate(data: unknown) {
    const result = SillyTavernWorldInfoSchema.safeParse(data);
    return result.success
      ? { success: true as const, data: result.data }
      : { success: false as const, error: result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("；") };
  }

  import(data: unknown, options?: { name?: string }): AdapterImportResult {
    const result = this.validate(data);
    if (!result.success) throw new Error(`SillyTavern 世界书校验失败：${result.error}`);
    const source = result.data;
    const now = new Date().toISOString();
    const book = createEmptyLorebook(options?.name || String((source as Record<string, unknown>).name || "导入的世界书"));
    book.metadata = { ...book.metadata, sourceFormat: this.format, importedAt: now, modifiedAt: now };
    book.formatSpecificData.sillyTavern = {
      unknownRootFields: unknownFields(source as Record<string, unknown>, ["entries"]),
    };
    book.entries = Object.entries(source.entries).map(([key, entry], index) => this.importEntry(entry, key, index));
    return { lorebook: LorebookSchema.parse(book), warnings: [] };
  }

  private importEntry(entry: STEntry, key: string, index: number): LorebookEntry {
    const unknown = unknownFields(entry as Record<string, unknown>, ENTRY_KEYS);
    return {
      id: typeof entry.uid === "string" && entry.uid ? entry.uid : createStableId("entry"),
      externalId: entry.uid ?? key,
      name: entry.comment,
      category: typeof unknown["storyCardStudioCategory"] === "string" ? unknown["storyCardStudioCategory"] : "其他",
      content: entry.content,
      enabled: !entry.disable,
      insertionOrder: entry.order,
      position: numberToPosition(entry.position),
      depth: entry.depth,
      role: (["system", "user", "assistant"] as const)[entry.role] || "system",
      outletName: entry.outletName,
      activation: {
        primaryKeys: entry.key,
        secondaryKeys: entry.keysecondary,
        secondaryLogic: LOGIC_FROM_ST[entry.selectiveLogic],
        caseSensitive: entry.caseSensitive,
        matchWholeWords: entry.matchWholeWords,
        constant: entry.constant,
        selective: entry.selective,
        recursive: !entry.excludeRecursion,
        preventRecursion: entry.preventRecursion,
        delayUntilRecursion: typeof entry.delayUntilRecursion === "number" ? entry.delayUntilRecursion : entry.delayUntilRecursion ? 1 : 0,
        probability: entry.useProbability ? entry.probability : 100,
        scanDepth: entry.scanDepth,
        sticky: entry.sticky,
        cooldown: entry.cooldown,
        delay: entry.delay,
        group: entry.group,
        groupOverride: entry.groupOverride,
        groupWeight: entry.groupWeight,
      },
      extensions: {},
      formatSpecificData: {
        characterBook: {},
        sillyTavern: { ...unknown, vectorized: entry.vectorized, addMemo: entry.addMemo,
          ignoreBudget: entry.ignoreBudget, useGroupScoring: entry.useGroupScoring,
          automationId: entry.automationId, triggers: entry.triggers, displayIndex: index },
      },
      provenance: typeof unknown["storyCardStudioProvenance"] === "string"
        ? unknown["storyCardStudioProvenance"] as LorebookEntry["provenance"] : "user_fact",
      compatibilityWarnings: [],
    };
  }

  export(book: Lorebook): AdapterExportResult<SillyTavernWorldInfo> {
    const validated = LorebookSchema.parse(book);
    const savedRoot = validated.formatSpecificData.sillyTavern.unknownRootFields;
    const root = savedRoot && typeof savedRoot === "object" && !Array.isArray(savedRoot)
      ? savedRoot as Record<string, unknown> : {};
    const entries: Record<string, STEntry> = {};
    validated.entries.forEach((entry, index) => {
      const uid = entry.externalId ?? index;
      entries[String(uid)] = this.exportEntry(entry, uid);
    });
    const data = SillyTavernWorldInfoSchema.parse({ ...root, entries });
    const warnings = [] as AdapterExportResult<SillyTavernWorldInfo>["warnings"];
    if (validated.description) warnings.push({ code: "standalone_book_description", message: "独立 World Info 没有稳定的书级 description 字段；简介仅保留在本应用草稿中。", lossy: true });
    if (validated.scanDepth !== null || validated.tokenBudget !== null || validated.recursiveScanning) warnings.push({ code: "standalone_book_settings", message: "书级 scan depth、token budget 或 recursive scanning 在 SillyTavern 中通常是全局激活设置，不能由独立文件根字段稳定表达。", lossy: true });
    if (Object.keys(validated.extensions).length) warnings.push({ code: "standalone_book_extensions", message: "Character Book 书级 extensions 不是独立 World Info 的标准字段，已保留在应用内部。", lossy: true });
    return { data, warnings };
  }

  private exportEntry(entry: LorebookEntry, uid: string | number): STEntry {
    const st = entry.formatSpecificData.sillyTavern;
    const unknown = Object.fromEntries(Object.entries(st).filter(([key]) => ![
      "vectorized", "addMemo", "ignoreBudget", "useGroupScoring", "automationId", "triggers", "displayIndex",
    ].includes(key)));
    return SillyTavernWorldInfoEntrySchema.parse({
      ...unknown,
      uid,
      key: entry.activation.primaryKeys,
      keysecondary: entry.activation.secondaryKeys,
      comment: entry.name,
      content: entry.content,
      constant: entry.activation.constant,
      vectorized: st.vectorized ?? false,
      selective: entry.activation.selective,
      selectiveLogic: LOGIC_TO_ST[entry.activation.secondaryLogic],
      addMemo: st.addMemo ?? Boolean(entry.name),
      order: entry.insertionOrder,
      position: positionToNumber(entry.position),
      disable: !entry.enabled,
      ignoreBudget: st.ignoreBudget ?? false,
      excludeRecursion: !entry.activation.recursive,
      preventRecursion: entry.activation.preventRecursion,
      delayUntilRecursion: entry.activation.delayUntilRecursion,
      probability: entry.activation.probability,
      useProbability: true,
      depth: entry.depth,
      outletName: entry.outletName,
      group: entry.activation.group,
      groupOverride: entry.activation.groupOverride,
      groupWeight: entry.activation.groupWeight,
      scanDepth: entry.activation.scanDepth,
      caseSensitive: entry.activation.caseSensitive,
      matchWholeWords: entry.activation.matchWholeWords,
      useGroupScoring: st.useGroupScoring ?? null,
      automationId: st.automationId ?? "",
      role: { system: 0, user: 1, assistant: 2 }[entry.role],
      sticky: entry.activation.sticky,
      cooldown: entry.activation.cooldown,
      delay: entry.activation.delay,
      triggers: st.triggers ?? [],
      storyCardStudioCategory: entry.category,
      storyCardStudioProvenance: entry.provenance,
    });
  }
}
