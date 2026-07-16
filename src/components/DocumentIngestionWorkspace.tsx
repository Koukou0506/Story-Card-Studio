"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CharacterCardV2 } from "@/domain/character-card";
import type { Lorebook } from "@/domain/lorebook";
import type { LanguageConstraint, StyleProfile } from "@/domain/prose";
import type { ProjectDraft } from "@/domain/project-draft";
import type { ProjectRebuildPlan } from "@/domain/work-import";
import {
  DocumentAnalysisConfigSchema,
  ExtractionItemSchema,
  createEmptyDocumentIngestionProject,
  type DocumentAnalysisConfig,
  type DocumentChunk,
  type DocumentIngestionProject,
  type GenericDocumentCandidate,
  type SourceSpan,
} from "@/domain/document-ingestion";
import { createBrowserDocumentAssetStorage } from "@/storage/browser-document-assets";
import { createDocumentAssetRecord } from "@/storage/document-assets";
import { ingestLocalDocumentFile } from "@/services/document-ingestion/pipeline";
import {
  mergeDocumentChapters,
  renameDocumentChapter,
  reorderDocumentChapters,
  splitDocumentChapter,
  segmentDocumentChapters,
} from "@/services/document-ingestion/chapter-segmenter";
import { planDocumentChunks } from "@/services/document-ingestion/chunk-planner";
import { mapNormalizedRange, normalizeDocumentText } from "@/services/document-ingestion/text-normalizer";
import { calculateStyleStatistics } from "@/services/document-ingestion/style-statistics";
import {
  createLanguageConstraintCandidates,
  styleStatisticsToProfileCandidate,
} from "@/services/document-ingestion/converters";
import { createMockDocumentIngestionProject } from "@/services/document-ingestion/mock";
import { createIngestionTask, runExtractionTask } from "@/services/document-ingestion/extraction-orchestrator";
import { consolidateDocumentExtractions } from "@/services/document-ingestion/consolidator";
import { exportDocumentIngestionJSON, importDocumentIngestionJSON, safeDocumentIngestionFilename } from "@/services/document-ingestion/export";
import { readValidatedJsonFile } from "@/services/file-validation";
import { createImportManifest, reorderManifestItem } from "@/services/document-ingestion/import-manifest";
import { resolveChapterVersions } from "@/services/document-ingestion/chapter-version-resolver";
import { executeProjectRebuildPlan, planProjectRebuild } from "@/services/document-ingestion/project-rebuild";
import { applyOcrCorrection, createOcrJob, runOcrJob } from "@/services/document-ingestion/ocr";
import { describeSourceSpanJump } from "@/services/document-ingestion/source-reference";

type ReviewPanel = "upload" | "preview" | "chapters" | "config" | "progress" | "entities" | "characters" | "relationships" | "cards" | "lorebook" | "canon" | "style" | "report";

interface DocumentIngestionWorkspaceProps {
  projects: DocumentIngestionProject[];
  selected: DocumentIngestionProject | null;
  projectId: string;
  existingCharacterName: string;
  isOnline: boolean;
  onAdd: (project: DocumentIngestionProject) => void;
  onUpdate: (project: DocumentIngestionProject) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string | null) => void;
  onWriteCharacterCard: (card: CharacterCardV2) => void;
  onWriteLorebook: (book: Lorebook) => void;
  onWriteCanonCandidate: (candidate: GenericDocumentCandidate) => void;
  onWriteStyleProfile: (profile: StyleProfile) => void;
  onWriteLanguageConstraints: (constraints: LanguageConstraint[]) => void;
  projectDraft?: ProjectDraft;
  onReplaceProjectDraft?: (draft: ProjectDraft) => void;
}

const sharedAssetStorage = createBrowserDocumentAssetStorage();

function toProviderChunk(chunk: DocumentChunk) {
  return {
    id: chunk.id,
    documentId: chunk.documentId,
    chapterId: chunk.chapterId,
    order: chunk.order,
    text: chunk.text,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
    sourceSpans: chunk.sourceSpans,
    estimatedTokens: chunk.estimatedTokens,
    overlapBefore: chunk.overlapBefore,
    overlapAfter: chunk.overlapAfter,
  };
}

const PANELS: Array<[ReviewPanel, string]> = [
  ["upload", "上传文件"], ["preview", "文本提取预览"], ["chapters", "章节确认"],
  ["config", "解析配置"], ["progress", "处理进度"], ["entities", "实体候选"],
  ["characters", "人物候选"], ["relationships", "关系候选"], ["cards", "角色卡草稿"],
  ["lorebook", "世界书草稿"], ["canon", "Canon 和状态候选"], ["style", "文风档案"],
  ["report", "解析报告"],
];
const WORKFLOW_STEPS = ["选择文件", "解析设置", "内容预览", "卷章结构", "重复与版本", "OCR 校对", "提取设置", "处理进度", "候选资料", "重建方案", "写入结果"];

function sourceLabel(candidate: { sourceSpans: SourceSpan[] }, sources: DocumentIngestionProject["documentSources"] = []) {
  const span = candidate.sourceSpans[0];
  if (!span) return "无 Source Span（不可作为有效依据）";
  const source = sources.find((item) => item.id === span.documentId);
  return `Source Span · ${describeSourceSpanJump(span, source)}`;
}

