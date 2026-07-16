import { z } from "zod";

// ============================================
// Character Card V2 - 运行时 Schema（Zod）
// 基于 https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md
// ============================================

/** CharacterBook Entry - 世界书条目 */
export const CharacterBookEntrySchema = z.object({
  keys: z.array(z.string()),
  content: z.string(),
  extensions: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
  insertion_order: z.number().default(100),
  case_sensitive: z.boolean().optional(),
  name: z.string().optional(),
  priority: z.number().optional(),
  id: z.union([z.string(), z.number()]).optional(),
  comment: z.string().optional(),
  selective: z.boolean().optional(),
  secondary_keys: z.array(z.string()).optional(),
  constant: z.boolean().optional(),
  position: z.enum(["before_char", "after_char"]).optional(),
}).passthrough();

/** CharacterBook - 角色专属世界书 */
export const CharacterBookSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  scan_depth: z.number().optional(),
  token_budget: z.number().optional(),
  recursive_scanning: z.boolean().optional(),
  extensions: z.record(z.string(), z.unknown()).default({}),
  entries: z.array(CharacterBookEntrySchema).default([]),
}).passthrough();

/** Character Card V2 data 字段 */
export const CharacterDataSchema = z.object({
  name: z.string().default(""),
  description: z.string().default(""),
  personality: z.string().default(""),
  scenario: z.string().default(""),
  first_mes: z.string().default(""),
  mes_example: z.string().default(""),
  creator_notes: z.string().default(""),
  system_prompt: z.string().default(""),
  post_history_instructions: z.string().default(""),
  alternate_greetings: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  creator: z.string().default(""),
  character_version: z.string().default("1.0"),
  extensions: z.record(z.string(), z.unknown()).default({}),
  character_book: CharacterBookSchema.optional(),
}).passthrough();

/** Character Card V2 完整结构 */
export const CharacterCardV2Schema = z.object({
  spec: z.literal("chara_card_v2"),
  spec_version: z.literal("2.0"),
  data: CharacterDataSchema,
}).passthrough();

// ============================================
// TypeScript 类型导出
// ============================================
export type CharacterBookEntry = z.infer<typeof CharacterBookEntrySchema>;
export type CharacterBook = z.infer<typeof CharacterBookSchema>;
export type CharacterData = z.infer<typeof CharacterDataSchema>;
export type CharacterCardV2 = z.infer<typeof CharacterCardV2Schema>;

// ============================================
// 辅助函数
// ============================================

/** 创建空白的 Character Card V2 数据 */
export function createEmptyCharacterData(): CharacterData {
  return CharacterDataSchema.parse({});
}

/** 创建空白的 Character Card V2 卡片 */
export function createEmptyCharacterCard(): CharacterCardV2 {
  return {
    spec: "chara_card_v2" as const,
    spec_version: "2.0" as const,
    data: createEmptyCharacterData(),
  };
}

/** 校验并返回安全的 Character Card V2，对缺失字段填充默认值 */
export function validateCharacterCardV2(data: unknown): CharacterCardV2 {
  return CharacterCardV2Schema.parse(data);
}

/** 安全解析 Character Card V2，返回结果或错误信息 */
export function safeParseCharacterCardV2(
  data: unknown
): { success: true; card: CharacterCardV2 } | { success: false; error: string } {
  const result = CharacterCardV2Schema.safeParse(data);
  if (result.success) {
    return { success: true, card: result.data };
  }
  return { success: false, error: formatZodError(result.error) };
}

/** 格式化 Zod 错误为可读中文信息 */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(" > ");
      return `字段 [${path}]: ${issue.message}`;
    })
    .join("; ");
}
