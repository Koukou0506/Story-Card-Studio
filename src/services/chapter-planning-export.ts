import { ChapterPlanningProjectSchema, type ChapterPlanningProject } from "@/domain/chapter-planning";
import { sanitizeFilename } from "./import-export";

export const exportChapterPlanningJSON = (project: ChapterPlanningProject) => JSON.stringify(ChapterPlanningProjectSchema.parse(project), null, 2);
export function importChapterPlanningJSON(value: string) {
  try { return ChapterPlanningProjectSchema.parse(JSON.parse(value)); }
  catch (error) { throw new Error(`章节规划 JSON 校验失败：${(error as Error).message}`); }
}

export function exportChapterPlanningMarkdown(project: ChapterPlanningProject) {
  const lines = [`# ${project.name}`, "", "## 分卷规划", ""];
  for (const volume of [...project.volumes].sort((a, b) => a.order - b.order)) {
    lines.push(`## ${volume.title}`, `- 卷目标：${volume.goal}`, `- 核心冲突：${volume.coreConflict}`, `- 开始/结束状态：${volume.openingState} → ${volume.endingState}`, `- 故事规划节点：${volume.plotBeatIds.join("、")}`, "");
    for (const chapter of [...volume.chapters].sort((a, b) => a.order - b.order)) {
      const chapterVersion = chapter.versions.find((value) => value.id === chapter.selectedVersionId) || chapter.versions[0];
      if (!chapterVersion) continue;
      lines.push(`### ${chapterVersion.title}`, `- 目标：${chapterVersion.chapterGoal}`, `- 视角：${chapterVersion.pov.perspective} / ${chapterVersion.pov.povCharacterIds.join("、")}`, `- 时间地点：${chapterVersion.time} / ${chapterVersion.location}`, `- 冲突与转折：${chapterVersion.mainConflict} / ${chapterVersion.coreTurn}`, `- 结果与钩子：${chapterVersion.result} / ${chapterVersion.hook.content}`, `- 预计篇幅：${chapterVersion.estimatedWords}`, "");
      for (const scene of [...chapterVersion.scenes].sort((a, b) => a.order - b.order)) {
        const sceneVersion = scene.versions.find((value) => value.id === scene.selectedVersionId) || scene.versions[0];
        if (!sceneVersion) continue;
        lines.push(`#### 场景：${sceneVersion.title}`, `- 时间地点：${sceneVersion.time} / ${sceneVersion.location}`, `- 视角：${sceneVersion.pov.perspective} / ${sceneVersion.pov.povCharacterIds.join("、")}`, `- 入口：${JSON.stringify(sceneVersion.entryState)}`, `- 目标/冲突：${sceneVersion.sceneGoal} / ${sceneVersion.conflictType}`, `- 触发/行动/转折：${sceneVersion.trigger} / ${sceneVersion.action} / ${sceneVersion.turningPoint}`, `- 结果：${sceneVersion.result}`, `- 出口：${JSON.stringify(sceneVersion.exitState)}`, `- 信息揭示：${sceneVersion.informationRevealIds.join("、")}`, `- 铺垫/回收：${sceneVersion.foreshadowSetupIds.join("、")} / ${sceneVersion.foreshadowPayoffIds.join("、")}`, `- 节奏：${sceneVersion.pacingIntensity}，预计 ${sceneVersion.estimatedWords} 字`, `- 备注：${sceneVersion.notes.join("；")}`, "");
      }
    }
  }
  lines.push("## 信息流", "", ...project.informationItems.map((item) => `- ${item.title}：读者=${item.readerState}；角色=${JSON.stringify(item.characterStates)}；${item.secrecy}/${item.verification}`), "", "## 铺垫和回收", "", ...project.foreshadows.map((item) => `- ${item.label}：设置 ${item.setupLocationIds.join("、")}；计划回收 ${item.plannedPayoffLocationIds.join("、")}；实际回收 ${item.actualPayoffLocationIds.join("、")}；${item.state}`), "", "## 时间与状态", "", "场景卡中的入口/出口状态按章节和场景顺序继承。", "", "## 一致性问题", "", ...project.issues.map((item) => `- [${item.severity}/${item.confidence}${item.heuristic ? "/启发式" : ""}] ${item.rationale}；建议：${item.minimumRevision}`), "", "## 写作备注", "", ...project.volumes.flatMap((volume) => volume.notes.map((note) => `- ${note}`)));
  return lines.join("\n");
}
export const chapterPlanningFilename = (project: ChapterPlanningProject, ext: "md" | "json") => `${sanitizeFilename(project.name || "chapter_planning")}.${ext}`;
