import { describe, expect, it } from "vitest";
import { DocumentChunkSchema } from "@/domain/document-ingestion";
import type { GenerateRequest, IProviderAdapter } from "@/providers/types";
import { DOCUMENT_INGESTION_PROMPT_VERSION } from "@/prompts/document-ingestion-v1";
import { MockProvider } from "@/providers/mock";
import { generateDocumentChunkExtraction } from "@/services/document-ingestion/generator";
import { GenerationError } from "@/services/generator";

const chunk = DocumentChunkSchema.parse({
  id: "chunk-1",
  documentId: "doc-1",
  chapterId: "chapter-1",
  order: 0,
  text: "柳青在临水镇拾到一枚古玉。",
  startOffset: 20,
  endOffset: 35,
  estimatedTokens: 16,
  sourceSpans: [{
    documentId: "doc-1",
    sourceVersion: 3,
    chapterId: "chapter-1",
    chapterTitle: "第一章",
    characterStart: 20,
    characterEnd: 35,
    rawTextExcerpt: "柳青在临水镇拾到一枚古玉。",
    normalizedTextExcerpt: "柳青在临水镇拾到一枚古玉。",
    extractionConfidence: "high",
  }],
});

const validItem = {
  id: "candidate-1",
  type: "character",
  normalizedName: "柳青",
  originalExpression: "柳青",
  content: "柳青出现在临水镇。",
  sourceSpans: chunk.sourceSpans,
  confidence: "high",
  explicitFact: true,
  inference: false,
  sceneOnly: false,
  possibleExistingEntityIds: [],
  decision: "pending",
};

function providerReturning(content: string, requests: GenerateRequest[]): IProviderAdapter {
  return {
    type: "mock",
    displayName: "test",
    models: [{ id: "test-model", name: "test" }],
    defaultModel: "test-model",
    async generate(request) {
      requests.push(request);
      return { content, model: "test-model", usage: { inputTokens: 10, outputTokens: 20 } };
    },
  };
}

