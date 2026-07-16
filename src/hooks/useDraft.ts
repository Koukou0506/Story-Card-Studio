"use client";

import { useCallback } from "react";
import { useProjectStorage } from "./useProjectStorage";
import type { CharacterData, CharacterCardV2 } from "@/domain/character-card";
import type { ProjectInput } from "@/domain/project-input";
import type { Lorebook } from "@/domain/lorebook";
import type { PlotAnalysisProject, AnalysisReport } from "@/domain/plot-analysis";
import type { ProviderType } from "@/providers/types";
import type { StoryPlan, OutlineVariant } from "@/domain/story-planning";
import type { ChapterPlanningProject } from "@/domain/chapter-planning";
import type { Manuscript } from "@/domain/prose";
import type { ContinuityProject } from "@/domain/continuity";
import type { DocumentIngestionProject } from "@/domain/document-ingestion";
import {
  createEmptyProjectDraft,
  type LorebookAssociation,
} from "@/domain/project-draft";

export function useDraft() {
  const { draft, setDraft, replaceDraft, clearDraft, storageStatus, storageVersion, conflictCopyId, flushStorage } = useProjectStorage(createEmptyProjectDraft());
  const saved = () => new Date().toISOString();

  const updateProjectInput = useCallback((input: Partial<ProjectInput>) => {
    setDraft(prev => ({ ...prev, projectInput: { ...prev.projectInput, ...input }, savedAt: saved() }));
  }, [setDraft]);

  const setCharacterData = useCallback((data: CharacterData) => {
    setDraft(prev => ({ ...prev, characterData: data,
      characterCard: { ...prev.characterCard, spec: "chara_card_v2", spec_version: "2.0", data }, savedAt: saved() }));
  }, [setDraft]);

  const updateCharacterField = useCallback(<K extends keyof CharacterData>(field: K, value: CharacterData[K]) => {
    setDraft(prev => {
      const data = { ...prev.characterData, [field]: value };
      return { ...prev, characterData: data, characterCard: { ...prev.characterCard, data }, savedAt: saved() };
    });
  }, [setDraft]);

  const loadCharacterCard = useCallback((card: CharacterCardV2) => {
    setDraft(prev => ({ ...prev, characterData: card.data, characterCard: card, savedAt: saved() }));
  }, [setDraft]);

  const addLorebook = useCallback((book: Lorebook, select = true) => {
    setDraft(prev => ({ ...prev, lorebooks: [...prev.lorebooks, book],
      selectedLorebookId: select ? book.id : prev.selectedLorebookId, savedAt: saved() }));
  }, [setDraft]);

  const updateLorebook = useCallback((book: Lorebook) => {
    setDraft(prev => ({ ...prev, lorebooks: prev.lorebooks.map(item => item.id === book.id ? book : item), savedAt: saved() }));
  }, [setDraft]);

  const deleteLorebook = useCallback((id: string) => {
    setDraft(prev => ({ ...prev, lorebooks: prev.lorebooks.filter(book => book.id !== id),
      selectedLorebookId: prev.selectedLorebookId === id ? (prev.lorebooks.find(book => book.id !== id)?.id || null) : prev.selectedLorebookId,
      lorebookAssociations: prev.lorebookAssociations.filter(item => item.lorebookId !== id), savedAt: saved() }));
  }, [setDraft]);

  const selectLorebook = useCallback((id: string | null) => {
    setDraft(prev => ({ ...prev, selectedLorebookId: id, savedAt: saved() }));
  }, [setDraft]);

  const setLorebookAssociations = useCallback((associations: LorebookAssociation[]) => {
    setDraft(prev => ({ ...prev, lorebookAssociations: associations, savedAt: saved() }));
  }, [setDraft]);

  const selectedLorebook = draft.lorebooks.find(book => book.id === draft.selectedLorebookId) || null;
  const addAnalysisProject = useCallback((project: PlotAnalysisProject) => setDraft(prev => ({ ...prev, analysisProjects: [...prev.analysisProjects, project], selectedAnalysisProjectId: project.id, savedAt: saved() })), [setDraft]);
  const updateAnalysisProject = useCallback((project: PlotAnalysisProject) => setDraft(prev => ({ ...prev, analysisProjects: prev.analysisProjects.map(item => item.id === project.id ? project : item), savedAt: saved() })), [setDraft]);
  const deleteAnalysisProject = useCallback((id: string) => setDraft(prev => ({ ...prev, analysisProjects: prev.analysisProjects.filter(item => item.id !== id), selectedAnalysisProjectId: prev.selectedAnalysisProjectId === id ? null : prev.selectedAnalysisProjectId, savedAt: saved() })), [setDraft]);
  const selectAnalysisProject = useCallback((id: string | null) => setDraft(prev => ({ ...prev, selectedAnalysisProjectId: id, savedAt: saved() })), [setDraft]);
  const saveAnalysisReport = useCallback((projectId: string, report: AnalysisReport) => setDraft(prev => ({ ...prev, analysisProjects: prev.analysisProjects.map(project => project.id === projectId ? { ...project, reports: [...project.reports.filter(item => item.id !== report.id), { ...report, status: "confirmed" as const, modifiedAt: saved() }], modifiedAt: saved() } : project), savedAt: saved() })), [setDraft]);
  const addProjectNote = useCallback((note: string) => setDraft(prev => ({ ...prev, projectNotes: [...prev.projectNotes, note], savedAt: saved() })), [setDraft]);
  const updateAnalysisProviderPreference = useCallback((provider: ProviderType, model: string) => setDraft(prev => ({ ...prev, providerPreferences: { ...prev.providerPreferences, analysisProvider: provider, analysisModel: model }, savedAt: saved() })), [setDraft]);
  const selectedAnalysisProject = draft.analysisProjects.find(project => project.id === draft.selectedAnalysisProjectId) || null;
  const addStoryPlan=useCallback((plan:StoryPlan)=>setDraft(prev=>{const next={...(plan.originalIdea?plan:{...plan,originalIdea:prev.projectInput.originalIdea}),selectedCharacterIds:plan.selectedCharacterIds.length?plan.selectedCharacterIds:(prev.characterData.name?[prev.characterData.name]:[])};return{...prev,storyPlans:[...prev.storyPlans,next],selectedStoryPlanId:next.id,savedAt:saved()}}),[setDraft]);
  const updateStoryPlan=useCallback((plan:StoryPlan)=>setDraft(prev=>({...prev,storyPlans:prev.storyPlans.map(x=>x.id===plan.id?plan:x),savedAt:saved()})),[setDraft]);
  const deleteStoryPlan=useCallback((id:string)=>setDraft(prev=>({...prev,storyPlans:prev.storyPlans.filter(x=>x.id!==id),selectedStoryPlanId:prev.selectedStoryPlanId===id?null:prev.selectedStoryPlanId,savedAt:saved()})),[setDraft]);
  const selectStoryPlan=useCallback((id:string|null)=>setDraft(prev=>({...prev,selectedStoryPlanId:id,savedAt:saved()})),[setDraft]);
  const savePlanningVariant=useCallback((planId:string,variant:OutlineVariant)=>setDraft(prev=>({...prev,storyPlans:prev.storyPlans.map(p=>p.id===planId?{...p,variants:[...p.variants.filter(v=>v.id!==variant.id),variant],selectedVariantId:variant.id,modifiedAt:saved()}:p),savedAt:saved()})),[setDraft]);
  const selectedStoryPlan=draft.storyPlans.find(x=>x.id===draft.selectedStoryPlanId)||null;
  const addChapterPlanningProject=useCallback((project:ChapterPlanningProject)=>setDraft(prev=>({...prev,chapterPlanningProjects:[...prev.chapterPlanningProjects,project],selectedChapterPlanningProjectId:project.id,savedAt:saved()})),[setDraft]);
  const updateChapterPlanningProject=useCallback((project:ChapterPlanningProject)=>setDraft(prev=>({...prev,chapterPlanningProjects:prev.chapterPlanningProjects.map(item=>item.id===project.id?project:item),savedAt:saved()})),[setDraft]);
  const deleteChapterPlanningProject=useCallback((id:string)=>setDraft(prev=>({...prev,chapterPlanningProjects:prev.chapterPlanningProjects.filter(item=>item.id!==id),selectedChapterPlanningProjectId:prev.selectedChapterPlanningProjectId===id?null:prev.selectedChapterPlanningProjectId,savedAt:saved()})),[setDraft]);
  const selectChapterPlanningProject=useCallback((id:string|null)=>setDraft(prev=>({...prev,selectedChapterPlanningProjectId:id,savedAt:saved()})),[setDraft]);
  const selectedChapterPlanningProject=draft.chapterPlanningProjects.find(item=>item.id===draft.selectedChapterPlanningProjectId)||null;
  const addManuscript=useCallback((manuscript:Manuscript)=>setDraft(prev=>({...prev,manuscripts:[...prev.manuscripts,manuscript],selectedManuscriptId:manuscript.id,savedAt:saved()})),[setDraft]);
  const updateManuscript=useCallback((manuscript:Manuscript)=>setDraft(prev=>({...prev,manuscripts:prev.manuscripts.map(item=>item.id===manuscript.id?manuscript:item),savedAt:saved()})),[setDraft]);
  const deleteManuscript=useCallback((id:string)=>setDraft(prev=>({...prev,manuscripts:prev.manuscripts.filter(item=>item.id!==id),selectedManuscriptId:prev.selectedManuscriptId===id?null:prev.selectedManuscriptId,savedAt:saved()})),[setDraft]);
  const selectManuscript=useCallback((id:string|null)=>setDraft(prev=>({...prev,selectedManuscriptId:id,savedAt:saved()})),[setDraft]);
  const selectedManuscript=draft.manuscripts.find(item=>item.id===draft.selectedManuscriptId)||null;
  const addContinuityProject=useCallback((project:ContinuityProject)=>setDraft(prev=>({...prev,continuityProjects:[...prev.continuityProjects,project],selectedContinuityProjectId:project.id,savedAt:saved()})),[setDraft]);
  const updateContinuityProject=useCallback((project:ContinuityProject)=>setDraft(prev=>({...prev,continuityProjects:prev.continuityProjects.map(item=>item.id===project.id?project:item),savedAt:saved()})),[setDraft]);
  const deleteContinuityProject=useCallback((id:string)=>setDraft(prev=>({...prev,continuityProjects:prev.continuityProjects.filter(item=>item.id!==id),selectedContinuityProjectId:prev.selectedContinuityProjectId===id?(prev.continuityProjects.find(item=>item.id!==id)?.id??null):prev.selectedContinuityProjectId,savedAt:saved()})),[setDraft]);
  const selectContinuityProject=useCallback((id:string|null)=>setDraft(prev=>({...prev,selectedContinuityProjectId:id,savedAt:saved()})),[setDraft]);
  const selectedContinuityProject=draft.continuityProjects.find(item=>item.id===draft.selectedContinuityProjectId)||null;
  const addDocumentIngestion=useCallback((project:DocumentIngestionProject)=>setDraft(prev=>({...prev,documentIngestions:[...prev.documentIngestions,project],selectedDocumentIngestionId:project.id,savedAt:saved()})),[setDraft]);
  const updateDocumentIngestion=useCallback((project:DocumentIngestionProject)=>setDraft(prev=>({...prev,documentIngestions:prev.documentIngestions.map(item=>item.id===project.id?project:item),savedAt:saved()})),[setDraft]);
  const deleteDocumentIngestion=useCallback((id:string)=>setDraft(prev=>({...prev,documentIngestions:prev.documentIngestions.filter(item=>item.id!==id),selectedDocumentIngestionId:prev.selectedDocumentIngestionId===id?(prev.documentIngestions.find(item=>item.id!==id)?.id??null):prev.selectedDocumentIngestionId,savedAt:saved()})),[setDraft]);
  const selectDocumentIngestion=useCallback((id:string|null)=>setDraft(prev=>({...prev,selectedDocumentIngestionId:id,savedAt:saved()})),[setDraft]);
  const selectedDocumentIngestion=draft.documentIngestions.find(item=>item.id===draft.selectedDocumentIngestionId)||null;
  const hasDraft = draft.projectInput.originalIdea !== "" || draft.characterData.name !== "" || draft.lorebooks.length > 0 || draft.analysisProjects.length > 0||draft.storyPlans.length>0||draft.chapterPlanningProjects.length>0||draft.manuscripts.length>0||draft.continuityProjects.length>0||draft.documentIngestions.length>0;

  return { draft, selectedLorebook, updateProjectInput, setCharacterData, updateCharacterField,
    loadCharacterCard, addLorebook, updateLorebook, deleteLorebook, selectLorebook,
    setLorebookAssociations, selectedAnalysisProject, addAnalysisProject, updateAnalysisProject, deleteAnalysisProject,
    selectAnalysisProject, saveAnalysisReport, addProjectNote, updateAnalysisProviderPreference,selectedStoryPlan,addStoryPlan,updateStoryPlan,deleteStoryPlan,selectStoryPlan,savePlanningVariant,selectedChapterPlanningProject,addChapterPlanningProject,updateChapterPlanningProject,deleteChapterPlanningProject,selectChapterPlanningProject,selectedManuscript,addManuscript,updateManuscript,deleteManuscript,selectManuscript,selectedContinuityProject,addContinuityProject,updateContinuityProject,deleteContinuityProject,selectContinuityProject,selectedDocumentIngestion,addDocumentIngestion,updateDocumentIngestion,deleteDocumentIngestion,selectDocumentIngestion, replaceDraft, clearDraft, storageStatus, storageVersion, conflictCopyId, flushStorage, hasDraft };
}
