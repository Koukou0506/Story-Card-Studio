import type { AnalysisContext, PlotAnalysisProject } from "@/domain/plot-analysis";
export const ANALYSIS_PROMPT_VERSION = "analysis-v1.0.0";

const RULES = `只引用 CONTEXT_JSON 中实际存在的来源；区分 confirmed_fact/source_setting/user_assumption/model_inference/model_suggestion/unknown。不得虚构角色卡字段或世界书条目，不输出隐藏思维过程，只给简洁 reasoning_summary。信息不足必须标记。区分逻辑错误与审美偏好，区分人物“不常做”和“绝不可能做”。考虑当前情绪、关系阶段、信息、能力、资源与机会。优先给最小修改方案并说明副作用。返回严格 JSON。`;

export function buildSingleProposalAnalysisPrompt() { return `任务类型：剧情分析；执行单方案综合分析。${RULES}`; }
export function buildCharacterFitAnalysisPrompt() { return `任务类型：剧情分析；重点执行人物契合度分析。逐角色检查目标、价值观、恐惧、情绪、关系、知识、收益、代价、压力和偏离常态所需触发。${RULES}`; }
export function buildBranchComparisonPrompt() { return `任务类型：剧情分析；比较最多三个分支。分别说明人物契合、戏剧性、修改成本和后续限制，不得只给“最佳分支”。${RULES}`; }
export function buildJSONRepairPrompt(error: string) { return `上次 JSON 不符合 AnalysisReport Schema：${error}。仅修复格式和缺失字段，不改变结论，不新增来源，只返回完整 JSON。`; }

export function buildAnalysisUserMessage(project: PlotAnalysisProject, context: AnalysisContext): string {
  return `ANALYSIS_PROJECT_ID:${project.id}\n分析输入：${JSON.stringify(project.input)}\nCONTEXT_JSON:${JSON.stringify(context.sources.filter(source => source.included))}\n请输出 AnalysisReport 的分析主体字段：summary、scores、issues、characterFits、causality、relationship、continuity、branchComparison、suggestions、informationGaps、referencedSources。`;
}

