import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DocumentChunkSchema } from "@/domain/document-ingestion";
import { POST } from "@/app/api/analyze-document/route";

const chunk = DocumentChunkSchema.parse({
  id: "api-chunk-1",
  documentId: "doc-1",
  chapterId: "chapter-1",
  order: 0,
  text: "柳青在临水镇拾到一枚古玉。",
  startOffset: 0,
  endOffset: 15,
  estimatedTokens: 16,
  sourceSpans: [{
    documentId: "doc-1",
    sourceVersion: 1,
    chapterId: "chapter-1",
    chapterTitle: "第一章",
    characterStart: 0,
    characterEnd: 15,
    rawTextExcerpt: "柳青在临水镇拾到一枚古玉。",
    normalizedTextExcerpt: "柳青在临水镇拾到一枚古玉。",
  }],
});

function toApiChunk(value: typeof chunk) {
  return {
    id: value.id,
    documentId: value.documentId,
    chapterId: value.chapterId,
    order: value.order,
    text: value.text,
    startOffset: value.startOffset,
    endOffset: value.endOffset,
    sourceSpans: value.sourceSpans,
    estimatedTokens: value.estimatedTokens,
    overlapBefore: value.overlapBefore,
    overlapAfter: value.overlapAfter,
  };
}

const apiChunk = toApiChunk(chunk);

function request(body: unknown): NextRequest {
  return new NextRequest("https://studio.example/api/analyze-document", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/analyze-document", () => {
  it("analyzes one validated chunk without returning prompts or credentials", async () => {
    const response = await POST(request({ chunk: apiChunk, provider: "mock", model: "mock-model" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.items.length).toBeGreaterThan(0);
    expect(payload.data.items.every((item: { sourceSpans: unknown[] }) => item.sourceSpans.length > 0)).toBe(true);
    expect(payload.meta).toMatchObject({
      model: "mock-model",
      retriesUsed: 0,
      promptVersion: "document-ingestion-v1.0.0",
      chunkId: chunk.id,
    });
    expect(payload).not.toHaveProperty("chunk");
    expect(JSON.stringify(payload)).not.toMatch(/systemPrompt|userMessage|apiKey|authorization/i);
  });

  it("rejects whole-document and credential fields without echoing them", async () => {
    const secret = "sk-route-secret-novel-body";
    const response = await POST(request({
      chunk: apiChunk,
      provider: "mock",
      fullText: `整本正文-${secret}`,
      apiKey: secret,
    }));
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toContain("请求只能包含单个文档分块");
    expect(text).not.toContain(secret);
    expect(text).not.toContain("整本正文");
  });

  it("rejects unknown whole-document fields nested inside the chunk", async () => {
    const secret = "nested-secret-body";
    const response = await POST(request({
      chunk: { ...apiChunk, fullText: `整本正文-${secret}`, apiKey: secret },
      provider: "mock",
    }));
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).not.toContain(secret);
  });

  it.each([
    ["forbidden task error field", { ...apiChunk, error: "乙".repeat(100) }],
    ["oversized id", { ...apiChunk, id: "id".repeat(200) }],
    ["too many source spans", { ...apiChunk, sourceSpans: Array.from({ length: 65 }, () => chunk.sourceSpans[0]) }],
  ])("rejects %s before sending the chunk to a Provider", async (_case, unsafeChunk) => {
    const response = await POST(request({ chunk: unsafeChunk, provider: "mock" }));
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).not.toContain("乙".repeat(100));
  });

  it("enforces an actual request-body byte limit before JSON parsing", async () => {
    const response = await POST(request({
      chunk: apiChunk,
      provider: "mock",
      padding: "甲".repeat(100_000),
    }));
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.error).toBe("请求体过大，只能提交单个受限文档分块。");
  });

  it("rejects a chunk larger than the bounded Provider payload", async () => {
    const text = "甲".repeat(50_001);
    const oversized = DocumentChunkSchema.parse({
      ...chunk,
      id: "oversized",
      text,
      endOffset: text.length,
      estimatedTokens: 25_001,
      sourceSpans: [{
        ...chunk.sourceSpans[0],
        characterEnd: text.length,
        rawTextExcerpt: "甲".repeat(50),
        normalizedTextExcerpt: "甲".repeat(50),
      }],
    });

    const response = await POST(request({ chunk: toApiChunk(oversized), provider: "mock" }));
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.error).toBe("文档分块过大，请重新分块后再分析。");
    expect(JSON.stringify(payload)).not.toContain(text);
  });

  it("rejects non-JSON and cross-site browser requests", async () => {
    const textRequest = new NextRequest("https://studio.example/api/analyze-document", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ chunk: apiChunk, provider: "mock" }),
    });
    expect((await POST(textRequest)).status).toBe(415);

    const crossSiteRequest = new NextRequest("https://studio.example/api/analyze-document", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ chunk: apiChunk, provider: "mock" }),
    });
    expect((await POST(crossSiteRequest)).status).toBe(403);
  });

  it("accepts the bounded analysis switches but rejects unrelated configuration", async () => {
    const accepted = await POST(request({
      chunk: apiChunk,
      provider: "mock",
      config: { depth: "quick", extractLorebook: false },
    }));
    expect(accepted.status).toBe(200);

    const rejected = await POST(request({
      chunk: apiChunk,
      provider: "mock",
      config: { depth: "quick", allowExternalModel: true },
    }));
    expect(rejected.status).toBe(400);
  });
});
