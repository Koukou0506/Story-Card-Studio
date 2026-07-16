import { createStableId } from "@/domain/lorebook";
import type { AnalysisContext, AnalysisIssue, PlotAnalysisProject, SourceReference } from "@/domain/plot-analysis";

function reference(context: AnalysisContext, preferredId = "plot:proposedPlot"): SourceReference[] {
  const source = context.sources.find(item => item.included && item.id === preferredId) || context.sources.find(item => item.included);
  return source ? [{ source_type: source.type, source_entity_id: source.entityId, source_name: source.name, field_or_entry: source.field,
    excerpt: source.content.slice(0, 120), version: source.version, valid: true, inference: false, confidence: "high" }] : [];
}

function issue(context: AnalysisContext, category: AnalysisIssue["category"], title: string, severity: AnalysisIssue["severity"], confidence: AnalysisIssue["confidence"], conclusion: string, minimum: string, missing: string[] = []): AnalysisIssue {
  return { id: createStableId("issue"), category, title, severity, confidence, characters: [], plot_nodes: ["待分析剧情"], conclusion,
    evidence: reference(context).map(item => item.excerpt), reasoning_summary: "基于用户剧情输入与已选项目资料的可审查规则检查。", missing_information: missing,
    impact: severity === "critical" || severity === "major" ? "会显著削弱剧情成立条件或人物可信度。" : "可能影响铺垫充分性和读者理解。",
    minimum_revision: minimum, alternatives: [], side_effects: ["补充铺垫可能增加篇幅或降低推进速度。"], source_references: reference(context), is_hard_contradiction: category === "hard_contradiction" || category === "world_rule_violation" };
}

export function detectAnalysisIssues(project: PlotAnalysisProject, context: AnalysisContext): AnalysisIssue[] {
  const text = project.input.proposedPlot; const issues: AnalysisIssue[] = [];
  if (/突然|毫无原因|直接导致|凭巧合|恰好/.test(text)) issues.push(issue(context, "causal_gap", "因果链存在跳步", "moderate", "medium", "关键结果依赖突然发生或未说明的中间步骤。", "补充一个明确触发事件和一项可观察的中间行动。"));
  if (/无缘无故|没有理由|突然决定|不顾一切/.test(text)) issues.push(issue(context, "motivation_gap", "人物动机强度不足", "major", "high", "行为强度高于当前文本提供的动机与压力。", "增加直接利益、损失威胁或关系触发，不必改变最终结果。"));
  if (/莫名知道|作者才知道|从未得知|秘密却知道/.test(text)) issues.push(issue(context, "information_violation", "人物获得了作者视角信息", "major", "high", "人物使用了没有合理来源的信息。", "在行动前增加可信的信息获取渠道，或让人物基于不完整信息行动。"));
  if (/不会.+却|没有能力.+却|徒手击败|瞬间到达|无限资源/.test(text)) issues.push(issue(context, "capability_violation", "能力或资源条件不足", "major", "medium", "当前能力、时间或资源不足以完成所述行动。", "增加工具、协作者、准备时间或相应代价。"));
  if (/同时出现在|同一时刻.+两地|重伤.+立刻|死亡.+出现/.test(text)) issues.push(issue(context, "continuity_error", "时间、地点或状态连续性冲突", "critical", "high", "同一角色的时空或身体状态无法连续成立。", "调整事件顺序、路程或恢复时间。"));
  if (/立刻相爱|马上原谅|突然信任|初见.+结婚|背叛后.+立刻和好/.test(text)) issues.push(issue(context, "relationship_jump", "关系推进缺少铺垫", "major", "high", "关系变化幅度超过当前阶段提供的情感累积。", "保留目标关系，但增加一次互相承担风险的事件和情绪余波。"));
  const phoneRule = context.sources.find(source => source.included && source.type === "lorebook" && /不出现手机|禁止.+手机|没有手机/.test(source.content));
  if (phoneRule && /手机|微信|互联网/.test(text)) {
    const found = issue(context, "world_rule_violation", "待分析剧情违反世界规则", "critical", "high", "剧情引入了世界书明确排除的现代技术。", "改用符合时代的通信工具，或先正式修改世界规则。", []);
    found.source_references.push(...reference(context, phoneRule.id)); found.evidence.push(phoneRule.content.slice(0, 120)); issues.push(found);
  }
  if (!project.input.characterKnowledge.trim() || !project.input.characterEmotions.trim() || !project.input.relationshipState.trim()) issues.push(issue(context, "missing_evidence", "人物当前状态信息不足", "note", "low", "缺少人物知识、情绪或关系状态，人物契合度只能给出低置信度判断。", "补充行动发生前的人物知识、情绪和关系阶段。", ["人物当前知识", "人物当前情绪", "当前关系阶段"]));
  return issues;
}

