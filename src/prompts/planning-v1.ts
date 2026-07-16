import type { PlanningContext } from "@/services/planning-context-builder";
import type { StoryPlan } from "@/domain/story-planning";

export const PLANNING_PROMPT_VERSION = "planning-v1.0.0";
const RULES = `遵守来源权威层级；保留所有 locked 内容；区分确认事实、推断和建议；不虚构来源；不大段重复角色卡或世界书；让角色变化绑定具体事件；让重大结果具有前置原因；让关系变化具有触发和余波；将新增关键设定标记为 newSettingMarked；不生成逐章大纲、场景卡或正文；只返回符合 OutlineVariant Schema 的 JSON。`;

export const buildStoryBiblePrompt = () => `任务类型：小说规划；生成故事圣经。${RULES}`;
export const buildCharacterPlanningPrompt = () => `任务类型：小说规划；生成角色规划和角色弧。${RULES}`;
export const buildRelationshipPlanningPrompt = () => `任务类型：小说规划；生成关系发展路线。${RULES}`;
export const buildPlotOutlinePrompt = () => `任务类型：小说规划；生成八到十二个宏观情节节点和因果依赖。${RULES}`;
export const buildTimelinePrompt = () => `任务类型：小说规划；构建简单事件时间线和状态变化。未知时间不得编造精确日期。${RULES}`;
export const buildAlternativeVariantPrompt = () => `任务类型：小说规划；生成替代大纲版本，保留旧版本并说明差异。${RULES}`;
export const buildPlanningCompletionPrompt = () => `任务类型：小说规划；只补全缺失模块或节点，不覆盖未选择模块。${RULES}`;
export const buildPlanningJSONRepairPrompt = (error: string) => `修复 JSON Schema 错误：${error}。不改变结论，不修改锁定内容，不新增虚构来源，只返回完整 JSON。`;

export function buildPlanningUserMessage(plan: StoryPlan, context: PlanningContext, mode: string) {
  return `生成模式：${mode}\n原始创意：${plan.originalIdea}\n生成目标：${plan.generationGoal}\n所选角色卡：${plan.selectedCharacterIds.join(", ")}\nCONTEXT_JSON:${JSON.stringify(context.sources.filter((source) => source.included))}\n返回结构化 OutlineVariant JSON。`;
}
