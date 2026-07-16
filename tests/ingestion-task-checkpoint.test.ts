import { describe, expect, it } from "vitest";
import { DocumentChunkSchema, ExtractionItemSchema, SourceSpanSchema } from "@/domain/document-ingestion";
import { createIngestionTask, runExtractionTask } from "@/services/document-ingestion/extraction-orchestrator";

const span = SourceSpanSchema.parse({ documentId: "doc", sourceVersion: 1, chapterId: "ch", chapterTitle: "第一章", characterStart: 0, characterEnd: 10 });
const chunks = [0, 1, 2].map((order) => DocumentChunkSchema.parse({
  id: `chunk-${order}`, documentId: "doc", chapterId: "ch", order, text: `文本${order}。`,
  startOffset: order * 10, endOffset: order * 10 + 5, sourceSpans: [span], estimatedTokens: 4,
}));

describe("recoverable extraction orchestrator", () => {
  it("retries a failed chunk and checkpoints completed results", async () => {
    const attempts = new Map<string, number>();
    const checkpoints: string[][] = [];
    const result = await runExtractionTask({
      task: createIngestionTask("p", "doc"), chunks, concurrency: 2, retryLimit: 2,
      extractChunk: async (chunk) => {
        attempts.set(chunk.id, (attempts.get(chunk.id) ?? 0) + 1);
        if (chunk.id === "chunk-1" && attempts.get(chunk.id) === 1) throw new Error("429 rate limit");
        return [ExtractionItemSchema.parse({ id: `item-${chunk.id}`, type: "current_event", content: chunk.text, originalExpression: chunk.text, sourceSpans: chunk.sourceSpans })];
      },
      onCheckpoint: async (checkpoint) => { checkpoints.push([...checkpoint.completedChunkIds]); },
    });
    expect(result.task.status).toBe("completed");
    expect(result.items).toHaveLength(3);
    expect(attempts.get("chunk-1")).toBe(2);
    expect(checkpoints.at(-1)).toHaveLength(3);
  });

  it("keeps partial results when cancelled and resumes without reprocessing completed chunks", async () => {
    const controller = new AbortController();
    const first = await runExtractionTask({
      task: createIngestionTask("p", "doc"), chunks, concurrency: 1, signal: controller.signal,
      extractChunk: async (chunk) => {
        if (chunk.id === "chunk-0") controller.abort();
        return [ExtractionItemSchema.parse({ id: `item-${chunk.id}`, type: "current_event", content: chunk.text, sourceSpans: chunk.sourceSpans })];
      },
    });
    expect(first.task.status).toBe("cancelled");
    expect(first.task.checkpoint.completedChunkIds).toEqual(["chunk-0"]);

    const processed: string[] = [];
    const resumed = await runExtractionTask({
      task: first.task, chunks, previousItems: first.items, concurrency: 1,
      extractChunk: async (chunk) => {
        processed.push(chunk.id);
        return [ExtractionItemSchema.parse({ id: `item-${chunk.id}`, type: "current_event", content: chunk.text, sourceSpans: chunk.sourceSpans })];
      },
    });
    expect(processed).toEqual(["chunk-1", "chunk-2"]);
    expect(resumed.task.status).toBe("completed");
    expect(resumed.items).toHaveLength(3);
  });

  it("marks unrecoverable chunks as partial instead of discarding successes", async () => {
    const result = await runExtractionTask({
      task: createIngestionTask("p", "doc"), chunks, retryLimit: 1,
      extractChunk: async (chunk) => {
        if (chunk.id === "chunk-2") throw new Error("bad chunk");
        return [ExtractionItemSchema.parse({ id: `item-${chunk.id}`, type: "current_event", content: chunk.text, sourceSpans: chunk.sourceSpans })];
      },
    });
    expect(result.task.status).toBe("partially_completed");
    expect(result.task.checkpoint.failedChunkIds).toEqual(["chunk-2"]);
    expect(result.items).toHaveLength(2);
  });
});