export function DocumentIngestionWorkspace(props: DocumentIngestionWorkspaceProps) {
  const [panel, setPanel] = useState<ReviewPanel>("upload");
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [allowExternal, setAllowExternal] = useState(false);
  const [retainOriginal, setRetainOriginal] = useState(true);
  const [retainText, setRetainText] = useState(true);
  const [manualEncoding, setManualEncoding] = useState<"" | "utf-8" | "utf-16le" | "utf-16be" | "gb18030">("");
  const [pdfPassword, setPdfPassword] = useState("");
  const [customChapterPattern, setCustomChapterPattern] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rebuildMode, setRebuildMode] = useState<"new" | "supplement">("supplement");
  const [rebuildPlan, setRebuildPlan] = useState<ProjectRebuildPlan | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ingestionJsonRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const current = props.selected;
  const source = current?.documentSources.find((item) => item.id === current.selectedDocumentId) ?? current?.documentSources[0] ?? null;
  const manifest = current?.workImport.manifests[0] ?? null;
  const ocrJob = source ? current?.workImport.ocrJobs.find((item) => item.documentId === source.id) ?? null : null;
  const externalChunks = useMemo(() => {
    if (!current) return [];
    return current.config.selectedChapterIds.length
      ? current.chunks.filter((chunk) => chunk.chapterId && current.config.selectedChapterIds.includes(chunk.chapterId))
      : current.chunks;
  }, [current]);

  useEffect(() => {
    if (!source?.normalizedTextReference) { setPreview(""); return; }
    void sharedAssetStorage.get(source.normalizedTextReference).then(async (asset) => {
      if (!asset) return;
      const text = typeof asset.data === "string" ? asset.data : asset.data instanceof Blob ? await asset.data.text() : new TextDecoder().decode(asset.data);
      setPreview(text.slice(0, 24000));
    });
  }, [source?.normalizedTextReference]);

  const config = current?.config ?? DocumentAnalysisConfigSchema.parse({});
  const commit = (project: DocumentIngestionProject) => props.onUpdate({ ...project, modifiedAt: new Date().toISOString() });
  const patchConfig = (patch: Partial<DocumentAnalysisConfig>) => {
    if (current) commit({ ...current, config: DocumentAnalysisConfigSchema.parse({ ...current.config, ...patch }) });
  };

  const moveManifestItem = (itemId: string, direction: -1 | 1) => {
    if (!manifest || !current) return;
    const reordered = reorderManifestItem(manifest, itemId, direction);
    const documentOrder = new Map(reordered.items.map((item) => [item.documentId, item.order]));
    const chapters = [...current.chapters]
      .sort((left, right) => (documentOrder.get(left.documentId) ?? Number.MAX_SAFE_INTEGER) - (documentOrder.get(right.documentId) ?? Number.MAX_SAFE_INTEGER) || left.order - right.order)
      .map((chapter, order) => ({ ...chapter, order }));
    commit({ ...current, chapters, workImport: { ...current.workImport, manifests: [reordered, ...current.workImport.manifests.slice(1)] } });
  };

  const updateVersionDecision = (id: string, decision: DocumentIngestionProject["workImport"]["chapterVersions"][number]["decision"], selectedChapterId: string | null = null) => {
    if (!current) return;
    commit({ ...current, workImport: { ...current.workImport, chapterVersions: current.workImport.chapterVersions.map((item) => item.id === id ? { ...item, decision, selectedChapterId } : item) } });
  };

  const updateOcrCorrection = (pageNumber: number, correctedText: string) => {
    if (!current || !ocrJob) return;
    const corrected = applyOcrCorrection(ocrJob, pageNumber, correctedText);
    commit({ ...current, workImport: { ...current.workImport, ocrJobs: current.workImport.ocrJobs.map((item) => item.id === corrected.id ? corrected : item) } });
  };

  const upload = async (files?: FileList | File[]) => {
    const selectedFiles = files ? Array.from(files) : [];
    if (!selectedFiles.length) return;
    if (!permissionConfirmed) { setError("请先确认你拥有处理该文件的权利。"); return; }
    setBusy(true); setError(null); setNotice("正在校验文件并执行本地解析…");
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const project = createEmptyDocumentIngestionProject(props.projectId, selectedFiles.length === 1 ? selectedFiles[0].name.replace(/\.(txt|pdf|epub|docx|md|markdown)$/i, "") : `批量导入 ${new Date().toLocaleDateString("zh-CN")}`);
      project.config = DocumentAnalysisConfigSchema.parse({ ...project.config, allowExternalModel: allowExternal });
      props.onAdd(project);
      let manifest = createImportManifest(props.projectId, selectedFiles.map((file) => ({ name: file.name, size: file.size, type: file.type, relativePath: file.webkitRelativePath })));
      const documents: DocumentIngestionProject["documentSources"] = []; const chapters: DocumentIngestionProject["chapters"] = []; const chunks: DocumentIngestionProject["chunks"] = []; const offsetMaps: DocumentIngestionProject["offsetMaps"] = {};
      const normalizedTexts: string[] = []; const warnings: string[] = [];
      for (const item of [...manifest.items].sort((a, b) => a.order - b.order)) {
        const file = selectedFiles.find((value) => value.name === item.originalFilename && value.size === item.fileSize);
        if (!file || controller.signal.aborted) { item.status = controller.signal.aborted ? "cancelled" : "failed"; item.errors.push(controller.signal.aborted ? "任务已取消。" : "找不到所选文件。" ); continue; }
        item.status = "extracting";
        try {
          const parsed = await ingestLocalDocumentFile({ file, projectId: props.projectId, permissionConfirmed: true, storage: sharedAssetStorage,
            config: project.config, encoding: manualEncoding || undefined, pdfPassword: pdfPassword || undefined, signal: controller.signal,
            retainOriginalFile: retainOriginal, retainExtractedText: retainText, relativePath: item.relativePath });
          parsed.source.retainOriginalFile = retainOriginal; parsed.source.retainExtractedText = retainText; parsed.source.bundleId = manifest.id;
          documents.push(parsed.source); chapters.push(...parsed.chapters.map((chapter) => ({ ...chapter, order: chapters.length + chapter.order })));
          chunks.push(...parsed.chunks.map((chunk) => ({ ...chunk, order: chunks.length + chunk.order }))); offsetMaps[parsed.source.id] = parsed.offsetMap;
          if (parsed.normalizedText) normalizedTexts.push(parsed.normalizedText); warnings.push(...parsed.warnings);
          item.status = parsed.source.processingStatus === "ready_for_review" ? "ready_for_review" : parsed.source.processingStatus === "needs_ocr" ? "ocr" : "partially_completed";
          item.documentId = parsed.source.id; item.chapterIds = parsed.chapters.map((chapter) => chapter.id); item.warnings.push(...parsed.warnings);
        } catch (value) { item.status = "failed"; item.errors.push((value as Error).message); }
      }
      const completed = manifest.items.filter((item) => ["ready_for_review", "ocr", "partially_completed"].includes(item.status)); const failed = manifest.items.filter((item) => item.status === "failed");
      manifest = { ...manifest, status: controller.signal.aborted ? "cancelled" : failed.length ? (completed.length ? "partially_completed" : "failed") : "ready_for_review", checkpoint: { completedItemIds: completed.map((item) => item.id), failedItemIds: failed.map((item) => item.id), savedAt: new Date().toISOString() }, modifiedAt: new Date().toISOString() };
      const combinedText = normalizedTexts.join("\n\n");
      const stats = combinedText ? calculateStyleStatistics(combinedText, chapters.map((chapter) => chapter.endOffset - chapter.startOffset)) : null;
      const span = chunks[0]?.sourceSpans[0];
      const chapterVersions = resolveChapterVersions(chapters.map((chapter) => ({ id: chapter.id, title: chapter.title, text: chunks.filter((chunk) => chunk.chapterId === chapter.id).map((chunk) => chunk.text).join("") })));
      const next: DocumentIngestionProject = {
        ...project,
        status: completed.length ? "review" : "draft",
        documentSources: documents, selectedDocumentId: documents[0]?.id ?? null,
        chapters, chunks, offsetMaps, styleStatistics: stats,
        styleProfileCandidates: stats && span ? [styleStatisticsToProfileCandidate(span.documentId, chapters.map((chapter) => chapter.id), stats, [span])] : [],
        languageConstraintCandidates: stats && span ? createLanguageConstraintCandidates(span.documentId, stats, [span]) : [],
        workImport: { ...project.workImport, manifests: [manifest], chapterVersions },
        warnings: [...warnings, ...failed.flatMap((item) => item.errors.map((error) => `${item.originalFilename}：${error}`))], modifiedAt: new Date().toISOString(),
      };
      props.onUpdate(next); props.onSelect(next.id); setPreview(combinedText.slice(0, 24000)); setPanel(completed.length ? "chapters" : "preview");
      setNotice(failed.length ? `${completed.length} 个文件已解析，${failed.length} 个文件失败；可单独重新选择失败文件，不影响已完成结果。` : "本地解析完成。请确认卷章结构和重复版本，再决定是否提取候选资料。" );
    } catch (value) {
      setError(controller.signal.aborted ? "处理已取消；已完成的检查点会保留。" : `文件处理失败：${(value as Error).message}`);
    } finally {
      abortRef.current = null; setBusy(false); setPdfPassword(""); if (fileRef.current) fileRef.current.value = "";
    }
  };

  const loadMock = () => {
    const project = createMockDocumentIngestionProject(props.projectId);
    props.onAdd(project); props.onSelect(project.id); setPreview(""); setPanel("progress");
    setNotice("已载入完全离线的 Mock 示例；它包含文本 PDF、needs_ocr、别名消歧、候选资料和失败恢复案例。");
  };

  const analyzeExternal = async () => {
    if (!current || !props.isOnline || !allowExternal) return;
    const selectedChunks = current.config.selectedChapterIds.length
      ? current.chunks.filter((chunk) => chunk.chapterId && current.config.selectedChapterIds.includes(chunk.chapterId))
      : current.chunks;
    if (!selectedChunks.length) { setError("当前没有可分析的文本分块。"); return; }
    if (source && selectedChunks.length === 1 && selectedChunks[0].text.length >= Math.max(1, Math.floor(source.characterCount * 0.9))) {
      setError("当前唯一分块接近整本内容，已阻止外部发送。请缩小分块长度或仅选择部分章节后重试。");
      return;
    }
    setBusy(true); setError(null); setNotice("按检查点发送所选分块，不会一次发送整本小说；失败分块可有限重试。");
    const controller = new AbortController(); abortRef.current = controller;
    const resumable = [...current.tasks].reverse().find((task) => task.documentId === current.selectedDocumentId && ["partially_completed", "cancelled", "failed"].includes(task.status));
    const task = resumable ?? createIngestionTask(current.id, current.selectedDocumentId ?? selectedChunks[0].documentId);
    try {
      const result = await runExtractionTask({
        task,
        chunks: selectedChunks,
        previousItems: current.extractionItems,
        concurrency: current.config.concurrency,
        retryLimit: 2,
        signal: controller.signal,
        extractChunk: async (chunk, signal) => {
          const response = await fetch("/api/analyze-document", {
            method: "POST", headers: { "Content-Type": "application/json" }, signal,
            body: JSON.stringify({
              chunk: toProviderChunk(chunk), provider: current.config.provider, model: current.config.model,
              config: {
                depth: current.config.depth, characterScope: current.config.characterScope,
                extractMinorCharacters: current.config.extractMinorCharacters,
                extractLorebook: current.config.extractLorebook, extractCanon: current.config.extractCanon,
                extractTimeline: current.config.extractTimeline, extractPlotThreads: current.config.extractPlotThreads,
                extractForeshadow: current.config.extractForeshadow, analyzeStyle: current.config.analyzeStyle,
              },
            }),
          });
          const responseData = await response.json();
          if (!response.ok || !responseData.success) throw new Error(responseData.error || `请求失败 (${response.status})`);
          return ExtractionItemSchema.array().parse(responseData.data?.items ?? []);
        },
        onCheckpoint: (checkpoint) => {
          const progress = selectedChunks.length ? Math.round(((checkpoint.completedChunkIds.length + checkpoint.failedChunkIds.length) / selectedChunks.length) * 100) : 100;
          const runningTask = { ...task, status: "running" as const, stage: "analyzing", progress, checkpoint, completedChunkIds: checkpoint.completedChunkIds, failedChunkIds: checkpoint.failedChunkIds, modifiedAt: checkpoint.savedAt };
          props.onUpdate({ ...current, tasks: [...current.tasks.filter((item) => item.id !== task.id), runningTask], status: "processing", modifiedAt: checkpoint.savedAt });
        },
      });
      const consolidated = consolidateDocumentExtractions({
        ...current,
        tasks: [...current.tasks.filter((item) => item.id !== result.task.id), result.task],
        chunks: current.chunks.map((chunk) => result.chunks.find((item) => item.id === chunk.id) ?? chunk),
        extractionItems: result.items,
        status: result.task.status === "completed" ? "review" : "processing",
      }, result.items);
      commit(consolidated);
      setPanel("entities"); setNotice(`分块分析${result.task.status === "completed" ? "完成" : "部分完成"}：${result.items.length} 条带来源候选。`);
    } catch (value) {
      setError(controller.signal.aborted ? "模型分析已取消；本地资料未被修改。" : `模型分析失败：${(value as Error).message}`);
    } finally { abortRef.current = null; setBusy(false); }
  };

  const updateChapterTitle = (chapterId: string, title: string) => {
    if (current) commit({ ...current, chapters: renameDocumentChapter(current.chapters, chapterId, title) });
  };
  const moveChapter = (id: string, direction: -1 | 1) => current && commit({ ...current, chapters: reorderDocumentChapters(current.chapters, id, direction) });
  const splitChapter = (id: string) => {
    if (!current) return;
    const chapter = current.chapters.find((item) => item.id === id);
    if (!chapter) return;
    const paragraph = chapter.paragraphs[Math.max(1, Math.floor(chapter.paragraphs.length / 2))];
    const offset = paragraph?.startOffset ?? Math.floor((chapter.startOffset + chapter.endOffset) / 2);
    try { commit({ ...current, chapters: splitDocumentChapter(current.chapters, id, offset) }); }
    catch (value) { setError((value as Error).message); }
  };

  const resegmentChapters = async () => {
    if (!current || !source?.normalizedTextReference) { setError("提取文本不可用，无法重新识别章节。"); return; }
    try {
      const normalizedText = await sharedAssetStorage.readTextRange(source.normalizedTextReference, 0, source.characterCount + 1);
      const rawText = source.rawTextReference
        ? await sharedAssetStorage.readTextRange(source.rawTextReference, 0, Number.MAX_SAFE_INTEGER)
        : normalizedText;
      const chapters = segmentDocumentChapters(source.id, normalizedText, { customPattern: customChapterPattern || undefined });
      const chunks = planDocumentChunks({
        documentId: source.id, chapters,
        targetCharacters: current.config.targetChunkCharacters,
        overlapCharacters: current.config.overlapCharacters,
      });
      const offsetMap = current.offsetMaps[source.id] ?? [];
      const oldPageSpans = current.chunks.flatMap((chunk) => chunk.sourceSpans);
      chunks.forEach((chunk) => chunk.sourceSpans.forEach((span) => {
        const normalizedStart = span.characterStart;
        const normalizedEnd = span.characterEnd;
        const mapped = mapNormalizedRange(offsetMap, normalizedStart, normalizedEnd);
        const old = oldPageSpans.find((candidate) => candidate.characterStart <= mapped.rawStart && candidate.characterEnd >= mapped.rawStart);
        span.characterStart = mapped.rawStart;
        span.characterEnd = mapped.rawEnd;
        span.mappingStatus = mapped.status;
        span.rawTextExcerpt = rawText.slice(mapped.rawStart, Math.min(mapped.rawEnd, mapped.rawStart + 120));
        span.normalizedTextExcerpt = normalizedText.slice(normalizedStart, Math.min(normalizedEnd, normalizedStart + 120));
        span.pageStart = old?.pageStart ?? null;
        span.pageEnd = old?.pageEnd ?? null;
      }));
      commit({ ...current, chapters, chunks, tasks: [], extractionItems: [], warnings: [...current.warnings, "章节边界已修改；旧分块任务已清除，需要重新分析。"] });
      setNotice(`已按${customChapterPattern ? "自定义正则" : "内置规则"}重新识别 ${chapters.length} 个章节。`);
    } catch (value) { setError(`章节重新识别失败：${(value as Error).message}`); }
  };

  const runOcrForSource = async () => {
    if (!current || !source || source.processingStatus !== "needs_ocr") return;
    const original = await sharedAssetStorage.get(source.storageReference);
    if (!original) { setError("原 PDF 已删除，无法执行 OCR。请重新选择文件。" ); return; }
    setBusy(true); setError(null); setNotice("正在使用本机 OCR 逐页识别；可随时中止，已完成页会写入检查点。" );
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const bytes = new Uint8Array(original.data instanceof ArrayBuffer ? original.data : original.data instanceof Blob ? await original.data.arrayBuffer() : new TextEncoder().encode(original.data));
      let binary = ""; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + 0x8000)));
      const response = await fetch("/api/document-ingestion/ocr", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ pdfBase64: btoa(binary), languages: ["chi_sim", "eng"] }) });
      const payload = await response.json() as { success?: boolean; data?: Array<{ text: string; confidence: number; imageReference?: string }>; error?: string };
      if (!response.ok || !payload.success || !payload.data?.length) throw new Error(payload.error || "OCR 没有返回有效页面。" );
      const job = await runOcrJob({
        job: createOcrJob(source.id, payload.data.length, ["chi_sim", "eng"]), pages: payload.data.map(() => new Uint8Array()), signal: controller.signal,
        adapter: { id: "tesseract-cli", version: "local", async recognizePage(_data, pageNumber) { return payload.data![pageNumber - 1]; } },
        onCheckpoint: (value) => setNotice(`OCR：${value.checkpoint.completedPageNumbers.length}/${value.pageCount} 页已完成。`),
      });
      const rawText = job.pages.map((page) => page.correctedText ?? page.rawText).join("\n\n"); const normalized = normalizeDocumentText(rawText);
      const chapters = segmentDocumentChapters(source.id, normalized.normalizedText); const chunks = planDocumentChunks({ documentId: source.id, chapters, targetCharacters: current.config.targetChunkCharacters, overlapCharacters: current.config.overlapCharacters });
      let rawOffset = 0; const pageRanges = job.pages.map((page) => { const text = page.correctedText ?? page.rawText; const range = { page: page.pageNumber, start: rawOffset, end: rawOffset + text.length }; rawOffset = range.end + 2; return range; });
      chunks.forEach((chunk) => chunk.sourceSpans.forEach((span) => { const mapped = mapNormalizedRange(normalized.offsetMap, span.characterStart, span.characterEnd); const page = pageRanges.find((item) => mapped.rawStart >= item.start && mapped.rawStart <= item.end); span.characterStart = mapped.rawStart; span.characterEnd = mapped.rawEnd; span.mappingStatus = mapped.status; span.pageStart = page?.page ?? null; span.pageEnd = page?.page ?? null; span.ocrPage = page?.page ?? null; span.ocrVersion = job.adapterVersion; span.rawTextExcerpt = rawText.slice(mapped.rawStart, Math.min(mapped.rawEnd, mapped.rawStart + 120)); }));
      const rawId = `asset:${source.id}:raw-text`; const normalizedId = `asset:${source.id}:normalized-text`;
      await sharedAssetStorage.put(createDocumentAssetRecord({ id: rawId, documentId: source.id, projectId: current.projectId, kind: "raw_text", mimeType: "text/plain", data: rawText, contentHash: `${source.contentHash}:ocr-raw` }));
      await sharedAssetStorage.put(createDocumentAssetRecord({ id: normalizedId, documentId: source.id, projectId: current.projectId, kind: "normalized_text", mimeType: "text/plain", data: normalized.normalizedText, contentHash: `${source.contentHash}:ocr-normalized` }));
      const updatedSource = { ...source, processingStatus: job.status === "ready_for_review" ? "ready_for_review" as const : "partially_completed" as const, processingProgress: job.progress, currentStage: "等待确认", rawTextReference: rawId, normalizedTextReference: normalizedId, pageCount: job.pageCount, chapterCount: chapters.length, paragraphCount: chapters.reduce((sum, chapter) => sum + chapter.paragraphs.length, 0), characterCount: normalized.normalizedText.length, tokenEstimate: Math.ceil(normalized.normalizedText.length / 2), ocrJobId: job.id, warnings: [...source.warnings, ...job.pages.flatMap((page) => page.warnings)] };
      commit({ ...current, documentSources: current.documentSources.map((item) => item.id === source.id ? updatedSource : item), chapters: [...current.chapters.filter((item) => item.documentId !== source.id), ...chapters], chunks: [...current.chunks.filter((item) => item.documentId !== source.id), ...chunks], offsetMaps: { ...current.offsetMaps, [source.id]: normalized.offsetMap }, workImport: { ...current.workImport, ocrJobs: [...current.workImport.ocrJobs.filter((item) => item.id !== job.id), job], sourceMaps: [...current.workImport.sourceMaps, ...job.pages.flatMap((page) => page.sourceMap ? [page.sourceMap] : [])] } });
      setPreview(normalized.normalizedText.slice(0, 24000)); setNotice("OCR 已完成。原始识别结果与后续人工修正会分别保留，请在卷章结构中继续校对。" );
    } catch (value) { setError(controller.signal.aborted ? "OCR 已取消；已完成页的检查点仍会保留。" : `OCR 失败：${(value as Error).message}`); }
    finally { abortRef.current = null; setBusy(false); }
  };

  const markCharacterCardWritten = (id: string) => {
    if (!current) return;
    const draft = current.characterCardDrafts.find((item) => item.id === id);
    if (!draft) return;
    if (props.existingCharacterName && !window.confirm(`当前已有角色“${props.existingCharacterName}”。仅在确认后载入候选草稿，原卡不会静默覆盖。是否继续？`)) return;
    props.onWriteCharacterCard(draft.card);
    commit({ ...current, characterCardDrafts: current.characterCardDrafts.map((item) => item.id === id ? { ...item, decision: "confirmed", writeMode: props.existingCharacterName ? "compare" : "new" } : item) });
  };

  const openSourceSpan = async (span?: SourceSpan) => {
    if (!current || !span) { setError("该候选没有可用的 Source Span。"); return; }
    const document = current.documentSources.find((item) => item.id === span.documentId);
    if (!document || span.mappingStatus === "unmapped") {
      setError("该来源映射无效，不能显示为有效原文依据。");
      return;
    }
    if (document.rawTextReference) {
      const start = Math.max(0, span.characterStart - 180);
      const end = span.characterEnd + 180;
      try {
        const excerpt = await sharedAssetStorage.readTextRange(document.rawTextReference, start, end);
        setPreview(`${sourceLabel({ sourceSpans: [span] }, current.documentSources)}\n\n${excerpt}`);
      } catch { setPreview(span.rawTextExcerpt || span.normalizedTextExcerpt || "来源资产不可用。"); }
    } else setPreview(span.rawTextExcerpt || span.normalizedTextExcerpt || "原文件已删除，仅保留结构化来源位置。");
    if (current.selectedDocumentId !== document.id) commit({ ...current, selectedDocumentId: document.id });
    setPanel("preview");
  };

  const renderSource = (candidate: { sourceSpans: SourceSpan[] }) => <div className="source-span-row">
    <span className="field-hint">{sourceLabel(candidate, current?.documentSources)}</span>
    <button className="btn-secondary" disabled={!candidate.sourceSpans.length || candidate.sourceSpans[0].mappingStatus === "unmapped"} onClick={() => void openSourceSpan(candidate.sourceSpans[0])}>查看原文位置</button>
  </div>;

  const exportIngestion = () => {
    if (!current) return;
    const blob = new Blob([exportDocumentIngestionJSON(current)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeDocumentIngestionFilename(current.name)}.document-ingestion.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importIngestion = async (file?: File) => {
    if (!file) return;
    try {
      const imported = importDocumentIngestionJSON(await readValidatedJsonFile(file));
      props.onAdd({ ...imported, id: imported.id === current?.id ? `${imported.id}-imported-${Date.now()}` : imported.id, modifiedAt: new Date().toISOString() });
      setNotice("结构化解析 JSON 已导入；原文件资产不包含在该文件中，来源跳转可能需要重新关联原文件。");
    } catch (value) { setError(`解析 JSON 导入失败：${(value as Error).message}`); }
    finally { if (ingestionJsonRef.current) ingestionJsonRef.current.value = ""; }
  };

  const reportCounts = useMemo(() => current ? [
    ["人物", current.characterCandidates.length], ["关系", current.relationshipCandidates.length],
    ["角色卡草稿", current.characterCardDrafts.length], ["世界书草稿", current.lorebookDrafts.length],
    ["Canon 候选", current.canonCandidates.length], ["剧情线", current.plotThreadCandidates.length],
  ] as const : [], [current]);

  return <div className="document-ingestion-workspace">
    <aside className="card ingestion-project-list" aria-label="导入项目列表">
      <div className="card-header"><span>作品导入与重建</span><button className="btn-secondary" onClick={loadMock}>载入示例</button></div>
      {props.projects.length === 0 ? <p className="field-hint">尚未导入文件。手机和桌面均可选择 TXT、PDF、EPUB、DOCX、Markdown 或混合文件。</p> : props.projects.map((project) => <button key={project.id} className={`navigation-item ${project.id === current?.id ? "is-active" : ""}`} onClick={() => props.onSelect(project.id)}><strong>{project.name}</strong><span>{project.status} · {project.documentSources.length} 个文件</span></button>)}
      {current && <button className="btn-danger" onClick={async () => {
        if (!window.confirm("删除全部导入数据？结构化候选和本地文件资产都会删除，现有角色卡、世界书与 Canon 不受影响。")) return;
        await Promise.all(current.documentSources.map((item) => sharedAssetStorage.deleteDocument(item.id)));
        props.onDelete(current.id);
      }}>删除全部导入数据</button>}
    </aside>

    <main className="ingestion-main">
      <ol className="workflow-step-list" aria-label="作品导入与重建步骤">{WORKFLOW_STEPS.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
      <div className="card ingestion-step-tabs" role="tablist" aria-label="小说解析步骤">
        {PANELS.map(([id, label]) => <button key={id} role="tab" aria-selected={panel === id} className={`tab ${panel === id ? "active" : ""}`} onClick={() => setPanel(id)}>{label}</button>)}
      </div>
      {!props.isOnline && <div className="global-banner warning" role="status"><div><strong>当前离线</strong><span>仅本地解析仍可用；外部模型分析已禁用。</span></div></div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      {error && <div className="error-message" role="alert">{error}</div>}

      {panel === "upload" && <section className="card">
        <div className="card-header"><span>上传与权限</span></div>
        <p>文件只在你明确许可的范围内处理。默认不把整本小说发送给外部服务，也不在日志中记录正文；重要候选通过 Source Span 追踪回原文。</p>
        <label className="check-row"><input type="checkbox" checked={permissionConfirmed} onChange={(event) => setPermissionConfirmed(event.target.checked)} />我确认拥有处理该文件的权利</label>
        <label className="check-row"><input type="checkbox" checked={allowExternal} onChange={(event) => setAllowExternal(event.target.checked)} />允许本地提取后，将所选文本分块发送给模型供应商</label>
        <label className="check-row"><input type="checkbox" checked={retainOriginal} onChange={(event) => setRetainOriginal(event.target.checked)} />保留原文件以支持来源跳转</label>
        <label className="check-row"><input type="checkbox" checked={retainText} onChange={(event) => setRetainText(event.target.checked)} />保留提取文本</label>
        <label>TXT 编码（自动判断不可靠时手动选择）<select value={manualEncoding} onChange={(event) => setManualEncoding(event.target.value as typeof manualEncoding)}><option value="">自动检测</option><option value="utf-8">UTF-8</option><option value="utf-16le">UTF-16 LE</option><option value="utf-16be">UTF-16 BE</option><option value="gb18030">GB18030</option></select></label>
        <label>PDF 密码（仅用于本次解析，不保存）<input type="password" autoComplete="off" value={pdfPassword} onChange={(event) => setPdfPassword(event.target.value)} /></label>
        <div className="button-row"><button className="btn-primary" disabled={busy || !permissionConfirmed} onClick={() => fileRef.current?.click()}>{busy ? "处理中…" : "选择一个或多个文件"}</button>{busy && <button className="btn-danger" onClick={() => abortRef.current?.abort()}>中止处理</button>}<button className="btn-secondary" onClick={loadMock}>查看示例流程</button></div>
        <input ref={fileRef} hidden multiple type="file" accept="text/plain,text/markdown,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,.pdf,.epub,.docx,.md,.markdown" onChange={(event) => void upload(event.target.files ?? undefined)} />
        {manifest && <div className="candidate-card"><strong>文件清单与顺序</strong>{[...manifest.items].sort((a, b) => a.order - b.order).map((item, index, items) => <div className="chapter-review-row" key={item.id}><button className="navigation-item" onClick={() => item.documentId && current && commit({ ...current, selectedDocumentId: item.documentId })}><strong>{item.relativePath || item.originalFilename}</strong><span>{item.format.toUpperCase()} · {item.status}{item.errors.length ? ` · ${item.errors.join("；")}` : ""}</span></button><div className="button-row"><button className="btn-secondary" disabled={index === 0} onClick={() => moveManifestItem(item.id, -1)}>上移</button><button className="btn-secondary" disabled={index === items.length - 1} onClick={() => moveManifestItem(item.id, 1)}>下移</button></div></div>)}</div>}
        <p className="field-hint">默认单文件上限 50 MiB。扫描型 PDF 可在 OCR 校对步骤使用本机 Tesseract 与 Poppler；未安装时会明确提示。</p>
      </section>}

      {panel === "preview" && <section className="card"><div className="card-header"><span>内容预览</span></div>{source ? <><dl className="mini-facts"><div><dt>文件</dt><dd>{source.originalFilename}</dd></div><div><dt>编码</dt><dd>{source.encoding || (source.fileExtension === ".pdf" ? "PDF 文本层或 OCR" : "结构化文档")}</dd></div><div><dt>页数</dt><dd>{source.pageCount ?? "不适用"}</dd></div><div><dt>状态</dt><dd>{source.processingStatus}</dd></div></dl>{source.processingStatus === "needs_ocr" && <button className="btn-primary" disabled={busy} onClick={() => void runOcrForSource()}>执行本地 OCR</button>}<pre className="document-preview">{preview || "提取文本未保留或当前资产不可用。"}</pre>{ocrJob && <details open><summary>OCR 校对 · {ocrJob.checkpoint.completedPageNumbers.length}/{ocrJob.pageCount} 页</summary>{ocrJob.pages.map((page) => <label key={page.pageNumber}>第 {page.pageNumber} 页 · 置信度 {Math.round(page.confidence * 100)}%<textarea rows={8} value={page.correctedText ?? page.rawText} onChange={(event) => updateOcrCorrection(page.pageNumber, event.target.value)} /><span className="field-hint">原始 OCR 始终保留；这里保存的是独立校对文本。{page.warnings.join("；")}</span></label>)}</details>}{source.warnings.map((item) => <p key={item} className="migration-error">{item}</p>)}</> : <div className="empty-state">请先上传文件。</div>}</section>}

      {panel === "chapters" && <section className="card"><div className="card-header"><span>卷章结构</span></div><label>自定义章节正则<input value={customChapterPattern} onChange={(event) => setCustomChapterPattern(event.target.value)} placeholder="例如：^第[一二三四五六七八九十]+幕" /></label><button className="btn-secondary" disabled={!current} onClick={() => void resegmentChapters()}>按当前规则重新识别章节</button>{current?.chapters.map((chapter, index) => <div className="chapter-review-row" key={chapter.id}><label className="check-row"><input type="checkbox" checked={!current.config.selectedChapterIds.length || current.config.selectedChapterIds.includes(chapter.id)} onChange={(event) => { const selected = current.config.selectedChapterIds.length ? current.config.selectedChapterIds : current.chapters.map((item) => item.id); patchConfig({ selectedChapterIds: event.target.checked ? [...new Set([...selected, chapter.id])] : selected.filter((id) => id !== chapter.id) }); }} />参与分析</label><input aria-label={`章节 ${index + 1} 标题`} value={chapter.title} onChange={(event) => updateChapterTitle(chapter.id, event.target.value)} /><span className="field-hint">{chapter.detectionMethod} · {Math.round(chapter.confidence * 100)}% · {chapter.startOffset}–{chapter.endOffset}</span><div className="button-row"><button className="btn-secondary" disabled={index === 0} onClick={() => moveChapter(chapter.id, -1)}>上移</button><button className="btn-secondary" disabled={index === (current?.chapters.length ?? 0) - 1} onClick={() => moveChapter(chapter.id, 1)}>下移</button><button className="btn-secondary" onClick={() => splitChapter(chapter.id)}>拆分</button><button className="btn-secondary" disabled={index === (current?.chapters.length ?? 0) - 1} onClick={() => current && commit({ ...current, chapters: mergeDocumentChapters(current.chapters, chapter.id, current.chapters[index + 1].id) })}>与下一章合并</button></div></div>)}{Boolean(current?.workImport.chapterVersions.length) && <><h3>重复与版本</h3>{current!.workImport.chapterVersions.map((version) => <div className="candidate-card" key={version.id}><strong>{version.relation} · {Math.round(version.similarity * 100)}%</strong><p>{version.chapterIds.map((id) => current!.chapters.find((chapter) => chapter.id === id)?.title ?? id).join(" / ")}</p><p>{version.reasons.join("；")}</p><div className="button-row"><button className="btn-secondary" onClick={() => updateVersionDecision(version.id, "keep_all")}>保留全部</button>{version.chapterIds.map((id) => <button key={id} className="btn-secondary" onClick={() => updateVersionDecision(version.id, "use_one", id)}>采用 {current!.chapters.find((chapter) => chapter.id === id)?.title ?? "此版本"}</button>)}<button className="btn-secondary" onClick={() => updateVersionDecision(version.id, "defer")}>暂不处理</button></div><span className="field-hint">当前决定：{version.decision}</span></div>)}</>}{!current?.chapters.length && <div className="empty-state">没有识别到章节边界；系统会保留“未分章内容”，可继续手动整理。</div>}</section>}

      {panel === "config" && <section className="card"><div className="card-header"><span>解析配置</span></div><div className="form-grid"><label>处理深度<select value={config.depth} onChange={(event) => patchConfig({ depth: event.target.value as DocumentAnalysisConfig["depth"] })}><option value="quick">快速：实体、章节与基础统计，较少请求</option><option value="standard">标准：人物、关系、世界与剧情线</option><option value="deep">深入：增加跨块合并、状态、伏笔与文风解释</option></select></label><label>目标分块字符数<input type="number" min={100} max={50000} value={config.targetChunkCharacters} onChange={(event) => patchConfig({ targetChunkCharacters: Number(event.target.value) })} /></label><label>重叠字符数<input type="number" min={0} max={5000} value={config.overlapCharacters} onChange={(event) => patchConfig({ overlapCharacters: Number(event.target.value) })} /></label><label>并发请求数<input type="number" min={1} max={5} value={config.concurrency} onChange={(event) => patchConfig({ concurrency: Number(event.target.value) })} /></label></div>{(["extractMinorCharacters", "extractLorebook", "extractCanon", "extractTimeline", "extractPlotThreads", "extractForeshadow", "analyzeStyle"] as const).map((key) => <label className="check-row" key={key}><input type="checkbox" checked={config[key]} onChange={(event) => patchConfig({ [key]: event.target.checked })} />{{ extractMinorCharacters: "提取次要人物", extractLorebook: "生成世界书草稿", extractCanon: "生成 Canon 候选", extractTimeline: "提取时间线", extractPlotThreads: "提取剧情线", extractForeshadow: "提取伏笔候选", analyzeStyle: "分析文风" }[key]}</label>)}<details><summary>查看将发送给外部模型的 {externalChunks.length} 个区块</summary>{externalChunks.map((chunk) => <div className="candidate-card" key={chunk.id}><strong>区块 {chunk.order + 1} · {current?.chapters.find((chapter) => chapter.id === chunk.chapterId)?.title ?? "未分章"}</strong><p>{chunk.text.slice(0, 280)}{chunk.text.length > 280 ? "…" : ""}</p><span className="field-hint">{chunk.text.length} 字符 · 估算 {chunk.estimatedTokens} tokens · 字符范围 {chunk.startOffset}–{chunk.endOffset}</span></div>)}</details><div className="button-row"><button className="btn-primary" disabled={busy || !props.isOnline || !allowExternal || !current} onClick={() => void analyzeExternal()}>外部模型分析 / 恢复失败分块</button><button className="btn-secondary" disabled={!current} onClick={() => setPanel("progress")}>仅保存本地解析配置</button>{busy && <button className="btn-danger" onClick={() => abortRef.current?.abort()}>中止并保存检查点</button>}</div><p className="field-hint">模型请求按分块估算；不会一次发送整本小说。清单展示每个区块实际发送的开头、范围和估算量。</p></section>}

      {panel === "progress" && <section className="card"><div className="card-header"><span>处理进度与检查点</span></div>{source && <><progress max={100} value={source.processingProgress}>{source.processingProgress}%</progress><p>{source.currentStage} · {source.processingStatus}</p></>}{current?.tasks.map((task) => <details key={task.id} open><summary>{task.stage} · {task.status} · {task.progress}%</summary><p>完成 {task.completedChunkIds.length} 块；失败 {task.failedChunkIds.length} 块；检查点 {task.checkpoint.savedAt}</p><button className="btn-secondary" onClick={() => setPanel("config")}>从检查点恢复 / 重试失败分块</button></details>)}{!current?.tasks.length && <p>本地解析已增量保存；模型分析尚未创建长任务。</p>}</section>}

      {panel === "entities" && <section className="card"><div className="card-header"><span>实体与消歧候选</span></div>{current?.entityResolutions.map((item) => <details key={item.id}><summary>{item.result} · {item.confidence}</summary><p>{item.reasons.join("；")}</p><p className="field-hint">probably_same 与 uncertain 不会自动合并，必须人工审查。</p></details>)}{current?.extractionItems.map((item) => <details key={item.id}><summary>{item.type} · {item.normalizedName || item.originalExpression}</summary><p>{item.content}</p>{renderSource(item)}</details>)}</section>}

      {panel === "characters" && <section className="card"><div className="card-header"><span>人物候选</span></div>{current?.characterCandidates.map((item) => <details key={item.id}><summary>{item.name} · {item.confidence} · {item.authority}</summary><p>别名：{item.aliases.join("、") || "无"}</p><p>稳定特征：{item.stableTraits.join("、") || "unknown"}</p><p>情境性表现：{item.situationalBehaviors.join("、") || "无"}</p><p>目标：{item.goals.join("、") || "unknown"}</p>{renderSource(item)}</details>)}</section>}

      {panel === "relationships" && <section className="card"><div className="card-header"><span>关系候选</span></div>{current?.relationshipCandidates.map((item) => <details key={item.id}><summary>{item.name} · {item.relationType}</summary><p>公开：{item.publicRelationship || "unknown"}；实际：{item.actualRelationship || "unknown"}</p><p>当前：{item.currentState || "unknown"}；单向判断：{item.directional ? "是" : "否"}</p>{renderSource(item)}</details>)}</section>}

      {panel === "cards" && <section className="card"><div className="card-header"><span>角色卡草稿</span></div><p className="field-hint">所有角色卡保持 draft；同名角色只允许比较或生成合并候选，不静默覆盖。</p>{current?.characterCardDrafts.map((item) => <div className="candidate-card" key={item.id}><strong>{item.card.data.name}</strong><p>{item.card.data.description || "信息不足，字段保持空白。"}</p>{renderSource(item)}<button className="btn-primary" disabled={item.decision === "confirmed"} onClick={() => markCharacterCardWritten(item.id)}>{props.existingCharacterName ? "比较并写入角色卡草稿" : "写入角色卡草稿"}</button></div>)}</section>}

      {panel === "lorebook" && <section className="card"><div className="card-header"><span>世界书草稿</span></div>{current?.lorebookDrafts.map((item) => <div className="candidate-card" key={item.id}><strong>{item.lorebook.name}</strong><p>{item.lorebook.entries.length} 个独立条目；关键词与来源保留在格式专属数据中。</p><button className="btn-primary" disabled={item.decision === "confirmed"} onClick={() => { props.onWriteLorebook(item.lorebook); current && commit({ ...current, lorebookDrafts: current.lorebookDrafts.map((value) => value.id === item.id ? { ...value, decision: "confirmed" } : value) }); }}>写入世界书草稿</button></div>)}</section>}

      {panel === "canon" && <section className="card"><div className="card-header"><span>Canon、状态、时间线与剧情线候选</span></div><p className="field-hint">候选默认 pending，只有点击确认才进入现有模块，且仍保持 candidate 状态。</p>{[...(current?.canonCandidates ?? []), ...(current?.stateCandidates ?? []), ...(current?.timelineCandidates ?? []), ...(current?.plotThreadCandidates ?? []), ...(current?.openQuestionCandidates ?? []), ...(current?.foreshadowCandidates ?? [])].map((item) => <div className="candidate-card" key={item.id}><strong>{item.candidateType} · {item.name}</strong><p>{item.content}</p>{renderSource(item)}<button className="btn-secondary" disabled={item.decision === "confirmed"} onClick={() => { props.onWriteCanonCandidate(item); if (current) { const keys = ["canonCandidates", "stateCandidates", "timelineCandidates", "plotThreadCandidates", "openQuestionCandidates", "foreshadowCandidates"] as const; const key = keys.find((value) => current[value].some((candidate) => candidate.id === item.id)); if (key) commit({ ...current, [key]: current[key].map((candidate) => candidate.id === item.id ? { ...candidate, decision: "confirmed" } : candidate) }); } }}>确认为项目候选</button></div>)}</section>}

      {panel === "style" && <section className="card"><div className="card-header"><span>文风档案</span></div>{current?.styleStatistics && <dl className="mini-facts"><div><dt>字符数</dt><dd>{current.styleStatistics.characterCount}</dd></div><div><dt>对话比例</dt><dd>{Math.round(current.styleStatistics.dialogueRatio * 100)}%</dd></div><div><dt>人称倾向</dt><dd>{current.styleStatistics.pronounPreference}</dd></div><div><dt>句长样本</dt><dd>{current.styleStatistics.sentenceLengths.length}</dd></div></dl>}{current?.styleProfileCandidates.map((item) => <div className="candidate-card" key={item.id}><strong>{item.profile.name}</strong><p>{item.profile.overallTone} · 样本 {item.sampleRange}</p><p className="field-hint">统计由程序确定性计算；模型解释不能承诺复制作者独特文风。</p><button className="btn-primary" disabled={item.decision === "confirmed"} onClick={() => { props.onWriteStyleProfile(item.profile); current && commit({ ...current, styleProfileCandidates: current.styleProfileCandidates.map((value) => value.id === item.id ? { ...value, decision: "confirmed", userConfirmed: true } : value) }); }}>确认 Style Profile 候选</button></div>)}{Boolean(current?.languageConstraintCandidates.length) && <button className="btn-secondary" onClick={() => { const pending = current!.languageConstraintCandidates.filter((item) => item.decision !== "confirmed"); props.onWriteLanguageConstraints(pending.map((item) => item.constraint)); commit({ ...current!, languageConstraintCandidates: current!.languageConstraintCandidates.map((item) => ({ ...item, decision: "confirmed" })) }); }}>确认 {current!.languageConstraintCandidates.length} 条 Language Constraint 候选</button>}</section>}

      {panel === "report" && <section className="card">
        <div className="card-header"><span>解析报告</span></div>
        {current ? <>
          <dl className="mini-facts">{reportCounts.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
          <h3>来源追踪</h3>
          <p>所有重要结论均应携带 Source Span，可跳转到文档、章节、页码和字符范围。无效或缺失映射不会显示为有效依据。</p>
          <h3>隐私与写入</h3>
          <p>现有角色卡、世界书、规划、正文和已确认 Canon 不会自动覆盖。候选只有经用户确认才写入对应模块。</p>
          <h3>重建方案</h3>
          <div className="button-row"><label>目标<select value={rebuildMode} onChange={(event) => setRebuildMode(event.target.value as typeof rebuildMode)}><option value="supplement">补充当前项目</option><option value="new">创建新的项目数据</option></select></label><button className="btn-secondary" onClick={() => setRebuildPlan(planProjectRebuild({ ingestion: current, mode: rebuildMode, target: props.projectDraft }))}>生成重建方案</button></div>
          {rebuildPlan && <div className="candidate-card"><strong>{rebuildPlan.operations.length} 项待审查操作</strong><p>新增 {rebuildPlan.operations.filter((item) => item.action === "add").length}；新版本 {rebuildPlan.operations.filter((item) => item.action === "create_version").length}；冲突 {rebuildPlan.operations.filter((item) => item.conflict).length}。</p>{rebuildPlan.conflicts.map((conflict) => <div className="chapter-review-row" key={conflict.id}><span>{conflict.description}</span><div className="button-row"><button className="btn-secondary" onClick={() => setRebuildPlan({ ...rebuildPlan, conflicts: rebuildPlan.conflicts.map((item) => item.id === conflict.id ? { ...item, resolution: "keep_existing" } : item) })}>保留现有</button><button className="btn-secondary" onClick={() => setRebuildPlan({ ...rebuildPlan, conflicts: rebuildPlan.conflicts.map((item) => item.id === conflict.id ? { ...item, resolution: "keep_both" } : item) })}>保留两者</button><button className="btn-secondary" onClick={() => setRebuildPlan({ ...rebuildPlan, conflicts: rebuildPlan.conflicts.map((item) => item.id === conflict.id ? { ...item, resolution: "skip" } : item) })}>跳过</button></div><span className="field-hint">处理方式：{conflict.resolution}</span></div>)}<button className="btn-primary" disabled={!props.projectDraft || !props.onReplaceProjectDraft || rebuildPlan.conflicts.some((item) => item.resolution === "pending")} onClick={() => { if (!props.projectDraft || !props.onReplaceProjectDraft || !window.confirm("确认执行已审查的重建方案？现有内容会保留，正文写入新版本，资料写入草稿或候选。")) return; const executed = executeProjectRebuildPlan({ draft: props.projectDraft, ingestion: current, plan: { ...rebuildPlan, confirmed: true } }); const updatedIngestion = { ...current, workImport: { ...current.workImport, rebuildPlans: [...current.workImport.rebuildPlans, { ...rebuildPlan, confirmed: true }], rebuildResults: [...current.workImport.rebuildResults, executed.result] } }; const nextDraft = { ...executed.draft, documentIngestions: [...executed.draft.documentIngestions.filter((item) => item.id !== current.id), updatedIngestion], selectedDocumentIngestionId: current.id }; props.onReplaceProjectDraft(nextDraft); setNotice(`写入结果：${executed.result.status}，成功 ${executed.result.log.filter((item) => item.status === "completed").length} 项。`); }}>确认并写入</button><p className="field-hint">存在未处理冲突时不会执行写入；失败操作可根据操作日志重试，成功项不会重复写入。</p></div>}
          <div className="button-row"><button className="btn-secondary" onClick={async () => {
            if (!source || !window.confirm("删除原文件和提取文本，但保留结构化候选？删除后来源跳转将不可用。")) return;
            await sharedAssetStorage.deleteDocument(source.id);
            commit({
              ...current,
              documentSources: current.documentSources.map((item) => item.id === source.id ? {
                ...item, storageReference: `deleted:${item.id}`, rawTextReference: null, normalizedTextReference: null,
                retainOriginalFile: false, retainExtractedText: false,
                warnings: [...item.warnings, "原文件和提取文本已按用户要求删除。"],
              } : item),
              chapters: current.chapters.map((chapter) => chapter.documentId === source.id
                ? { ...chapter, paragraphs: chapter.paragraphs.map((paragraph) => ({ ...paragraph, text: "" })) }
                : chapter),
              chunks: current.chunks.map((chunk) => chunk.documentId === source.id ? { ...chunk, text: "" } : chunk),
            });
            setPreview("");
          }}>删除原文件，保留结构化结果</button><button className="btn-secondary" onClick={exportIngestion}>导出解析 JSON</button><button className="btn-secondary" onClick={() => ingestionJsonRef.current?.click()}>导入解析 JSON</button><input ref={ingestionJsonRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importIngestion(event.target.files?.[0])} /></div>
        </> : <div className="empty-state">尚无解析报告。</div>}
      </section>}
    </main>
  </div>;
}
