import { StoryPlanSchema, type OutlineVariant, type StoryPlan } from "@/domain/story-planning";
import { sanitizeFilename } from "./import-export";

export const exportPlanningJSON = (plan: StoryPlan) => JSON.stringify(StoryPlanSchema.parse(plan), null, 2);

export function importPlanningJSON(serialized: string) {
  try {
    return StoryPlanSchema.parse(JSON.parse(serialized));
  } catch (error) {
    throw new Error(`小说规划 JSON 校验失败：${(error as Error).message}`);
  }
}

export function exportPlanningMarkdown(plan: StoryPlan, variant: OutlineVariant, issues = variant.issues) {
  const bible = variant.storyBible;
  const lines = [
    `# ${plan.name} — ${variant.name}`,
    "",
    "## 故事圣经",
    "",
    `- 一句话故事：${bible.logline}`,
    `- 类型：${bible.genre.join("、")}`,
    `- 基调：${bible.tone.join("、")}`,
    `- 主题：${bible.themes.join("、")}`,
    `- 核心命题：${bible.corePremise}`,
    `- 叙事视角：${bible.narrativePerspective}`,
    `- 时间范围：${bible.timeRange}`,
    `- 主要地点：${bible.mainLocations.join("、")}`,
    `- 世界规则：${bible.worldRulesSummary}`,
    `- 核心冲突：${bible.coreConflict}`,
    `- 主角目标：${bible.protagonistGoal}`,
    `- 对抗力量：${bible.opposingForces.join("、")}`,
    `- 风险与代价：${bible.stakes} / ${bible.costs}`,
    `- 结局方向：${bible.endingDirection}`,
    "",
    bible.synopsis,
    "",
    "### 不可修改条件",
    ...bible.immutableConditions.map((item) => `- ${item}`),
    "",
    "### 创作约束",
    ...bible.constraints.map((constraint) => `- [${constraint.type}${constraint.locked ? " / locked" : ""}] ${constraint.content}`),
    "",
    "## 角色规划",
    "",
  ];
  for (const character of variant.characterPlans) {
    lines.push(`### ${character.characterName}`, `- 功能：${character.storyFunction}`, `- 初始状态：${character.initialState}`, `- 外在目标：${character.externalGoal}`, `- 内在需求：${character.internalNeed}`, `- 欲望/恐惧：${character.desire} / ${character.fear}`, `- 优势：${character.strengths.join("、")}`, `- 弱点：${character.weaknesses.join("、")}`, `- 关键选择：${character.keyChoices.join("；")}`, `- 转变：${character.transformation}`, `- 结局状态：${character.endingState}`, "");
  }
  lines.push("## 角色弧", "");
  for (const arc of variant.characterArcs) lines.push(`- ${arc.characterPlanId}：${arc.type}；${arc.initialState} → ${arc.endingState}；触发节点：${arc.incitingEventBeatId}；最终选择：${arc.finalChoiceBeatId}`);
  lines.push("", "## 关系路线", "");
  for (const relationship of variant.relationshipArcs) lines.push(`- ${relationship.characterIds.join(" / ")}：${relationship.initialRelationship} → ${relationship.finalState}；转折节点：${relationship.turningBeatIds.join("、")}`);
  lines.push("", "## 宏观情节大纲", "");
  variant.outline.beats.forEach((beat, index) => {
    lines.push(`### ${index + 1}. ${beat.title}${beat.locked ? " [locked]" : ""}`, beat.summary, `- 剧情目的：${beat.purpose}`, `- 触发原因：${beat.trigger}`, `- 主要行动：${beat.mainAction}`, `- 直接结果：${beat.directResult}`, `- 长期后果：${beat.longTermConsequences.join("；")}`, `- 风险和代价：${beat.risksAndCosts}`, `- 依赖：${beat.dependencies.map((dependency) => `${dependency.type}:${dependency.fromBeatId}→${dependency.toBeatId}`).join("；")}`, "");
  });
  lines.push("## 时间线", "");
  [...variant.timeline.events].sort((left, right) => left.order - right.order).forEach((event) => {
    const time = event.date ? event.date : event.storyDay !== null ? `故事第 ${event.storyDay} 天` : event.relativeToEventId ? `相对 ${event.relativeToEventId}` : "仅确定顺序";
    lines.push(`- ${time}：${event.title}（${event.location}） — ${event.content}；结果：${event.result}；对应节点：${event.plotBeatId}`);
  });
  lines.push("", "## 未解决问题", "", ...bible.unresolvedQuestions.map((question) => `- ${question}`), "", "## 一致性问题", "", ...issues.map((item) => `- [${item.severity}/${item.confidence}] ${item.type}：${item.rationale}（最小修改：${item.minimumRevision}；副作用：${item.sideEffects.join("；")}）`));
  return lines.join("\n");
}

export const planningFilename = (plan: StoryPlan, extension: "md" | "json") => `${sanitizeFilename(plan.name || "story_plan")}.${extension}`;
