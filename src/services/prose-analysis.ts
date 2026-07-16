import {
  CandidateFactSchema, CandidateStateChangeSchema, PlanCoverageItemSchema, proseBase,
  type CandidateFact, type CandidateStateChange, type PlanCoverageItem,
} from "@/domain/prose";
import type { ScenePlanVersion } from "@/domain/chapter-planning";
import type { ProseContext } from "./prose-context-builder";

const compact = (value: string) => value.replace(/\s/g, "");
const tokens = (value: string) => [...new Set(value.match(/[\p{L}\p{N}]{2,}/gu) ?? [])];
const range = (text: string, needle: string) => {
  const start = needle ? text.indexOf(needle) : -1;
  return start < 0 ? [] : [{ start, end: start + needle.length, excerpt: needle.slice(0, 160) }];
};

function semanticStatus(text: string, planText: string, cues: RegExp[]): { status: PlanCoverageItem["status"]; excerpt: string; rationale: string } {
  if (!planText.trim()) return { status: "intentionally_omitted", excerpt: "", rationale: "场景计划未要求该项。" };
  const meaningful = tokens(planText).filter((item) => item.length >= 2);
  const matched = meaningful.filter((item) => text.includes(item));
  const cue = cues.map((item) => text.match(item)?.[0]).find(Boolean) ?? "";
  const ratio = meaningful.length ? matched.length / meaningful.length : 0;
  const contradicted = matched.find((item) => { const index = text.indexOf(item); return index >= 0 && /没有|并未|未能|拒绝/.test(text.slice(Math.max(0, index - 8), index)); });
  if (contradicted) return { status: "contradicted", excerpt: contradicted, rationale: "计划语义要素在正文中被明确否定，需人工确认是否有意偏离。" };
  if (matched.length && matched.reduce((count, item) => count + text.split(item).length - 1, 0) > 10) return { status: "overexpanded", excerpt: matched[0], rationale: "该计划要素占用篇幅异常，可能挤压其他场景功能。" };
  if (ratio >= 0.6 || (ratio >= 0.25 && cue)) return { status: "covered", excerpt: matched[0] || cue, rationale: "正文同时出现计划语义要素与相应叙事功能。" };
  if (ratio > 0 || cue) return { status: "partial", excerpt: matched[0] || cue, rationale: "正文出现相关线索，但计划功能尚未完整落地。" };
  return { status: "missing", excerpt: "", rationale: "未发现足够的语义要素或相应叙事功能。" };
}

export function analyzeScenePlanCoverage(sceneDraftId: string, text: string, plan: ScenePlanVersion): PlanCoverageItem[] {
  const definitions: Array<[PlanCoverageItem["element"], string, RegExp[]]> = [
    ["goal", plan.sceneGoal, [/试图|决定|必须|目标|想要|想|希望/]],
    ["conflict", `${plan.opposingForce} ${plan.conflictType}`, [/但|却|阻止|拒绝|冲突|逼近/]],
    ["action", `${plan.trigger} ${plan.action}`, [/于是|随即|伸手|转身|追|问|打开|走/]],
    ["turning_point", plan.turningPoint, [/忽然|没想到|真相|原来|反而|就在这时/]],
    ["result", plan.result, [/最终|终于|因此|结果|离开|答应|失败/]],
    ["exit_state", JSON.stringify(plan.exitState), [/沉默|受伤|离开|留下|握住|放下/]],
    ["information_change", plan.informationChanges.join(" "), [/得知|发现|意识到|揭开|秘密|线索/]],
    ["relationship_change", plan.relationshipChanges.join(" "), [/信任|怀疑|疏远|靠近|原谅|背叛/]],
    ["foreshadow", plan.foreshadowSetupIds.join(" "), [/痕迹|暗示|不经意|异样|留下/]],
    ["payoff", plan.foreshadowPayoffIds.join(" "), [/应验|回想|正是|终于明白|揭晓/]],
  ];
  return definitions.map(([element, planText, cues]) => {
    const result = semanticStatus(compact(text), compact(planText), cues);
    return PlanCoverageItemSchema.parse({
      ...proseBase("coverage"), sceneDraftId, element,
      label: planText.slice(0, 120), status: result.status,
      textRanges: range(text, result.excerpt), rationale: result.rationale, heuristic: true,
    });
  });
}

