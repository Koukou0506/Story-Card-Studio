import { describe, expect, it } from "vitest";
import { createEmptyAnalysisProject } from "@/domain/plot-analysis";
import { createEmptyCharacterCard } from "@/domain/character-card";
import { createEmptyLorebook, createEmptyLorebookEntry } from "@/domain/lorebook";
import { buildAnalysisContext } from "@/services/analysis-context-builder";
import { detectAnalysisIssues } from "@/services/analysis-rules";

function codes(text:string, configure?:(p:ReturnType<typeof createEmptyAnalysisProject>,b:ReturnType<typeof createEmptyLorebook>)=>void){const p=createEmptyAnalysisProject();p.input.proposedPlot=text;p.input.characterKnowledge="已知线索";p.input.characterEmotions="紧张";p.input.relationshipState="陌生";const b=createEmptyLorebook();configure?.(p,b);const c=buildAnalysisContext({project:p,characterCard:createEmptyCharacterCard(),lorebooks:[b]});return detectAnalysisIssues(p,c);}
describe("确定性分析规则",()=>{
  it("检测因果缺口",()=>expect(codes("他突然直接导致胜利").some(i=>i.category==="causal_gap")).toBe(true));
  it("检测人物动机缺口",()=>expect(codes("她没有理由却不顾一切行动").some(i=>i.category==="motivation_gap")).toBe(true));
  it("检测信息越权",()=>expect(codes("他莫名知道作者才知道的秘密").some(i=>i.category==="information_violation")).toBe(true));
  it("检测能力资源不足",()=>expect(codes("不会武功却徒手击败军队").some(i=>i.category==="capability_violation")).toBe(true));
  it("检测连续性冲突并标 critical",()=>{const i=codes("她同一时刻同时出现在两地").find(x=>x.category==="continuity_error");expect(i?.severity).toBe("critical");expect(i?.confidence).toBe("high");});
  it("检测关系跳跃",()=>expect(codes("两人初见后立刻相爱").some(i=>i.category==="relationship_jump")).toBe(true));
  it("检测世界规则冲突",()=>{const issues=codes("她用手机联系同伴",(p,b)=>{const e=createEmptyLorebookEntry();e.name="技术规则";e.content="这个世界不出现手机";e.activation.primaryKeys=["手机"];b.entries=[e];p.selectedLorebookIds=[b.id];});expect(issues.some(i=>i.category==="world_rule_violation"&&i.is_hard_contradiction)).toBe(true);});
  it("信息不足使用低置信度",()=>{const p=createEmptyAnalysisProject();p.input.proposedPlot="角色去旅行";const c=buildAnalysisContext({project:p,characterCard:createEmptyCharacterCard(),lorebooks:[]});expect(detectAnalysisIssues(p,c).find(i=>i.category==="missing_evidence")?.confidence).toBe("low");});
});

