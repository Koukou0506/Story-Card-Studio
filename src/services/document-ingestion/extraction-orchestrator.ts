import {
  IngestionTaskSchema,
  type DocumentChunk,
  type ExtractionItem,
  type IngestionCheckpoint,
  type IngestionTask,
} from "@/domain/document-ingestion";
import { createStableId } from "@/domain/lorebook";

export interface ExtractionTaskInput {
  task: IngestionTask;
  chunks: DocumentChunk[];
  extractChunk: (chunk: DocumentChunk, signal?: AbortSignal) => Promise<ExtractionItem[]>;
  previousItems?: ExtractionItem[];
  concurrency?: number;
  retryLimit?: number;
  signal?: AbortSignal;
  onCheckpoint?: (checkpoint: IngestionCheckpoint) => Promise<void> | void;
}

export interface ExtractionTaskResult {
  task: IngestionTask;
  chunks: DocumentChunk[];
  items: ExtractionItem[];
}

export function createIngestionTask(projectId: string, documentId: string): IngestionTask {
  const now = new Date().toISOString();
  return IngestionTaskSchema.parse({
    id: createStableId("ingestion_task"), projectId, documentId, createdAt: now, modifiedAt: now,
  });
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function runExtractionTask(input: ExtractionTaskInput): Promise<ExtractionTaskResult> {
  const task = IngestionTaskSchema.parse(structuredClone(input.task));
  const chunks = structuredClone(input.chunks);
  const items = [...(input.previousItems ?? [])];
  const completed = new Set(task.checkpoint.completedChunkIds);
  const failed = new Set(task.checkpoint.failedChunkIds);
  const pending = chunks.filter((chunk) => !completed.has(chunk.id)).sort((left, right) => left.order - right.order);
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 2, 5));
  const retryLimit = input.retryLimit ?? task.retryLimit;
  let cursor = 0;

  task.status = "running";
  task.startedAt ??= new Date().toISOString();
  task.error = null;

  const saveCheckpoint = async (chunk?: DocumentChunk) => {
    const processed = completed.size + failed.size;
    task.progress = chunks.length ? Math.min(100, Math.round((processed / chunks.length) * 100)) : 100;
    task.currentChunkId = chunk?.id ?? null;
    task.checkpoint = {
      ...task.checkpoint,
      stage: task.stage,
      completedChunkIds: [...completed],
      failedChunkIds: [...failed],
      lastChunkOrder: chunk?.order ?? task.checkpoint.lastChunkOrder,
      savedAt: new Date().toISOString(),
    };
    task.completedChunkIds = [...completed];
    task.failedChunkIds = [...failed];
    task.modifiedAt = new Date().toISOString();
    await input.onCheckpoint?.(structuredClone(task.checkpoint));
  };

  const worker = async () => {
    while (cursor < pending.length) {
      if (input.signal?.aborted) return;
      const chunk = pending[cursor++];
      task.currentChunkId = chunk.id;
      const target = chunks.find((candidate) => candidate.id === chunk.id)!;
      target.processingStatus = "processing";
      failed.delete(chunk.id);
      let succeeded = false;
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
        try {
          const extracted = await input.extractChunk(chunk, input.signal);
          for (const item of extracted) if (!items.some((existing) => existing.id === item.id)) items.push(item);
          target.processingStatus = "completed";
          target.retryCount = attempt;
          target.error = null;
          completed.add(chunk.id);
          succeeded = true;
          await saveCheckpoint(chunk);
          break;
        } catch (error) {
          lastError = error as Error;
          target.retryCount = attempt + 1;
          if (input.signal?.aborted) break;
          if (attempt < retryLimit && /429|rate|timeout|暂时|网络/i.test(lastError.message)) await wait(Math.min(250 * (attempt + 1), 1000));
        }
      }
      if (!succeeded && !input.signal?.aborted) {
        failed.add(chunk.id);
        target.processingStatus = "failed";
        target.error = lastError?.message ?? "区块处理失败";
        await saveCheckpoint(chunk);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, pending.length)) }, () => worker()));
  if (input.signal?.aborted) {
    task.status = "cancelled";
    chunks.filter((chunk) => chunk.processingStatus === "processing").forEach((chunk) => { chunk.processingStatus = "cancelled"; });
  } else if (failed.size) {
    task.status = completed.size ? "partially_completed" : "failed";
  } else {
    task.status = "completed";
    task.progress = 100;
    task.completedAt = new Date().toISOString();
  }
  task.currentChunkId = null;
  task.modifiedAt = new Date().toISOString();
  await saveCheckpoint();
  return { task: IngestionTaskSchema.parse(task), chunks, items };
}
