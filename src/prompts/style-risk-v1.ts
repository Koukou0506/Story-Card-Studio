import type { StyleRiskAnalysisRequest, StyleRiskAnalysisReport } from "@/domain/style-risk";

export const STYLE_RISK_MODEL_RULES = `任务类型：文本机械感与文风风险分析。
这不是 AI 作者身份检测，不得输出 AI 生成概率、人类创作概率、作弊判断或绕过检测建议。
只分析确定性指标无法可靠判断的过度解释、情绪推进、对话区分、空泛修辞、模板转折、冲突化解和文风偏离。
只引用提供的文本；每个问题给出短摘录，不输出隐藏思维过程，不直接修改原文。只返回 JSON。`;

export function buildStyleRiskModelPrompt(request: StyleRiskAnalysisRequest, report: StyleRiskAnalysisReport): { systemPrompt: string; userMessage: string } {
  return {
    systemPrompt: STYLE_RISK_MODEL_RULES,
    userMessage: `分析范围：${request.scopeType}\n基准：${report.baselines.map((item) => item.name).join("、")}\n确定性指标：${JSON.stringify(report.dimensionRisks)}\nTEXT_START\n${request.text}\nTEXT_END\n返回 {"issues":[{"category":"over_explanation","title":"...","severity":"moderate","confidence":"medium","excerpt":"原文中的唯一短摘录","conclusion":"...","evidence":["..."],"explanation":"简洁依据","minimumRevision":"...","alternatives":[],"possibleSideEffects":[]}]}。`,
  };
}

export const buildStyleRiskRepairPrompt = () => `${STYLE_RISK_MODEL_RULES}\n修复上一次 JSON，使其符合给定结构；不得新增不存在的原文摘录。`;
