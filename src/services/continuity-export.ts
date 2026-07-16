import { ContinuityProjectSchema, type ContinuityProject } from "@/domain/continuity";

export const safeContinuityFilename = (name: string) => (name.normalize("NFKC").replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/[. ]+$/g, "").trim() || "continuity-project").slice(0, 100);
const status = (value: string) => value.replaceAll("_", " ");

export function exportContinuityMarkdown(project: ContinuityProject): string {
  const lines: string[] = [`# ${project.name}`, "", `> 数据版本 ${project.dataVersion} · 更新时间 ${project.modifiedAt}`, ""];
  lines.push("## Canon", "");
  for (const fact of project.canonLedger.facts) lines.push(`- **${fact.title}** [${status(fact.status)} / 权威 ${fact.authority}]：${fact.content}`);
  lines.push("", "## 状态表", "", "### 人物", "");
  for (const item of project.characterSnapshots) lines.push(`- ${item.characterId} @ ${item.chapterId}/${item.sceneId}：${item.location}；身体 ${item.body || "未记录"}；情绪 ${item.emotion || "未记录"}；目标 ${item.goal || "未记录"}`);
  lines.push("", "### 关系", ""); for (const item of project.relationshipSnapshots) lines.push(`- ${item.characterIds.join(" × ")}：${item.relationship}；信任 ${item.trust || "未记录"}`);
  lines.push("", "### 世界", ""); for (const item of project.worldSnapshots) lines.push(`- ${item.entityId}：${item.state}`);
  lines.push("", "## 知情矩阵", "", "| 信息 | 读者 | 角色状态 | 公开 |", "|---|---|---|---|");
  for (const info of project.knowledgeStates) lines.push(`| ${info.title} | ${status(info.readerStatus)} | ${info.holders.map((h) => `${h.characterId}:${status(h.status)}`).join("；")} | ${info.public ? "是" : "否"} |`);
  lines.push("", "## 剧情线", ""); for (const thread of project.plotThreads) lines.push(`- **${thread.title}** [${status(thread.status)}]：${thread.currentState}；下一节点：${thread.nextNode || "未安排"}`);
  lines.push("", "## 未解决问题", ""); for (const question of project.openQuestions) lines.push(`- [${status(question.status)}] ${question.question}（计划：${question.plannedAnswerLocation || "未安排"}）`);
  lines.push("", "## 伏笔", ""); for (const thread of project.foreshadowThreads) lines.push(`- **${thread.title}** [${status(thread.status)}${thread.overdue ? " / 已过期" : ""}]：${thread.description}；计划回收：${thread.plannedPayoffLocation || "未安排"}`);
  lines.push("", "## 全书时间线", ""); for (const event of [...project.timeline.events].sort((a, b) => a.order - b.order)) lines.push(`- ${event.date || (event.storyDay !== null ? `故事第 ${event.storyDay} 天` : `顺序 ${event.order}`)} · ${event.title} @ ${event.location || "地点未定"}`);
  lines.push("", "## 连续性报告", ""); for (const issue of project.issues) lines.push(`- **${issue.severity} / ${issue.confidence}** ${issue.title} [${status(issue.status)}]\n  - 依据：${issue.rationale || "见来源"}\n  - 最小修复：${issue.minimumRevision || "人工确认"}\n  - 副作用：${issue.sideEffects.join("；") || "未评估"}`);
  const health = project.healthReports.at(-1); lines.push("", "## 项目健康", ""); if (health) lines.push(`- 正式字数：${health.totalWords}`, `- 章节完成度：${health.chapterCompletion}%`, `- 场景完成度：${health.sceneCompletion}%`, `- Canon 冲突：${health.canonConflicts}`, `- 严重问题：${health.severeIssues}`, `- 活跃剧情线：${health.activeThreads}`, `- 待回收伏笔：${health.pendingForeshadows}`, `- 优先级：${health.priorities.join("；")}`);
  const context = project.contextPackages.at(-1); lines.push("", "## 下一章上下文包", ""); if (context) lines.push(`- 章节：${context.chapterId || "未选择"}`, `- 目标：${context.chapterGoal}`, `- 前章结束：${context.previousEndingState}`, `- 未完成行动：${context.unfinishedActions.join("；")}`, `- 禁止提前事件：${context.prohibitedEarlyEvents.join("；")}`, `- 连续性风险：${context.continuityRisks.join("；")}`);
  return `${lines.join("\n")}\n`;
}

export function exportContinuityJSON(project: ContinuityProject): string { return JSON.stringify(ContinuityProjectSchema.parse(project), null, 2); }
export function importContinuityJSON(text: string): ContinuityProject { try { return ContinuityProjectSchema.parse(JSON.parse(text)); } catch (error) { throw new Error(`连续性 JSON 导入失败：${(error as Error).message}`); } }

export function downloadContinuity(content: string, filename: string, type: "markdown" | "json") {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: type === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${safeContinuityFilename(filename)}.${type === "json" ? "json" : "md"}`; link.click(); URL.revokeObjectURL(url);
}
