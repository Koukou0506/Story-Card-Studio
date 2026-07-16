import { z } from "zod";

// ============================================
// 用户项目输入 Schema
// ============================================

/** 创作模式 */
export const CreationModeSchema = z.enum(["original", "fanfiction"]);
export type CreationMode = z.infer<typeof CreationModeSchema>;

/** 基础输入字段 */
export const ProjectInputSchema = z.object({
  /** 项目名称 */
  projectName: z.string().default("未命名项目"),
  /** 原创/同人 */
  creationMode: CreationModeSchema.default("original"),
  /** 原始想法 - 始终保留，不被生成覆盖 */
  originalIdea: z.string().default(""),
  /** 角色名称 */
  characterName: z.string().default(""),
  /** 用户身份 */
  userIdentity: z.string().default(""),
  /** 期望关系 */
  desiredRelationship: z.string().default(""),
  /** 场景 */
  scene: z.string().default(""),
  /** 故事基调 */
  tone: z.string().default(""),
  /** 禁止或避免内容 */
  forbiddenContent: z.string().default(""),
  /** 高级设定 */
  advanced: z
    .object({
      appearance: z.string().default(""),
      identityAndExperience: z.string().default(""),
      coreDesire: z.string().default(""),
      coreFear: z.string().default(""),
      personalityTraits: z.string().default(""),
      values: z.string().default(""),
      relationship: z.string().default(""),
      languageStyle: z.string().default(""),
      behaviorBoundaries: z.string().default(""),
      openingSituation: z.string().default(""),
      sourceMaterial: z.string().default(""),
    })
    .default(() => ({
      appearance: "",
      identityAndExperience: "",
      coreDesire: "",
      coreFear: "",
      personalityTraits: "",
      values: "",
      relationship: "",
      languageStyle: "",
      behaviorBoundaries: "",
      openingSituation: "",
      sourceMaterial: "",
    })),
});

export type ProjectInput = z.infer<typeof ProjectInputSchema>;

/** 创建空白的项目输入 */
export function createEmptyProjectInput(): ProjectInput {
  return ProjectInputSchema.parse({});
}
