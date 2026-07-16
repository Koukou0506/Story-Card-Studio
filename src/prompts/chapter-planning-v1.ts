import type { ChapterPlanningContext } from "@/services/chapter-planning-context-builder";
import type { ChapterPlanningProject } from "@/domain/chapter-planning";
export const CHAPTER_PLANNING_PROMPT_VERSION="chapter-planning-v1.0.0";
const RULES="遵守来源权威层级；保留 locked 内容；不生成小说正文；不虚构来源；不得无提示改变 B1 核心情节；每章必须产生有效变化；每个场景必须有目标、冲突和结果；保持人物、时间、地点、状态和信息连续；区分角色知道、读者知道和作者知道；新增关键设定必须标记；只返回符合 ChapterPlanningProject Schema 的 JSON。";
export const buildVolumePrompt=()=>`任务类型：章节场景规划；从 B1 Plot Section 和 Plot Beat 生成分卷。${RULES}`;
export const buildChapterPrompt=()=>`任务类型：章节场景规划；将选定分卷或 Plot Beat 拆成章节。${RULES}`;
export const buildScenePrompt=()=>`任务类型：章节场景规划；将选定章节拆成场景卡。${RULES}`;
export const buildStatePrompt=()=>`任务类型：章节场景规划；补全场景入口和出口状态。${RULES}`;
export const buildPovPrompt=()=>`任务类型：章节场景规划；检查并修订视角配置。${RULES}`;
export const buildInformationPrompt=()=>`任务类型：章节场景规划；补全信息流，明确作者、读者和角色知情状态。${RULES}`;
export const buildForeshadowPrompt=()=>`任务类型：章节场景规划；提出基础铺垫与回收位置。${RULES}`;
export const buildAlternativeChapterPrompt=()=>`任务类型：章节场景规划；生成替代章节方案并保留原版本。${RULES}`;
export const buildLocalRevisionPrompt=()=>`任务类型：章节场景规划；只修改用户选择的字段和范围。${RULES}`;
export const buildChapterPlanningRepairPrompt=(error:string)=>`修复 JSON Schema 错误：${error}。不改变事实、B1 节点与锁定内容，只返回完整 JSON。`;
export function buildChapterPlanningUserMessage(project:ChapterPlanningProject,context:ChapterPlanningContext,mode:string,scope:Record<string,unknown>){return`生成模式：${mode}\n范围：${JSON.stringify(scope)}\n当前项目：${JSON.stringify({id:project.id,b1PlanId:project.b1PlanId,b1VariantId:project.b1VariantId})}\nCONTEXT_JSON:${JSON.stringify(context.sources.filter(source=>source.included))}\n返回结构化 ChapterPlanningProject JSON。`}
