import { describe, expect, it } from "vitest";
import { createEmptyAnalysisProject, createEmptyBranch } from "@/domain/plot-analysis";
import { createEmptyCharacterCard } from "@/domain/character-card";
import { createEmptyLorebook, createEmptyLorebookEntry } from "@/domain/lorebook";
import { MockProvider } from "@/providers/mock";
import { generatePlotAnalysis } from "@/services/analysis-generator";
import { exportAnalysisJSON, importAnalysisJSON, exportAnalysisMarkdown } from "@/services/analysis-export";
import { createEmptyProjectDraft, migrateProjectDraft, PROJECT_DATA_VERSION } from "@/domain/project-draft";

async function flow(branches=0){const p=createEmptyAnalysisProject();p.input.title="古玉抉择";p.input.occurredPlot="柳如烟发现古玉线索";p.input.proposedPlot="柳如烟没有理由却突然决定独自调查";p.input.characterKnowledge="知道线索";p.input.characterEmotions="犹豫";p.input.relationshipState="初步信任";p.input.branches=Array.from({length:branches},(_,i)=>({...createEmptyBranch(i),description:`方案${i+1}`}));const card=createEmptyCharacterCard();card.data.name="柳如烟";p.selectedCharacterIds=["柳如烟"];return generatePlotAnalysis(p,card,[],{provider:new MockProvider(),model:"mock-model",timeoutMs:3000,maxRetries:1});}
describe("分析导出与完整流程",()=>{
  it("Mock 完成单方案并区分事实推断建议",async()=>{const {report}=await flow();expect(report.issues.some(i=>i.category==="motivation_gap")).toBe(true);expect(report.suggestions.every(s=>s.classification==="model_suggestion")).toBe(true);expect(report.referencedSources.some(r=>r.valid)).toBe(true);});
  it("Mock 完成两个分支比较",async()=>{const {report}=await flow(2);expect(report.branchComparison?.branches).toHaveLength(2);expect(report.branchComparison?.bestCharacterFitBranchId).toBeTruthy();expect(report.branchComparison?.strongestDramaBranchId).toBeTruthy();});
  it("评分均为整数且包含八维",async()=>{const {report}=await flow();expect(report.scores).toHaveLength(8);expect(report.scores.every(s=>Number.isInteger(s.score))).toBe(true);});
  it("Markdown 包含问题、评分和引用",async()=>{const md=exportAnalysisMarkdown((await flow()).report);expect(md).toContain("## 维度评分");expect(md).toContain("## 问题");expect(md).toContain("## 引用资料");});
  it("JSON round-trip",async()=>{const report=(await flow()).report;expect(importAnalysisJSON(exportAnalysisJSON(report))).toEqual(report);});
  it("A2 v2 草稿迁移保留世界书",()=>{const d=createEmptyProjectDraft();const b=createEmptyLorebook();const raw={...d,dataVersion:2,lorebooks:[b]};delete (raw as Record<string,unknown>).analysisProjects;const migrated=migrateProjectDraft(raw);expect(migrated.dataVersion).toBe(PROJECT_DATA_VERSION);expect(migrated.lorebooks[0].id).toBe(b.id);expect(migrated.analysisProjects).toEqual([]);});
  it("端到端：输入→上下文→Mock→校验→导出",async()=>{const {report,context}=await flow(2);expect(context.selectedSourceIds.length).toBeGreaterThan(0);expect(importAnalysisJSON(exportAnalysisJSON(report)).status).toBe("draft");});
});

