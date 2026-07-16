import { z } from "zod";

export const LOREBOOK_DATA_VERSION = 1;

export const LorebookSourceFormatSchema = z.enum([
  "internal",
  "character_book_v2",
  "sillytavern_world_info",
]);

export const SecondaryKeyLogicSchema = z.enum([
  "and_any",
  "and_all",
  "not_any",
  "not_all",
]);

export const LorebookPositionSchema = z.enum([
  "before_character",
  "after_character",
  "before_examples",
  "after_examples",
  "author_note_top",
  "author_note_bottom",
  "at_depth",
  "outlet",
]);

export const LorebookRoleSchema = z.enum(["system", "user", "assistant"]);

export const ActivationRuleSchema = z.object({
  primaryKeys: z.array(z.string()).default([]),
  secondaryKeys: z.array(z.string()).default([]),
  secondaryLogic: SecondaryKeyLogicSchema.default("and_any"),
  caseSensitive: z.boolean().nullable().default(null),
  matchWholeWords: z.boolean().nullable().default(null),
  constant: z.boolean().default(false),
  selective: z.boolean().default(false),
  recursive: z.boolean().default(true),
  preventRecursion: z.boolean().default(false),
  delayUntilRecursion: z.number().int().min(0).default(0),
  probability: z.number().min(0).max(100).default(100),
  scanDepth: z.number().int().min(0).nullable().default(null),
  sticky: z.number().int().min(0).nullable().default(null),
  cooldown: z.number().int().min(0).nullable().default(null),
  delay: z.number().int().min(0).nullable().default(null),
  group: z.string().default(""),
  groupOverride: z.boolean().default(false),
  groupWeight: z.number().default(100),
}).passthrough();

export const FormatSpecificDataSchema = z.object({
  characterBook: z.record(z.string(), z.unknown()).default({}),
  sillyTavern: z.record(z.string(), z.unknown()).default({}),
}).passthrough().default({ characterBook: {}, sillyTavern: {} });

export const LorebookEntrySchema = z.object({
  id: z.string().min(1),
  externalId: z.union([z.string(), z.number()]).nullable().default(null),
  name: z.string().default(""),
  category: z.string().default("其他"),
  content: z.string().default(""),
  enabled: z.boolean().default(true),
  insertionOrder: z.number().default(100),
  position: LorebookPositionSchema.default("before_character"),
  depth: z.number().int().min(0).default(4),
  role: LorebookRoleSchema.default("system"),
  outletName: z.string().default(""),
  activation: ActivationRuleSchema.default(() => ActivationRuleSchema.parse({})),
  extensions: z.record(z.string(), z.unknown()).default({}),
  formatSpecificData: FormatSpecificDataSchema,
  provenance: z.enum(["user_fact", "model_inference", "model_suggestion"]).default("user_fact"),
  compatibilityWarnings: z.array(z.string()).default([]),
}).passthrough();

export const LorebookMetadataSchema = z.object({
  sourceFormat: LorebookSourceFormatSchema.default("internal"),
  linkedCharacterIds: z.array(z.string()).default([]),
  promptVersion: z.string().default("lorebook-v1.0.0"),
  createdAt: z.string(),
  modifiedAt: z.string(),
  importedAt: z.string().optional(),
  dataVersion: z.literal(LOREBOOK_DATA_VERSION).default(LOREBOOK_DATA_VERSION),
}).passthrough();

export const LorebookSchema = z.object({
  id: z.string().min(1),
  name: z.string().default("未命名世界书"),
  description: z.string().default(""),
  entries: z.array(LorebookEntrySchema).default([]),
  scanDepth: z.number().int().min(0).nullable().default(null),
  tokenBudget: z.number().int().min(0).nullable().default(null),
  recursiveScanning: z.boolean().default(false),
  metadata: LorebookMetadataSchema,
  extensions: z.record(z.string(), z.unknown()).default({}),
  formatSpecificData: FormatSpecificDataSchema,
}).passthrough();

export const LorebookGenerationModeSchema = z.enum([
  "full",
  "fill_missing",
  "update_related",
  "extract_character",
]);

export const LorebookGenerationInputSchema = z.object({
  originalIdea: z.string().default(""),
  creationMode: z.enum(["original", "fanfiction"]).default("original"),
  characterData: z.record(z.string(), z.unknown()).nullable().default(null),
  supplementalSetting: z.string().default(""),
  scope: z.string().default(""),
  avoidContent: z.string().default(""),
  mode: LorebookGenerationModeSchema.default("full"),
  existingEntries: z.array(LorebookEntrySchema).default([]),
});

/** 模型输出使用内部语义，但 ID、时间和外部兼容字段由程序生成。 */
export const LorebookDraftOutputSchema = z.object({
  name: z.string().default("未命名世界书"),
  description: z.string().default(""),
  entries: z.array(z.object({
    name: z.string().default(""),
    category: z.string().default("其他"),
    content: z.string().default(""),
    primaryKeys: z.array(z.string()).default([]),
    secondaryKeys: z.array(z.string()).default([]),
    secondaryLogic: SecondaryKeyLogicSchema.default("and_any"),
    enabled: z.boolean().default(true),
    constant: z.boolean().default(false),
    insertionOrder: z.number().default(100),
    position: LorebookPositionSchema.default("before_character"),
    provenance: z.enum(["user_fact", "model_inference", "model_suggestion"]).default("model_suggestion"),
  })).default([]),
});

export type Lorebook = z.infer<typeof LorebookSchema>;
export type LorebookEntry = z.infer<typeof LorebookEntrySchema>;
export type ActivationRule = z.infer<typeof ActivationRuleSchema>;
export type LorebookMetadata = z.infer<typeof LorebookMetadataSchema>;
export type FormatSpecificData = z.infer<typeof FormatSpecificDataSchema>;
export type LorebookSourceFormat = z.infer<typeof LorebookSourceFormatSchema>;
export type LorebookGenerationInput = z.infer<typeof LorebookGenerationInputSchema>;

export function createStableId(prefix = "lb"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyLorebookEntry(index = 0): LorebookEntry {
  return LorebookEntrySchema.parse({
    id: createStableId("entry"),
    externalId: null,
    insertionOrder: 100 - index,
  });
}

export function createEmptyLorebook(name = "未命名世界书"): Lorebook {
  const now = new Date().toISOString();
  return LorebookSchema.parse({
    id: createStableId("lorebook"),
    name,
    metadata: { createdAt: now, modifiedAt: now },
  });
}

export function touchLorebook(book: Lorebook): Lorebook {
  return {
    ...book,
    metadata: { ...book.metadata, modifiedAt: new Date().toISOString() },
  };
}

