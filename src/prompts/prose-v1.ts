import { PROSE_PROMPT_VERSION, type ProseGenerationMode, type ProseGenerationRequest } from "@/domain/prose";
import type { ProseContext } from "@/services/prose-context-builder";

const MODE_RULES: Record<ProseGenerationMode, string> = {
  full_scene: "写出完整场景初稿，覆盖目标、冲突、转折、结果与离场状态。",
  opening: "只写场景开头，建立入口状态、视角、目标和即时张力。",
  conflict: "只展开已计划的冲突，不提前解决场景结局。",
  turning_point: "只写计划中的转折，使行动方向发生可见变化。",
  ending: "只写场景结尾，落实结果、余波、离场状态和下一场连接。",
  continue: "从给定光标位置自然续写，不重复前文。",
  rewrite: "只重写给定范围，保留事实功能和范围外衔接。",
  expand: "只扩写给定范围，增加具体动作、反应或感官，但不改变事实结果。",
  compress: "只压缩给定范围，保留必要信息、人物选择和因果。",
  enhance_dialogue: "只增强给定范围的对话区分度、目的与潜台词。",
  enhance_action: "只增强给定范围的动作因果、空间清晰度与身体反应。",
  enhance_psychology: "只增强视角角色的心理变化，不进入非视角角色内心。",
  enhance_environment: "只增强与行动相关的环境和感官线索，避免静态堆砌。",
  adjust_pacing: "只调整给定范围的节奏、句段长度和信息释放顺序。",
  custom_revision: "严格执行用户的受限局部修改要求。",
};

export function buildProseSystemPrompt(mode: ProseGenerationMode): string {
  return `任务类型：正文生成\n提示词版本：${PROSE_PROMPT_VERSION}\n\n你是中文小说正文辅助写作器。${MODE_RULES[mode]}\n\n硬性规则：\n- 只输出目标正文纯文本，不输出 JSON、解释、标题、检查报告或 Markdown 围栏。\n- 遵守来源权威等级、锁定内容、Scene Plan、视角、人称、时态和语言规则。\n- 不虚构来源，不无提示改变 B1/B2 核心情节，不提前发生后续事件。\n- 区分角色知道、读者知道和作者知道；限知视角不得进入他人内心。\n- 不模仿特定在世作者，只遵循抽象 Style Profile。\n- 不生成完整章节以外的内容，不把新增关键设定写成既定事实。\n- 输出长度接近目标字数。`;
}

export function buildProseUserMessage(request: ProseGenerationRequest, context: ProseContext): string {
  const included = context.sources.filter((item) => item.included).map((item) => ({
    type: item.sourceType, id: item.sourceId, name: item.sourceName, version: item.version,
    authority: item.authority, locked: item.locked, allowModelChange: item.allowModelChange,
    field: item.field, content: item.content,
  }));
  return `生成模式：${request.settings.mode}\n目标字数：${request.settings.targetWords}\n人称：${request.settings.person}\n时态：${request.settings.tense}\n允许新增小细节：${request.settings.allowMinorDetails}\n允许轻微偏离：${request.settings.allowMinorDeviation}\n编辑范围：${JSON.stringify(request.scope)}\n用户要求：${request.instruction || "无补充要求"}\n\nCONTEXT_JSON:\n${JSON.stringify(included)}\n\n只返回该范围的目标正文。`;
}

export const buildOpeningPrompt = () => buildProseSystemPrompt("opening");
export const buildConflictPrompt = () => buildProseSystemPrompt("conflict");
export const buildTurningPointPrompt = () => buildProseSystemPrompt("turning_point");
export const buildEndingPrompt = () => buildProseSystemPrompt("ending");
export const buildContinuationPrompt = () => buildProseSystemPrompt("continue");
export const buildRewritePrompt = () => buildProseSystemPrompt("rewrite");
export const buildExpansionPrompt = () => buildProseSystemPrompt("expand");
export const buildCompressionPrompt = () => buildProseSystemPrompt("compress");
export const buildDialoguePrompt = () => buildProseSystemPrompt("enhance_dialogue");
export const buildActionPrompt = () => buildProseSystemPrompt("enhance_action");
export const buildPsychologyPrompt = () => buildProseSystemPrompt("enhance_psychology");
export const buildEnvironmentPrompt = () => buildProseSystemPrompt("enhance_environment");
export const buildPacingPrompt = () => buildProseSystemPrompt("adjust_pacing");
export const buildCustomRevisionPrompt = () => buildProseSystemPrompt("custom_revision");

/** 元数据提取是与正文调用分离的独立契约。 */
export function buildProseMetadataPrompt(kind: "coverage" | "candidate_facts" | "state_changes" | "quality"): string {
  return `任务类型：正文后处理/${kind}\n不得改写正文。只返回符合调用方 Schema 的 JSON，不输出隐藏思维过程。区分确定错误和启发式判断，来源只能引用实际提供内容。`;
}

export function buildProseRepairPrompt(error: string): string {
  return `任务类型：正文元数据 JSON 修复\n只修复 JSON 结构，不新增正文事实。校验错误：${error}`;
}
