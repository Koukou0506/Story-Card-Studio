import { CONTINUITY_PROMPT_VERSION } from "@/domain/continuity";

export type ContinuityPromptMode = "chapter_summary" | "scene_summary" | "canon_extraction" | "state_extraction" | "plot_thread_extraction" | "foreshadow_detection" | "plan_manuscript_drift" | "project_continuity" | "project_health" | "next_chapter_context" | "json_repair";

const MODE_RULES: Record<ContinuityPromptMode, string> = {
  chapter_summary: "概括章节事件、选择、状态、信息、剧情线、伏笔和结束状态。",
  scene_summary: "概括场景事件、选择、状态、信息、剧情线、伏笔和结束状态。",
  canon_extraction: "只提取候选 Canon；状态必须为 candidate，禁止自动确认。",
  state_extraction: "提取人物、关系、世界与知情状态候选，注明是否已确认。",
  plot_thread_extraction: "识别候选剧情线及其推进事件，不擅自标记解决。",
  foreshadow_detection: "识别设置、强化、误导、计划回收和实际回收；不自动创建 Retcon。",
  plan_manuscript_drift: "比较规划与采用正文，区分遗漏、新增、变化和有意偏差。",
  project_continuity: "检查跨章节 Canon、状态、知情、时间、剧情线、伏笔和来源版本。",
  project_health: "总结项目健康指标和优先级，不改写任何项目数据。",
  next_chapter_context: "构建限定范围的下一章继承上下文，不生成正文。",
  json_repair: "只修复给定 JSON 使其符合目标 Schema，不新增事实。",
};

export function buildContinuitySystemPrompt(mode: ContinuityPromptMode): string {
  return `任务类型：长篇连续性管理\n提示词版本：${CONTINUITY_PROMPT_VERSION}\n模式：${mode}\n${MODE_RULES[mode]}\n\n硬性规则：\n1. 只引用输入中真实存在且带 ID 的来源，不虚构实体、章节或条目。\n2. 明确区分已确认事实、用户假设、模型推断和建议。\n3. 模型提取的事实只能是 candidate，不得自动确认 Canon。\n4. 不自动创建 Retcon，不修改正文，不修改规划，不覆盖锁定内容。\n5. 信息不足时明确标注低置信度，不把推断写成事实。\n6. 只输出符合调用方 Schema 的 JSON；不要输出隐藏思维过程，只保留简短判断依据。`;
}

export function buildContinuityUserMessage(mode: ContinuityPromptMode, context: unknown, schemaDescription: string): string {
  return `模式：${mode}\n目标 Schema：\n${schemaDescription}\n\n限定上下文：\n${JSON.stringify(context, null, 2)}`;
}

export function buildContinuityRepairPrompt(schemaDescription: string, invalid: string, errors: string): { systemPrompt: string; userMessage: string } {
  return { systemPrompt: buildContinuitySystemPrompt("json_repair"), userMessage: `目标 Schema：${schemaDescription}\n校验错误：${errors}\n待修复 JSON：\n${invalid}` };
}
