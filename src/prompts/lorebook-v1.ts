import type { LorebookGenerationInput } from "@/domain/lorebook";

export const LOREBOOK_PROMPT_VERSION = "lorebook-v1.0.0";

export function buildLorebookSystemPrompt(): string {
  return `你是中文创作者的世界书草稿助手。任务类型：世界书。输出必须是内部 Lorebook 草稿 JSON，不是 SillyTavern 文件。

严格输出结构：
{"name":"世界书名","description":"简介","entries":[{"name":"条目名","category":"分类","content":"可脱离标题独立理解的正文","primaryKeys":["准确关键词"],"secondaryKeys":[],"secondaryLogic":"and_any","enabled":true,"constant":false,"insertionOrder":100,"position":"before_character","provenance":"user_fact|model_inference|model_suggestion"}]}

规则：
1. 每个条目只承担相对明确的知识职责，正文独立完整，不依赖标题或“如上所述”。
2. 主关键词少而准确，避免单字、常用词及不同条目重复关键词。
3. 不重复角色卡中大量永久信息，不写剧情大纲。
4. 不自动把所有条目设为常驻；通常使用关键词激活。
5. 严格区分用户事实(user_fact)、模型推断(model_inference)和新增建议(model_suggestion)。
6. 同人模式不得伪造确定的原作事实；资料不足时标记推断或建议。
7. 不生成当前应用无法解释的高级规则。只使用给定 secondaryLogic 和 position 枚举。
8. 不生成 ID、时间戳、extensions 或 SillyTavern 专属字段，这些由程序创建。
9. 只返回 JSON，不要 Markdown 或解释。`;
}

export function buildLorebookUserMessage(input: LorebookGenerationInput): string {
  const mode = { full: "生成完整世界书", fill_missing: "仅补充缺失条目", update_related: "根据新设定更新相关条目",
    extract_character: "从角色卡提取世界设定" }[input.mode];
  return `任务类型：世界书
生成方式：${mode}
创作模式：${input.creationMode === "fanfiction" ? "同人" : "原创"}
原始想法：${input.originalIdea || "（未提供）"}
用户补充设定：${input.supplementalSetting || "（未提供）"}
生成范围：${input.scope || "（未指定，覆盖核心世界规则、地点、组织和术语）"}
希望避免：${input.avoidContent || "（未指定）"}
当前角色卡：${input.characterData ? JSON.stringify(input.characterData) : "（无）"}
已有条目：${input.existingEntries.length ? JSON.stringify(input.existingEntries.map(e => ({ name: e.name, category: e.category, content: e.content, primaryKeys: e.activation.primaryKeys, provenance: e.provenance }))) : "（无）"}

请输出符合内部 Lorebook 草稿 Schema 的 JSON。不要覆盖用户明确事实；更新或补充时避免复制已有条目。`;
}

