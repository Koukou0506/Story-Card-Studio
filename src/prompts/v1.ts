import { ProjectInput } from "@/domain/project-input";

// ============================================
// V1 提示词模板 - Character Card V2 角色卡生成
// 版本: 1.0.0
// ============================================

export const PROMPT_VERSION = "1.0.0";

/** 构建系统提示词 */
export function buildSystemPrompt(): string {
  return `你是一个专业的中文角色卡创作助手。你的任务是根据用户提供的信息，生成一张完整、一致的 SillyTavern Character Card V2 角色卡。

## 输出格式要求

你必须返回一个严格的 JSON 对象，对应 Character Card V2 规范中 data 字段的结构。JSON 格式如下：

\`\`\`json
{
  "name": "角色名称",
  "description": "角色的外貌、背景等详细描述",
  "personality": "性格特征和行为模式",
  "scenario": "初始场景/情境描述",
  "first_mes": "角色在对话中的第一条消息",
  "mes_example": "示例对话，展示角色的说话风格",
  "creator_notes": "创作者备注（不发送给模型）",
  "system_prompt": "系统提示词，定义角色扮演规则",
  "post_history_instructions": "追加在对话历史之后的指令",
  "alternate_greetings": ["备选开场消息1", "备选开场消息2"],
  "tags": ["标签1", "标签2"],
  "creator": "创作者名称",
  "character_version": "1.0",
  "extensions": {}
}
\`\`\`

## 创作原则

1. 字段之间不要有明显重复内容。description 侧重外貌和背景，personality 侧重性格，scenario 侧重场景。
2. 角色的第一条消息 (first_mes) 必须包含可互动的情境，给用户留下回应空间。
3. mes_example 使用 <START> 标记分隔每组对话。格式为：
   <START>
   {{user}}: 用户说的话
   {{char}}: 角色回复的话
4. 示例对话应体现角色的语言风格和性格。
5. 所有内容使用中文撰写。
6. system_prompt 和 post_history_instructions 应为完整的中文指令。
7. 生成 2-3 个 alternate_greetings 作为备选开场。
8. 标签 (tags) 应使用简短的中文关键词。
9. 不要在 description、personality 和 scenario 中复制粘贴相同段落。
10. 各字段长度适中：description 200-500 字，personality 100-300 字，scenario 50-150 字。

## 同人内容处理

如果用户选择的是同人模式：
- 对于用户明确提供的原作设定，原样保留；
- 对于你根据原作知识推断的内容，在 creator_notes 中标注"推断"；
- 对于你新创作的内容，在 creator_notes 中标注"新增设定"；
- 不要把未经用户提供的设定表述为确定的原作事实；
- 信息不足时，保持合理留白，不要编造原作细节。

请直接返回 JSON，不要包含任何其他解释文字。`;
}

/** 构建用户消息 */
export function buildUserMessage(input: ProjectInput): string {
  const mode = input.creationMode === "fanfiction" ? "同人" : "原创";

  let message = `请根据以下信息生成一张角色卡。

## 基本信息

- 创作模式：${mode}
- 原始想法：${input.originalIdea || "（未提供）"}
- 角色名称：${input.characterName || "（请根据想法为角色命名）"}
- 用户在故事中的身份：${input.userIdentity || "（未指定）"}
- 期望关系：${input.desiredRelationship || "（未指定）"}
- 场景：${input.scene || "（未指定）"}
- 故事基调：${input.tone || "（未指定）"}
- 避免内容：${input.forbiddenContent || "（未指定）"}`;

  // 如有高级设定，追加
  const adv = input.advanced;
  const hasAdvanced = Object.values(adv).some((v) => v && v.trim());
  if (hasAdvanced) {
    message += `\n\n## 高级设定`;
    if (adv.appearance) message += `\n- 外貌：${adv.appearance}`;
    if (adv.identityAndExperience) message += `\n- 身份与经历：${adv.identityAndExperience}`;
    if (adv.coreDesire) message += `\n- 核心欲望：${adv.coreDesire}`;
    if (adv.coreFear) message += `\n- 核心恐惧：${adv.coreFear}`;
    if (adv.personalityTraits) message += `\n- 性格特征：${adv.personalityTraits}`;
    if (adv.values) message += `\n- 价值观：${adv.values}`;
    if (adv.relationship) message += `\n- 与用户的关系：${adv.relationship}`;
    if (adv.languageStyle) message += `\n- 语言风格：${adv.languageStyle}`;
    if (adv.behaviorBoundaries) message += `\n- 行为边界：${adv.behaviorBoundaries}`;
    if (adv.openingSituation) message += `\n- 开场情境：${adv.openingSituation}`;
    if (adv.sourceMaterial) message += `\n- 原作/设定资料：${adv.sourceMaterial}`;
  }

  message += `\n\n## 特别提醒
- 避免生成与"避免内容"冲突的任何描述。
- 如果用户身份已指定，第一条消息和示例对话应对其有所呼应（使用 {{user}} 占位符）。
- 请直接返回 JSON 对象，不要包含 markdown 代码块标记或其他文字。`;

  return message;
}
