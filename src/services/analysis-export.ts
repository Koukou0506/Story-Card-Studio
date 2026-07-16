import type { AnalysisReport } from "@/domain/plot-analysis";
import { AnalysisReportSchema } from "@/domain/plot-analysis";
import { sanitizeFilename } from "./import-export";

export function exportAnalysisJSON(report: AnalysisReport): string { return JSON.stringify(AnalysisReportSchema.parse(report), null, 2); }
export function importAnalysisJSON(text: string): AnalysisReport { try { return AnalysisReportSchema.parse(JSON.parse(text)); } catch (error) { throw new Error(`分析报告 JSON 校验失败：${(error as Error).message}`); } }
export function exportAnalysisMarkdown(report: AnalysisReport): string {
  const lines = [`# ${report.inputSnapshot.title}`, "", `> ${report.summary.oneLineConclusion}`, "", `- 可行性：${report.summary.feasibility}`, `- Provider / 模型：${report.provider} / ${report.model}`, `- 提示词版本：${report.promptVersion}`, `- 评分规则：${report.scoringVersion}`, "", "## 维度评分", ""];
  report.scores.forEach(score => lines.push(`- ${score.dimension}：${score.score}/100 — ${score.rationale}`));
  lines.push("", "## 问题", ""); report.issues.forEach(issue => { lines.push(`### [${issue.severity}/${issue.confidence}] ${issue.title}`, "", issue.conclusion, "", `- 最小修改：${issue.minimum_revision}`, `- 副作用：${issue.side_effects.join("；") || "无"}`, `- 来源：${issue.source_references.filter(ref => ref.valid).map(ref => `${ref.source_name}/${ref.field_or_entry}`).join("；") || "无有效引用"}`, ""); });
  lines.push("## 人物契合度", ""); report.characterFits.forEach(item => lines.push(`- ${item.character}：${item.score}/100 — ${item.fitConclusion}`));
  lines.push("", "## 因果链", "", report.causality.conclusion, "", "## 情感与关系", "", report.relationship.missingSetup || "未发现主要关系铺垫缺口。", "", "## 世界观与连续性", "", report.continuity.conclusion);
  if (report.branchComparison) { lines.push("", "## 分支比较", ""); report.branchComparison.branches.forEach(branch => lines.push(`- ${branch.branchName}（#${branch.rank}）：${branch.oneLineConclusion}`)); lines.push("", report.branchComparison.recommendationSummary); }
  lines.push("", "## 信息缺口", "", ...report.informationGaps.map(item => `- ${item}`), "", "## 引用资料", "", ...report.referencedSources.map(ref => `- ${ref.valid ? "有效" : "无效"}｜${ref.source_name}｜${ref.field_or_entry}｜${ref.excerpt}`));
  return lines.join("\n");
}
export function analysisFilename(report: AnalysisReport, extension: "md" | "json") { return `${sanitizeFilename(report.inputSnapshot.title || "plot_analysis")}.${extension}`; }
export function downloadText(content: string, filename: string, type: string) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }

