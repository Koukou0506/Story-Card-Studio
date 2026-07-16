import { z } from "zod";
import type { CharacterCardV2 } from "@/domain/character-card";
import type { Lorebook } from "@/domain/lorebook";
import type { PlotAnalysisProject } from "@/domain/plot-analysis";
import type { StoryPlan } from "@/domain/story-planning";
import type { ChapterPlanningProject } from "@/domain/chapter-planning";

export const ChapterPlanningContextSourceSchema=z.object({id:z.string(),sourceType:z.string(),sourceId:z.string(),name:z.string(),content:z.string(),version:z.string(),authority:z.number().int().min(1).max(9),locked:z.boolean(),modifiable:z.boolean(),included:z.boolean(),reason:z.string(),tokenEstimate:z.number().int()});
export const ChapterPlanningContextSchema=z.object({sources:z.array(ChapterPlanningContextSourceSchema),estimatedTokens:z.number().int(),tokenBudget:z.number().int(),truncated:z.boolean(),createdAt:z.string()});
export type ChapterPlanningContext=z.infer<typeof ChapterPlanningContextSchema>;
const tokens=(value:string)=>Math.max(1,Math.ceil(value.length/2));

export function buildChapterPlanningContext(args:{project:ChapterPlanningProject;storyPlan:StoryPlan;characterCard:CharacterCardV2;lorebooks:Lorebook[];analyses:PlotAnalysisProject[];plotSectionId?:string;plotBeatIds?:string[];chapterId?:string;sceneId?:string}):ChapterPlanningContext{
  const variant=args.storyPlan.variants.find(item=>item.id===args.project.b1VariantId)||args.storyPlan.variants.find(item=>item.id===args.storyPlan.selectedVariantId);
  const sources:Array<z.infer<typeof ChapterPlanningContextSourceSchema>>=[];
  const add=(source:Omit<z.infer<typeof ChapterPlanningContextSourceSchema>,"included"|"tokenEstimate">)=>sources.push({...source,included:true,tokenEstimate:tokens(source.content)});
  if(variant){
    add({id:`b1:${args.storyPlan.id}:${variant.id}`,sourceType:"b1_plan",sourceId:variant.id,name:variant.name,content:JSON.stringify({storyBible:variant.storyBible,outline:{structure:variant.outline.structure,sections:variant.outline.sections},notes:variant.notes}),version:variant.modifiedAt,authority:1,locked:true,modifiable:false,reason:"当前采用的 B1 规划"});
    const beatSet=new Set(args.plotBeatIds||[]);
    variant.outline.sections.filter(section=>!args.plotSectionId||section.id===args.plotSectionId).forEach(section=>add({id:`section:${section.id}`,sourceType:"plot_section",sourceId:section.id,name:section.name,content:JSON.stringify(section),version:section.modifiedAt,authority:1,locked:section.status==="locked",modifiable:false,reason:"本次展开的 Plot Section"}));
    variant.outline.beats.filter(beat=>!beatSet.size||beatSet.has(beat.id)).forEach(beat=>add({id:`beat:${beat.id}`,sourceType:"plot_beat",sourceId:beat.id,name:beat.title,content:JSON.stringify(beat),version:beat.modifiedAt,authority:1,locked:beat.locked||beat.status==="locked",modifiable:false,reason:"本次展开的 Plot Beat"}));
    add({id:`arcs:${variant.id}`,sourceType:"b1_plan",sourceId:variant.id,name:"角色弧与关系路线",content:JSON.stringify({characterArcs:variant.characterArcs,relationshipArcs:variant.relationshipArcs}),version:variant.modifiedAt,authority:2,locked:false,modifiable:false,reason:"与章节变化绑定"});
    add({id:`timeline:${variant.timeline.id}`,sourceType:"b1_plan",sourceId:variant.timeline.id,name:"B1 时间线",content:JSON.stringify(variant.timeline),version:variant.timeline.modifiedAt,authority:2,locked:false,modifiable:false,reason:"时间和状态基线"});
  }
  if(args.characterCard.data.name)add({id:`character:${args.characterCard.data.name}`,sourceType:"character_card",sourceId:args.characterCard.data.name,name:args.characterCard.data.name,content:[args.characterCard.data.description,args.characterCard.data.personality,args.characterCard.data.scenario].join("\n"),version:args.characterCard.data.character_version,authority:3,locked:false,modifiable:false,reason:"相关角色卡"});
  const selectedBeats=variant?.outline.beats.filter(beat=>!args.plotBeatIds?.length||args.plotBeatIds.includes(beat.id))||[];
  const query=[...(args.plotBeatIds||[]),args.plotSectionId||"",args.project.name,...selectedBeats.flatMap(beat=>[beat.title,beat.summary,beat.location,...beat.characterIds])].join(" ").toLowerCase();
  args.lorebooks.filter(book=>args.storyPlan.selectedLorebookIds.includes(book.id)).forEach(book=>book.entries.filter(entry=>entry.enabled&&(entry.activation.constant||[entry.name,...entry.activation.primaryKeys].some(key=>key&&query.includes(key.toLowerCase())))).forEach(entry=>add({id:`lore:${book.id}:${entry.id}`,sourceType:"lorebook",sourceId:entry.id,name:`${book.name}/${entry.name}`,content:entry.content,version:book.metadata.modifiedAt,authority:4,locked:false,modifiable:false,reason:entry.activation.constant?"常驻世界设定":"与展开范围相关"})));
  const allChapters=[...args.project.volumes].sort((a,b)=>a.order-b.order).flatMap(volume=>[...volume.chapters].sort((a,b)=>a.order-b.order));const chapterIndex=allChapters.findIndex(chapter=>chapter.id===args.chapterId);const adjacent=chapterIndex<0?[]:allChapters.slice(Math.max(0,chapterIndex-1),chapterIndex+2);
  adjacent.forEach(chapter=>{const version=chapter.versions.find(item=>item.id===chapter.selectedVersionId);if(version)add({id:`chapter:${chapter.id}`,sourceType:"chapter",sourceId:chapter.id,name:version.title,content:JSON.stringify(version),version:version.modifiedAt,authority:2,locked:chapter.locked||version.status==="locked",modifiable:chapter.id===args.chapterId,reason:chapter.id===args.chapterId?"当前章节":"相邻章节"})});
  const scene=args.project.volumes.flatMap(v=>v.chapters).flatMap(c=>c.versions).flatMap(v=>v.scenes).find(item=>item.id===args.sceneId);if(scene){const version=scene.versions.find(item=>item.id===scene.selectedVersionId);if(version)add({id:`scene:${scene.id}`,sourceType:"scene",sourceId:scene.id,name:version.title,content:JSON.stringify(version),version:version.modifiedAt,authority:1,locked:scene.locked||version.status==="locked",modifiable:true,reason:"当前场景及入口状态"})}
  args.analyses.flatMap(project=>project.reports).filter(report=>args.project.selectedAnalysisReportIds.includes(report.id)).forEach(report=>add({id:`analysis:${report.id}`,sourceType:"analysis_report",sourceId:report.id,name:report.inputSnapshot.title,content:JSON.stringify({summary:report.summary,suggestions:report.suggestions}),version:report.modifiedAt,authority:5,locked:false,modifiable:false,reason:"用户选择的 A3 建议"}));
  let used=0,truncated=false;sources.sort((a,b)=>a.authority-b.authority);for(const source of sources){if(used+source.tokenEstimate>args.project.tokenBudget){source.included=false;source.reason="超出 token 预算";truncated=true}else used+=source.tokenEstimate}
  return ChapterPlanningContextSchema.parse({sources,estimatedTokens:used,tokenBudget:args.project.tokenBudget,truncated,createdAt:new Date().toISOString()});
}