describe("document chunk Provider generation", () => {
  it("extracts fenced JSON and validates source-bound candidates", async () => {
    const requests: GenerateRequest[] = [];
    const provider = providerReturning(`说明文字\n\`\`\`json\n${JSON.stringify({ items: [validItem] })}\n\`\`\``, requests);

    const result = await generateDocumentChunkExtraction(chunk, {
      provider,
      model: "test-model",
      timeoutMs: 1_000,
      maxRetries: 0,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].sourceSpans).toEqual(chunk.sourceSpans);
    expect(result.model).toBe("test-model");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(result.retriesUsed).toBe(0);
    expect(result.promptVersion).toBe(DOCUMENT_INGESTION_PROMPT_VERSION);
    expect(result.warnings).toEqual([]);
    expect(requests).toHaveLength(1);
    expect(requests[0].responseFormat).toBe("json");
    expect(requests[0].userMessage).toContain(JSON.stringify(chunk));
  });

  it("validates raw Source Span offsets against chunk source spans, not normalized chunk offsets", async () => {
    const mappedChunk = DocumentChunkSchema.parse({
      ...chunk,
      startOffset: 10,
      endOffset: 25,
      sourceSpans: chunk.sourceSpans.map((span) => ({ ...span, characterStart: 12, characterEnd: 28, mappingStatus: "approximate" })),
    });
    const mappedItem = { ...validItem, sourceSpans: mappedChunk.sourceSpans };
    const result = await generateDocumentChunkExtraction(mappedChunk, {
      provider: providerReturning(JSON.stringify({ items: [mappedItem] }), []),
      model: "test-model",
      maxRetries: 0,
    });
    expect(result.items).toHaveLength(1);
  });

  it("uses the repair prompt after a Schema failure", async () => {
    const requests: GenerateRequest[] = [];
    const responses = [
      JSON.stringify({ items: [{ ...validItem, type: "unsupported" }] }),
      JSON.stringify({ items: [validItem] }),
    ];
    const provider: IProviderAdapter = {
      ...providerReturning("", requests),
      async generate(request) {
        requests.push(request);
        return { content: responses[requests.length - 1], model: "test-model" };
      },
    };

    const result = await generateDocumentChunkExtraction(chunk, {
      provider,
      model: "test-model",
      timeoutMs: 1_000,
      maxRetries: 2,
    });

    expect(result.items).toHaveLength(1);
    expect(result.retriesUsed).toBe(1);
    expect(requests).toHaveLength(2);
    expect(requests[1].systemPrompt).toContain("任务类型：文档分块 JSON 修复");
    expect(requests[1].userMessage).toContain("items.0.type");
    expect(requests[1].userMessage).toContain(JSON.stringify(chunk));
  });

  it("caps JSON repairs at two and returns a Chinese validation summary", async () => {
    let calls = 0;
    const provider: IProviderAdapter = {
      ...providerReturning("", []),
      async generate() {
        calls += 1;
        return {
          content: JSON.stringify({ items: [{ ...validItem, type: "unsupported-secret-value" }] }),
          model: "test-model",
        };
      },
    };

    let caught: unknown;
    try {
      await generateDocumentChunkExtraction(chunk, {
        provider,
        model: "test-model",
        maxRetries: 99,
      });
    } catch (error) {
      caught = error;
    }

    expect(calls).toBe(3);
    expect(caught).toMatchObject({
      code: "validation_error",
      retriesUsed: 2,
      message: "文档分块结果格式不正确，已完成 2 次修复仍未通过校验。",
    });
    expect((caught as Error).message).not.toContain("unsupported-secret-value");
    expect((caught as Error).message).not.toContain("Invalid option");
  });

  it.each([
    ["confirmed decision", { ...validItem, decision: "confirmed" }],
    ["contradictory fact flags", { ...validItem, explicitFact: true, inference: true }],
  ])("rejects Provider wire items with %s", async (_case, unsafeItem) => {
    await expect(generateDocumentChunkExtraction(chunk, {
      provider: providerReturning(JSON.stringify({ items: [unsafeItem] }), []),
      model: "test-model",
      maxRetries: 0,
    })).rejects.toMatchObject({ code: "validation_error" });
  });

  it.each([
    ["missing explicitFact", (() => { const item = { ...validItem } as Record<string, unknown>; delete item.explicitFact; return item; })()],
    ["missing SourceSpan mappingStatus", (() => {
      const span = { ...chunk.sourceSpans[0] } as Record<string, unknown>;
      delete span.mappingStatus;
      return { ...validItem, sourceSpans: [span] };
    })()],
    ["overlong id", { ...validItem, id: "x".repeat(201) }],
    ["overlong content", { ...validItem, content: "甲".repeat(2_001) }],
  ])("rejects strict Provider wire payloads with %s", async (_case, unsafeItem) => {
    await expect(generateDocumentChunkExtraction(chunk, {
      provider: providerReturning(JSON.stringify({ items: [unsafeItem] }), []),
      model: "test-model",
      maxRetries: 0,
    })).rejects.toMatchObject({ code: "validation_error" });
  });

  it("limits the number of Provider extraction items", async () => {
    const items = Array.from({ length: 201 }, (_, index) => ({ ...validItem, id: `item-${index}` }));
    await expect(generateDocumentChunkExtraction(chunk, {
      provider: providerReturning(JSON.stringify({ items }), []),
      model: "test-model",
      maxRetries: 0,
    })).rejects.toMatchObject({ code: "validation_error" });
  });

  it("rejects an oversized Provider response without sending it back for repair", async () => {
    let calls = 0;
    const provider: IProviderAdapter = {
      ...providerReturning("", []),
      async generate() {
        calls += 1;
        return {
          content: JSON.stringify({ items: [{ ...validItem, content: "甲".repeat(600_000) }] }),
          model: "test-model",
        };
      },
    };

    await expect(generateDocumentChunkExtraction(chunk, {
      provider,
      model: "test-model",
      maxRetries: 2,
    })).rejects.toMatchObject({
      code: "validation_error",
      message: "Provider 返回的文档分析结果过大，已拒绝处理。",
    });
    expect(calls).toBe(1);
  });

  it("removes out-of-chunk references and drops candidates with no valid source", async () => {
    const requests: GenerateRequest[] = [];
    const outsideSpan = {
      ...chunk.sourceSpans[0],
      documentId: "another-document",
      characterStart: 200,
      characterEnd: 220,
    };
    const provider = providerReturning(JSON.stringify({
      items: [
        { ...validItem, id: "partly-valid", sourceSpans: [chunk.sourceSpans[0], outsideSpan] },
        { ...validItem, id: "only-invalid", sourceSpans: [outsideSpan] },
      ],
    }), requests);

    const result = await generateDocumentChunkExtraction(chunk, {
      provider,
      model: "test-model",
      maxRetries: 0,
    });

    expect(result.items.map((item) => item.id)).toEqual(["partly-valid"]);
    expect(result.items[0].sourceSpans).toEqual(chunk.sourceSpans);
    expect(result.warnings).toEqual([
      "候选 partly-valid 含有 1 个越界来源，已剔除。",
      "候选 only-invalid 没有分块内有效来源，已丢弃。",
    ]);
    expect(result.warnings.join(" ")).not.toContain(chunk.text);
  });

  it("replaces Provider-authored source metadata with the trusted chunk span", async () => {
    const forgedSpan = {
      ...chunk.sourceSpans[0],
      chapterTitle: "伪造章节",
      rawTextExcerpt: "伪造摘录",
      normalizedTextExcerpt: "伪造摘录",
      mappingStatus: "unmapped",
      extractionConfidence: "low",
    };
    const result = await generateDocumentChunkExtraction(chunk, {
      provider: providerReturning(JSON.stringify({
        items: [{ ...validItem, sourceSpans: [forgedSpan] }],
      }), []),
      model: "test-model",
      maxRetries: 0,
    });

    expect(result.items[0].sourceSpans).toEqual(chunk.sourceSpans);
  });

  it("drops a source with known page downgraded to null", async () => {
    const pagedChunk = DocumentChunkSchema.parse({
      ...chunk,
      sourceSpans: [{ ...chunk.sourceSpans[0], pageStart: 1, pageEnd: 2 }],
    });
    const result = await generateDocumentChunkExtraction(pagedChunk, {
      provider: providerReturning(JSON.stringify({
        items: [{
          ...validItem,
          id: "unsafe-source-null-page",
          sourceSpans: [{ ...pagedChunk.sourceSpans[0], pageStart: null, pageEnd: null }],
        }],
      }), []),
      model: "test-model",
      maxRetries: 0,
    });

    expect(result.items).toEqual([]);
  });

  it("rejects a zero-width Provider source range", async () => {
    await expect(generateDocumentChunkExtraction(chunk, {
      provider: providerReturning(JSON.stringify({
        items: [{
          ...validItem,
          id: "zero-width-source",
          sourceSpans: [{ ...chunk.sourceSpans[0], characterStart: 20, characterEnd: 20 }],
        }],
      }), []),
      model: "test-model",
      maxRetries: 0,
    })).rejects.toMatchObject({ code: "validation_error" });
  });

  it("rejects reversed page ranges even when both page numbers are in the chunk", async () => {
    const pagedChunk = DocumentChunkSchema.parse({
      ...chunk,
      sourceSpans: [{ ...chunk.sourceSpans[0], pageStart: 1, pageEnd: 2 }],
    });
    const reversedPageItem = {
      ...validItem,
      id: "reversed-pages",
      sourceSpans: [{ ...pagedChunk.sourceSpans[0], pageStart: 2, pageEnd: 1 }],
    };
    await expect(generateDocumentChunkExtraction(pagedChunk, {
      provider: providerReturning(JSON.stringify({ items: [reversedPageItem] }), []),
      model: "test-model",
      maxRetries: 0,
    })).rejects.toMatchObject({ code: "validation_error" });
  });

  it("translates an in-flight cancellation into a Chinese cancelled error", async () => {
    const controller = new AbortController();
    const provider: IProviderAdapter = {
      ...providerReturning("", []),
      async generate(request) {
        return new Promise((resolve, reject) => {
          const onAbort = () => {
            const error = new Error("upstream request aborted");
            error.name = "AbortError";
            reject(error);
          };
          request.abortSignal?.addEventListener("abort", onAbort, { once: true });
          setTimeout(() => resolve({ content: JSON.stringify({ items: [validItem] }), model: "late-model" }), 200);
        });
      },
    };
    setTimeout(() => controller.abort(), 5);

    await expect(generateDocumentChunkExtraction(chunk, {
      provider,
      model: "test-model",
      abortSignal: controller.signal,
      maxRetries: 0,
    })).rejects.toMatchObject({
      code: "cancelled",
      message: "文档分块提取已取消。",
    });
  });

  it("aborts the Provider request when the chunk call times out", async () => {
    let providerSignal: AbortSignal | undefined;
    const provider: IProviderAdapter = {
      ...providerReturning("", []),
      async generate(request) {
        providerSignal = request.abortSignal;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve({
            content: JSON.stringify({ items: [validItem] }),
            model: "late-model",
          }), 80);
          request.abortSignal?.addEventListener("abort", () => {
            clearTimeout(timer);
            const error = new Error("request timeout upstream detail");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        });
      },
    };

    await expect(generateDocumentChunkExtraction(chunk, {
      provider,
      model: "test-model",
      timeoutMs: 5,
      maxRetries: 0,
    })).rejects.toMatchObject({
      code: "timeout",
      message: "文档分块提取超时，请缩小分块或稍后重试。",
    });
    expect(providerSignal?.aborted).toBe(true);
  });

  it("uses one deadline across JSON repair attempts", async () => {
    let calls = 0;
    const provider: IProviderAdapter = {
      ...providerReturning("", []),
      async generate() {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 8));
        return { content: JSON.stringify({ items: [{ ...validItem, type: "unsupported" }] }), model: "test-model" };
      },
    };

    await expect(generateDocumentChunkExtraction(chunk, {
      provider,
      model: "test-model",
      timeoutMs: 12,
      maxRetries: 2,
    })).rejects.toMatchObject({ code: "timeout" });
    expect(calls).toBeLessThan(3);
  });

  it("does not mislabel an internal Provider AbortError as a user cancellation", async () => {
    const provider: IProviderAdapter = {
      ...providerReturning("", []),
      async generate() {
        const error = new Error("provider aborted its own request");
        error.name = "AbortError";
        throw error;
      },
    };

    await expect(generateDocumentChunkExtraction(chunk, {
      provider,
      model: "test-model",
      maxRetries: 0,
    })).rejects.toMatchObject({ code: "provider_error" });
  });

  it("localizes Provider errors without exposing upstream secrets", async () => {
    const provider: IProviderAdapter = {
      ...providerReturning("", []),
      async generate() {
        throw new Error("OpenAI API error 401: invalid key sk-secret-document-body");
      },
    };

    let caught: unknown;
    try {
      await generateDocumentChunkExtraction(chunk, {
        provider,
        model: "test-model",
        maxRetries: 0,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "provider_error",
      message: "Provider 认证失败，请检查服务端密钥配置。",
    });
    expect((caught as Error).message).not.toContain("sk-secret-document-body");
    expect((caught as Error).message).not.toContain("OpenAI API error");
  });

  it("does not trust a Provider-originated GenerationError message", async () => {
    const provider: IProviderAdapter = {
      ...providerReturning("", []),
      async generate() {
        throw new GenerationError("429 upstream secret sk-provider-generated", "provider_error");
      },
    };

    await expect(generateDocumentChunkExtraction(chunk, {
      provider,
      model: "test-model",
      maxRetries: 0,
    })).rejects.toMatchObject({
      code: "provider_error",
      message: "Provider 请求过于频繁，请稍后重试。",
    });
  });

  it("runs source-bound chunk extraction through MockProvider", async () => {
    const result = await generateDocumentChunkExtraction(chunk, {
      provider: new MockProvider(),
      model: "mock-model",
      timeoutMs: 3_000,
      maxRetries: 0,
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.some((item) => item.type === "character" && item.normalizedName === "柳青")).toBe(true);
    expect(result.items.every((item) => item.decision === "pending")).toBe(true);
    expect(result.items.every((item) => item.sourceSpans.length > 0)).toBe(true);
    expect(result.items.flatMap((item) => item.sourceSpans)).toEqual(
      expect.arrayContaining(chunk.sourceSpans),
    );
    expect(result.warnings).toEqual([]);
  });

  it("does not invent a Mock event for an empty chunk", async () => {
    const emptyChunk = DocumentChunkSchema.parse({
      id: "empty-chunk",
      documentId: "doc-1",
      chapterId: "chapter-1",
      order: 1,
      text: "",
      startOffset: 35,
      endOffset: 35,
      estimatedTokens: 0,
      sourceSpans: [{
        ...chunk.sourceSpans[0],
        characterStart: 35,
        characterEnd: 35,
        rawTextExcerpt: "",
        normalizedTextExcerpt: "",
      }],
    });

    const result = await generateDocumentChunkExtraction(emptyChunk, {
      provider: new MockProvider(),
      model: "mock-model",
      timeoutMs: 3_000,
      maxRetries: 0,
    });

    expect(result.items).toEqual([]);
  });
});
