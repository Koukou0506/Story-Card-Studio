import { ImportSourceMapSchema, OcrJobSchema, type OcrJob, workImportId, workImportNow } from "@/domain/work-import";

export interface OcrPageRecognition { text: string; confidence: number; imageReference?: string; region?: { x: number; y: number; width: number; height: number }; }
export interface OcrAdapter {
  readonly id: string; readonly version: string;
  recognizePage(data: Uint8Array, pageNumber: number, languages: OcrJob["languages"], signal?: AbortSignal): Promise<OcrPageRecognition>;
}
export interface RunOcrJobOptions {
  job: OcrJob; pages: Uint8Array[]; adapter: OcrAdapter; signal?: AbortSignal; retryFailedOnly?: boolean;
  onCheckpoint?: (job: OcrJob) => Promise<void> | void; lowConfidenceThreshold?: number;
}

export function createOcrJob(documentId: string, pageCount: number, languages: OcrJob["languages"]): OcrJob {
  const now = workImportNow();
  return OcrJobSchema.parse({
    id: workImportId("ocr_job"), documentId, pageCount, languages, createdAt: now, modifiedAt: now,
    checkpoint: { completedPageNumbers: [], failedPageNumbers: [], savedAt: now },
    pages: Array.from({ length: pageCount }, (_, index) => ({ pageNumber: index + 1, modifiedAt: now })),
  });
}

export async function runOcrJob(options: RunOcrJobOptions): Promise<OcrJob> {
  let job = OcrJobSchema.parse(structuredClone(options.job));
  const low = options.lowConfidenceThreshold ?? 0.6;
  const retry = new Set(job.checkpoint.failedPageNumbers);
  for (let index = 0; index < Math.min(job.pageCount, options.pages.length); index += 1) {
    const pageNumber = index + 1;
    if (options.retryFailedOnly && !retry.has(pageNumber)) continue;
    if (!options.retryFailedOnly && job.checkpoint.completedPageNumbers.includes(pageNumber)) continue;
    if (options.signal?.aborted) {
      job = OcrJobSchema.parse({ ...job, status: "cancelled", modifiedAt: workImportNow() }); await options.onCheckpoint?.(job); return job;
    }
    const pages = job.pages.map((page) => page.pageNumber === pageNumber ? { ...page, status: "processing" as const, modifiedAt: workImportNow() } : page);
    job = OcrJobSchema.parse({ ...job, status: "ocr", pages, adapterId: options.adapter.id, adapterVersion: options.adapter.version, modifiedAt: workImportNow() });
    try {
      const result = await options.adapter.recognizePage(options.pages[index], pageNumber, job.languages, options.signal);
      const warnings = result.confidence < low ? [`本页 OCR 置信度较低（${Math.round(result.confidence * 100)}%），请人工校对。`] : [];
      job.pages = job.pages.map((page) => page.pageNumber === pageNumber ? {
        ...page, status: "completed", rawText: result.text, confidence: result.confidence, imageReference: result.imageReference ?? page.imageReference,
        warnings, error: null, sourceMap: ImportSourceMapSchema.parse({ documentId: job.documentId, characterStart: 0, characterEnd: result.text.length, rawExcerpt: result.text.slice(0, 240), ocrPage: pageNumber, ocrRegion: result.region ?? null, confidence: result.confidence }), modifiedAt: workImportNow(),
      } : page);
      job.checkpoint.completedPageNumbers = [...new Set([...job.checkpoint.completedPageNumbers, pageNumber])].sort((a, b) => a - b);
      job.checkpoint.failedPageNumbers = job.checkpoint.failedPageNumbers.filter((value) => value !== pageNumber);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        job.status = "cancelled"; job.modifiedAt = workImportNow(); await options.onCheckpoint?.(OcrJobSchema.parse(job)); return OcrJobSchema.parse(job);
      }
      job.pages = job.pages.map((page) => page.pageNumber === pageNumber ? { ...page, status: "failed", error: (error as Error).message, modifiedAt: workImportNow() } : page);
      job.checkpoint.failedPageNumbers = [...new Set([...job.checkpoint.failedPageNumbers, pageNumber])].sort((a, b) => a - b);
    }
    job.progress = Math.round(((job.checkpoint.completedPageNumbers.length + job.checkpoint.failedPageNumbers.length) / job.pageCount) * 100);
    job.checkpoint.savedAt = workImportNow(); job.modifiedAt = job.checkpoint.savedAt;
    await options.onCheckpoint?.(OcrJobSchema.parse(job));
  }
  job.status = job.checkpoint.failedPageNumbers.length ? (job.checkpoint.completedPageNumbers.length ? "partially_completed" : "failed") : "ready_for_review";
  job.progress = job.status === "ready_for_review" ? 100 : job.progress; job.modifiedAt = workImportNow();
  return OcrJobSchema.parse(job);
}

export function applyOcrCorrection(job: OcrJob, pageNumber: number, correctedText: string): OcrJob {
  if (!job.pages.some((page) => page.pageNumber === pageNumber)) throw new Error("OCR 页不存在。" );
  return OcrJobSchema.parse({
    ...job,
    pages: job.pages.map((page) => page.pageNumber === pageNumber ? { ...page, correctedText, modifiedAt: workImportNow() } : page),
    modifiedAt: workImportNow(),
  });
}