const FACT_PATTERNS: Array<[CandidateFact["factType"], RegExp]> = [
  ["location", /([^。！？\n]{2,20})(?:位于|坐落在|距离)([^。！？\n]{2,40})/g],
  ["location", /([^。！？\n]{2,20})(?:藏着一间|建有一座|通往)([^。！？\n]{2,40})/g],
  ["character", /([^。！？\n]{2,12})(?:是|名叫|年约)([^。！？\n]{2,40})/g],
  ["item", /([^。！？\n]{2,12})(?:持有|得到|藏着|戴着)([^。！？\n]{2,30})/g],
  ["ability", /([^。！？\n]{2,12})(?:能够|会|擅长)([^。！？\n]{2,35})/g],
  ["relationship", /([^。！？\n]{2,12})(?:信任|爱着|憎恨|是.+的)([^。！？\n]{2,35})/g],
  ["body_state", /([^。！？\n]{2,12})(?:受伤|中毒|失明|发烧)([^。！？\n]{0,25})/g],
  ["secret", /(?:秘密是|无人知道|一直隐瞒)([^。！？\n]{2,60})/g],
  ["time", /(?:第[一二三四五六七八九十\d]+天|\d{1,2}月\d{1,2}日|三年前|十年前)[^。！？\n]{0,50}/g],
  ["world_rule", /(?:任何人都不能|这个世界|规则是|从来不会)[^。！？\n]{2,70}/g],
  ["organization", /([^。！？\n]{2,16})(?:商会|组织|帮派|衙门|书院)(?:控制|负责|隶属|掌管)[^。！？\n]{2,45}/g],
  ["history", /(?:曾经|多年前|昔日|当年)[^。！？\n]{3,70}/g],
];

export function extractCandidateFacts(sceneDraftId: string, versionId: string, text: string, context: ProseContext): CandidateFact[] {
  const known = context.sources.filter((item) => item.included).map((item) => item.content).join("\n");
  const results: CandidateFact[] = [];
  const seen = new Set<string>();
  for (const [factType, pattern] of FACT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const content = match[0].trim();
      if (content.length < 4 || seen.has(content)) continue;
      seen.add(content);
      const start = match.index ?? 0;
      const alreadyExists = known.includes(content) || tokens(content).filter((item) => item.length > 2).some((item) => known.includes(item));
      results.push(CandidateFactSchema.parse({
        ...proseBase("candidate_fact"), status: "generated", sceneDraftId, versionId, content, factType,
        textRange: { start, end: start + content.length, excerpt: content }, alreadyExists,
        possibleSourceIds: context.sources.filter((item) => item.content.includes(content)).map((item) => item.sourceId),
        importance: ["world_rule", "secret", "relationship"].includes(factType) ? "high" : "medium",
        conflictStatus: "none", recommendation: alreadyExists ? "ignore" : factType === "character" ? "add_character_note" : factType === "time" ? "add_timeline_candidate" : "review",
      }));
    }
  }
  return results;
}

const STATE_PATTERNS: Array<[CandidateStateChange["changeType"], RegExp]> = [
  ["character", /([^。！？\n]{2,12})(?:从|由)([^。！？\n]{1,20})(?:变得|变为|转为)([^。！？\n]{2,30})/g],
  ["relationship", /([^。！？\n]{2,30})(?:不再怀疑|开始信任|关系破裂|互相敌视|和解)[^。！？\n]*/g],
  ["information", /([^。！？\n]{2,12})(?:得知|发现|意识到)([^。！？\n]{2,50})/g],
  ["item", /([^。！？\n]{2,12})(?:拿起|放下|交给|失去|得到)([^。！？\n]{2,30})/g],
  ["world", /(?:城门关闭|组织解散|规则改变|封印解除)[^。！？\n]*/g],
];

export function extractCandidateStateChanges(sceneDraftId: string, versionId: string, text: string, plan: ScenePlanVersion): CandidateStateChange[] {
  const results: CandidateStateChange[] = [];
  const exitText = JSON.stringify(plan.exitState);
  for (const [changeType, pattern] of STATE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const trigger = match[0].trim(); const start = match.index ?? 0;
      const after = match[3] || match[2] || trigger;
      const entity = match[1] && match[1].length <= 30 ? match[1].trim() : "";
      const matches = tokens(after).some((item) => exitText.includes(item));
      results.push(CandidateStateChangeSchema.parse({
        ...proseBase("candidate_state"), status: "generated", sceneDraftId, versionId, changeType,
        entityIds: entity ? [entity] : [], before: match[2] && match[3] ? match[2] : "未明确",
        after, triggerText: trigger, textRange: { start, end: start + trigger.length, excerpt: trigger },
        confidence: match[3] ? "high" : "medium", matchesSceneExitState: matches,
        conflictDescription: matches ? "" : "正文变化未能在 Scene Exit State 中找到明确对应，需用户确认。",
      }));
    }
  }
  return results;
}
