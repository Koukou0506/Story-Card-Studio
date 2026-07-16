import { NextRequest,NextResponse } from "next/server";
import { ChapterPlanningProjectSchema } from "@/domain/chapter-planning";
import { StoryPlanSchema } from "@/domain/story-planning";
import { CharacterCardV2Schema } from "@/domain/character-card";
import { LorebookSchema } from "@/domain/lorebook";
import { PlotAnalysisProjectSchema } from "@/domain/plot-analysis";
import { ProviderTypeSchema } from "@/providers/types";
import { createProvider,getDefaultProviderType } from "@/providers/factory";
import { generateChapterPlanning,type ChapterPlanningMode } from "@/services/chapter-planning-generator";
import { GenerationError } from "@/services/generator";
export async function POST(request:NextRequest){try{const body=await request.json();const project=ChapterPlanningProjectSchema.parse(body.project),storyPlan=StoryPlanSchema.parse(body.storyPlan),characterCard=CharacterCardV2Schema.parse(body.characterCard),lorebooks=LorebookSchema.array().parse(body.lorebooks||[]),analyses=PlotAnalysisProjectSchema.array().parse(body.analysisProjects||[]),type=ProviderTypeSchema.catch(getDefaultProviderType()).parse(body.provider),provider=createProvider({type});const result=await generateChapterPlanning({project,storyPlan,characterCard,lorebooks,analyses,provider,mode:body.mode as ChapterPlanningMode,scope:body.scope||{},model:String(body.model||provider.defaultModel),timeoutMs:Number(process.env.API_TIMEOUT_MS||60000),abortSignal:request.signal});return NextResponse.json({success:true,data:result.project,context:result.context,issues:result.issues,warnings:result.warnings,meta:{model:result.model,retriesUsed:result.retriesUsed}})}catch(error){if(error instanceof GenerationError)return NextResponse.json({error:error.message,code:error.code},{status:{timeout:504,cancelled:499,provider_error:502,validation_error:422,parse_error:422}[error.code]});return NextResponse.json({error:`章节规划服务错误：${(error as Error).message}`},{status:500})}}
