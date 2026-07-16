import { describe, expect, it } from "vitest";
import { AnalysisContextSchema, AnalysisIssueSchema, AnalysisReportSchema, AnalysisSeveritySchema, AnalysisConfidenceSchema, PlotAnalysisProjectSchema, SourceReferenceSchema, createEmptyAnalysisProject, createEmptyBranch } from "@/domain/plot-analysis";

describe("PlotAnalysisProject Schema", () => {
  it("创建带安全默认值的分析项目", () => { const p = createEmptyAnalysisProject(); expect(PlotAnalysisProjectSchema.safeParse(p).success).toBe(true); expect(p.dataVersion).toBe(1); expect(p.reports).toEqual([]); });
  it("最多允许三个分支", () => { const p = createEmptyAnalysisProject(); const branches = [0,1,2,3].map(createEmptyBranch); expect(PlotAnalysisProjectSchema.safeParse({ ...p, input: { ...p.input, branches }, proposal: { ...p.proposal, branches } }).success).toBe(false); });
  it("原始剧情与待分析剧情分别保存", () => { const p = createEmptyAnalysisProject(); p.input.occurredPlot = "已经发生"; p.input.proposedPlot = "等待分析"; expect(p.input.occurredPlot).not.toBe(p.input.proposedPlot); });
});

describe("AnalysisReport Schema", () => {
  const minimal = () => ({ id:"r", projectId:"p", summary:{}, causality:{}, relationship:{}, continuity:{}, inputSnapshot:{}, contextSnapshot:{ tokenBudget:6000, createdAt:new Date().toISOString() }, createdAt:new Date().toISOString(), modifiedAt:new Date().toISOString() });
  it("接受完整默认化报告", () => expect(AnalysisReportSchema.safeParse(minimal()).success).toBe(true));
  it("评分必须为 0-100 的整数", () => expect(AnalysisReportSchema.safeParse({ ...minimal(), scores:[{ dimension:"continuity", score:88.5 }] }).success).toBe(false));
  it("严重程度枚举完整", () => expect(AnalysisSeveritySchema.options).toEqual(["critical","major","moderate","minor","note"]));
  it("置信度与严重程度独立", () => { expect(AnalysisConfidenceSchema.safeParse("low").success).toBe(true); expect(AnalysisIssueSchema.safeParse({ id:"i", category:"missing_evidence", severity:"critical", confidence:"low" }).success).toBe(true); });
  it("来源引用具有安全默认值", () => expect(SourceReferenceSchema.parse({ source_type:"plot_fact", source_entity_id:"p", source_name:"剧情", field_or_entry:"occurredPlot", excerpt:"文本", version:"1" }).valid).toBe(true));
  it("上下文记录 token 预算", () => expect(AnalysisContextSchema.parse({ createdAt:new Date().toISOString(), tokenBudget:800 }).tokenBudget).toBe(800));
});

