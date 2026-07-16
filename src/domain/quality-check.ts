import { z } from "zod";

// ============================================
// 质量检查 Schema
// ============================================

/** 严重程度 */
export const SeveritySchema = z.enum(["error", "warning", "info"]);
export type Severity = z.infer<typeof SeveritySchema>;

/** 质量检查结果 */
export const QualityIssueSchema = z.object({
  /** 问题名称 */
  name: z.string(),
  /** 严重程度 */
  severity: SeveritySchema,
  /** 涉及的字段 */
  fields: z.array(z.string()),
  /** 判断依据 */
  rationale: z.string(),
  /** 修改建议 */
  suggestion: z.string(),
});

export type QualityIssue = z.infer<typeof QualityIssueSchema>;

/** 质量检查报告 */
export const QualityReportSchema = z.object({
  issues: z.array(QualityIssueSchema),
  checkedAt: z.string(),
});

export type QualityReport = z.infer<typeof QualityReportSchema>;
