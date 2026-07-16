import { describe, expect, it } from "vitest";
import { createEmptyAnalysisProject } from "@/domain/plot-analysis";
import { createEmptyCharacterCard } from "@/domain/character-card";
import { createEmptyLorebook, createEmptyLorebookEntry } from "@/domain/lorebook";
import { buildAnalysisContext } from "@/services/analysis-context-builder";
import { validateSourceReference, validateReportReferences } from "@/services/analysis-references";
import { AnalysisReportSchema } from "@/domain/plot-analysis";

function fixture() { const p=createEmptyAnalysisProject(); p.input.proposedPlot="柳如烟前往临水镇寻找古玉"; p.input.occurredPlot="柳如烟得到线索"; p.input.immutableSettings="古玉不能被摧毁"; p.selectedCharacterIds=["柳如烟"];
  const card=createEmptyCharacterCard(); card.data.name="柳如烟"; card.data.description="江南才女"; card.data.personality="谨慎";
  const book=createEmptyLorebook("江南"); const relevant=createEmptyLorebookEntry(); relevant.name="临水镇"; relevant.content="临水镇有古玉线索"; relevant.activation.primaryKeys=["临水镇"]; const unrelated=createEmptyLorebookEntry(); unrelated.name="北海"; unrelated.content="北海冰原"; unrelated.activation.primaryKeys=["北海"]; book.entries=[relevant,unrelated]; p.selectedLorebookIds=[book.id]; return {p,card,book,relevant,unrelated}; }

describe("Analysis Context Builder", () => {
  it("按权威等级标记事实和假设", () => { const {p,card,book}=fixture(); const c=buildAnalysisContext({project:p,characterCard:card,lorebooks:[book]}); expect(c.sources.find(s=>s.field==="immutableSettings")?.authority).toBe(1); expect(c.sources.find(s=>s.field==="proposedPlot")?.classification).toBe("user_assumption"); });
  it("只自动包含相关世界书条目", () => { const {p,card,book,relevant,unrelated}=fixture(); const c=buildAnalysisContext({project:p,characterCard:card,lorebooks:[book]}); expect(c.sources.find(s=>s.entityId===relevant.id)?.included).toBe(true); expect(c.sources.find(s=>s.entityId===unrelated.id)?.included).toBe(false); });
  it("手动包含覆盖相关性筛选", () => { const {p,card,book,unrelated}=fixture(); p.manualIncludedEntryIds=[unrelated.id]; const c=buildAnalysisContext({project:p,characterCard:card,lorebooks:[book]}); expect(c.sources.find(s=>s.entityId===unrelated.id)?.included).toBe(true); });
  it("手动排除优先于自动相关", () => { const {p,card,book,relevant}=fixture(); p.manualExcludedEntryIds=[relevant.id]; const c=buildAnalysisContext({project:p,characterCard:card,lorebooks:[book]}); expect(c.sources.find(s=>s.entityId===relevant.id)?.included).toBe(false); });
  it("预算不足时按优先级裁剪", () => { const {p,card,book}=fixture(); p.tokenBudget=256; p.input.occurredPlot="已发生".repeat(300); const c=buildAnalysisContext({project:p,characterCard:card,lorebooks:[book]}); expect(c.truncated).toBe(true); expect(c.estimatedTokens).toBeLessThanOrEqual(256); });
});

describe("来源引用校验", () => {
  it("有效引用必须匹配类型、实体、字段和版本", () => { const {p,card,book}=fixture(); const c=buildAnalysisContext({project:p,characterCard:card,lorebooks:[book]}); const s=c.sources.find(x=>x.included)!; expect(validateSourceReference({source_type:s.type,source_entity_id:s.entityId,source_name:s.name,field_or_entry:s.field,excerpt:s.content,version:s.version,valid:true,inference:false,confidence:"high"},c).valid).toBe(true); });
  it("不存在的引用被标记无效", () => { const {p,card,book}=fixture(); const c=buildAnalysisContext({project:p,characterCard:card,lorebooks:[book]}); expect(validateSourceReference({source_type:"lorebook",source_entity_id:"missing",source_name:"虚构",field_or_entry:"content",excerpt:"不存在",version:"1",valid:true,inference:true,confidence:"low"},c).valid).toBe(false); });
  it("报告收集无效引用警告", () => { const {p,card,book}=fixture(); const c=buildAnalysisContext({project:p,characterCard:card,lorebooks:[book]}); const now=new Date().toISOString(); const r=AnalysisReportSchema.parse({id:"r",projectId:p.id,summary:{},causality:{},relationship:{},continuity:{},inputSnapshot:p.input,contextSnapshot:c,createdAt:now,modifiedAt:now,referencedSources:[{source_type:"lorebook",source_entity_id:"none",source_name:"假",field_or_entry:"content",excerpt:"",version:"1"}]}); expect(validateReportReferences(r,c).invalidReferenceWarnings.length).toBe(1); });
});

