import { AssistantContextSchema,type AssistantContext } from "@/domain/project-assistant";
export function createAssistantContext(projectId:string):AssistantContext{return AssistantContextSchema.parse({projectId})}
export function switchAssistantContext(current:AssistantContext,patch:Partial<AssistantContext>):AssistantContext{return AssistantContextSchema.parse({...current,...patch,revision:current.revision+1,textSelection:patch.chapterId!==undefined||patch.sceneId!==undefined?patch.textSelection??null:patch.textSelection??current.textSelection})}
