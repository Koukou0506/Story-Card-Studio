import { z } from "zod";
import { CharacterCardV2Schema, createEmptyCharacterCard } from "./character-card";
import { LorebookSchema } from "./lorebook";
import { ProjectInputSchema, createEmptyProjectInput } from "./project-input";
import { PlotAnalysisProjectSchema } from "./plot-analysis";
import { StoryPlanSchema } from "./story-planning";
import { ChapterPlanningProjectSchema } from "./chapter-planning";
import { ManuscriptSchema } from "./prose";
import { ContinuityProjectSchema } from "./continuity";
import { DocumentIngestionProjectSchema } from "./document-ingestion";
import { AssistantConversationSchema } from "./project-assistant";
import { ChangeManagementStateSchema } from "./change-management";
import { AssetLibraryStateSchema } from "./asset-library";

export const PROJECT_DATA_VERSION = 10;

export const LorebookAssociationSchema = z.object({
  lorebookId: z.string(),
  characterId: z.string(),
  relation: z.enum(["linked", "embedded", "imported_from_character"]),
});

export const ProjectDraftSchema = z.object({
  dataVersion: z.literal(PROJECT_DATA_VERSION),
  projectInput: ProjectInputSchema,
  characterData: CharacterCardV2Schema.shape.data,
  characterCard: CharacterCardV2Schema,
  lorebooks: z.array(LorebookSchema).default([]),
  selectedLorebookId: z.string().nullable().default(null),
  lorebookAssociations: z.array(LorebookAssociationSchema).default([]),
  promptVersion: z.string().default("lorebook-v1.0.0"),
  analysisProjects: z.array(PlotAnalysisProjectSchema).default([]),
  selectedAnalysisProjectId: z.string().nullable().default(null),
  projectNotes: z.array(z.string()).default([]),
  providerPreferences: z.object({ generationProvider: z.enum(["mock", "openai", "anthropic"]).default("mock"), generationModel: z.string().default("mock-model"), analysisProvider: z.enum(["mock", "openai", "anthropic"]).default("mock"), analysisModel: z.string().default("mock-model") }).default({ generationProvider: "mock", generationModel: "mock-model", analysisProvider: "mock", analysisModel: "mock-model" }),
  storyPlans: z.array(StoryPlanSchema).default([]), selectedStoryPlanId: z.string().nullable().default(null),
  chapterPlanningProjects: z.array(ChapterPlanningProjectSchema).default([]), selectedChapterPlanningProjectId: z.string().nullable().default(null),
  manuscripts: z.array(ManuscriptSchema).default([]), selectedManuscriptId: z.string().nullable().default(null),
  continuityProjects: z.array(ContinuityProjectSchema).default([]), selectedContinuityProjectId: z.string().nullable().default(null),
  documentIngestions: z.array(DocumentIngestionProjectSchema).default([]), selectedDocumentIngestionId: z.string().nullable().default(null),
  assistantConversations: z.array(AssistantConversationSchema).default([]), selectedAssistantConversationId: z.string().nullable().default(null),
  changeManagement: ChangeManagementStateSchema,
  assetLibrary: AssetLibraryStateSchema,
  savedAt: z.string(),
  migrationError: z.string().nullable().default(null),
  recoveryData: z.unknown().optional(),
}).passthrough();

export type ProjectDraft = z.infer<typeof ProjectDraftSchema>;
export type LorebookAssociation = z.infer<typeof LorebookAssociationSchema>;

export function createEmptyProjectDraft(): ProjectDraft {
  const card = createEmptyCharacterCard();
  return ProjectDraftSchema.parse({
    dataVersion: PROJECT_DATA_VERSION,
    projectInput: createEmptyProjectInput(),
    characterData: card.data,
    characterCard: card,
    lorebooks: [],
    selectedLorebookId: null,
    lorebookAssociations: [],
    promptVersion: "lorebook-v1.0.0",
    analysisProjects: [], selectedAnalysisProjectId: null, projectNotes: [], providerPreferences: {}, storyPlans: [], selectedStoryPlanId: null, chapterPlanningProjects: [], selectedChapterPlanningProjectId: null, manuscripts: [], selectedManuscriptId: null, continuityProjects: [], selectedContinuityProjectId: null, documentIngestions: [], selectedDocumentIngestionId: null, assistantConversations: [], selectedAssistantConversationId: null, changeManagement: {}, assetLibrary: {},
    savedAt: new Date().toISOString(),
    migrationError: null,
  });
}

/** 将没有版本号的 A1 草稿无损提升到 A2；失败时把原始值放入 recoveryData。 */
export function migrateProjectDraft(raw: unknown): ProjectDraft {
  const current = ProjectDraftSchema.safeParse(raw);
  if (current.success) return current.data;

  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("草稿根数据不是对象");
    const legacy = raw as Record<string, unknown>;
    const projectInput = ProjectInputSchema.parse(legacy.projectInput || {});
    const cardResult = CharacterCardV2Schema.safeParse(legacy.characterCard);
    const fallbackCard = CharacterCardV2Schema.parse({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: legacy.characterData || {},
    });
    const card = cardResult.success ? cardResult.data : fallbackCard;
    const legacyCharacterData = CharacterCardV2Schema.shape.data.safeParse(legacy.characterData);
    if (legacyCharacterData.success) {
      const mergedData = { ...card.data } as typeof card.data;
      for (const [key, value] of Object.entries(legacyCharacterData.data)) {
        const hasValue = Array.isArray(value) ? value.length > 0 : value !== "" && value !== null && value !== undefined;
        if (hasValue && (mergedData as Record<string, unknown>)[key] === "") (mergedData as Record<string, unknown>)[key] = value;
      }
      (card as typeof card).data = mergedData;
    }
    const lorebooksResult = LorebookSchema.array().safeParse(legacy.lorebooks);
    const analysesResult = PlotAnalysisProjectSchema.array().safeParse(legacy.analysisProjects);
    const plansResult = StoryPlanSchema.array().safeParse(legacy.storyPlans);
    const chapterPlansResult = ChapterPlanningProjectSchema.array().safeParse(legacy.chapterPlanningProjects);
    const manuscriptsResult = ManuscriptSchema.array().safeParse(legacy.manuscripts);
    const continuityResult = ContinuityProjectSchema.array().safeParse(legacy.continuityProjects);
    const ingestionResult = DocumentIngestionProjectSchema.array().safeParse(legacy.documentIngestions);
    const migrated = ProjectDraftSchema.parse({
      ...legacy,
      dataVersion: PROJECT_DATA_VERSION,
      projectInput,
      characterData: card.data,
      characterCard: card,
      lorebooks: lorebooksResult.success ? lorebooksResult.data : [],
      selectedLorebookId: typeof legacy.selectedLorebookId === "string" ? legacy.selectedLorebookId : null,
      lorebookAssociations: Array.isArray(legacy.lorebookAssociations) ? legacy.lorebookAssociations : [],
      analysisProjects: analysesResult.success ? analysesResult.data : [], selectedAnalysisProjectId: typeof legacy.selectedAnalysisProjectId==="string"?legacy.selectedAnalysisProjectId:null,
      projectNotes:Array.isArray(legacy.projectNotes)?legacy.projectNotes:[],providerPreferences:legacy.providerPreferences||{},storyPlans:plansResult.success?plansResult.data:[],selectedStoryPlanId:typeof legacy.selectedStoryPlanId==="string"?legacy.selectedStoryPlanId:null,chapterPlanningProjects:chapterPlansResult.success?chapterPlansResult.data:[],selectedChapterPlanningProjectId:typeof legacy.selectedChapterPlanningProjectId==="string"?legacy.selectedChapterPlanningProjectId:null,manuscripts:manuscriptsResult.success?manuscriptsResult.data:[],selectedManuscriptId:typeof legacy.selectedManuscriptId==="string"?legacy.selectedManuscriptId:null,continuityProjects:continuityResult.success?continuityResult.data:[],selectedContinuityProjectId:typeof legacy.selectedContinuityProjectId==="string"?legacy.selectedContinuityProjectId:null,documentIngestions:ingestionResult.success?ingestionResult.data:[],selectedDocumentIngestionId:typeof legacy.selectedDocumentIngestionId==="string"?legacy.selectedDocumentIngestionId:null,
      promptVersion: "lorebook-v1.0.0",
      savedAt: typeof legacy.savedAt === "string" ? legacy.savedAt : new Date().toISOString(),
      migrationError: null,
    });
    return migrated;
  } catch (error) {
    const empty = createEmptyProjectDraft();
    return {
      ...empty,
      migrationError: `旧草稿迁移失败：${(error as Error).message}。原始数据已保留，可从恢复区导出。`,
      recoveryData: raw,
    };
  }
}
