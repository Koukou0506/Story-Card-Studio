import {
  IProviderAdapter,
  ProviderType,
  GenerateRequest,
  GenerateResponse,
} from "./types";

// ============================================
// Anthropic Provider Adapter
// ============================================

const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

export class AnthropicProvider implements IProviderAdapter {
  readonly type: ProviderType = "anthropic";
  readonly displayName = "Anthropic";
  readonly models = [
    { id: "claude-sonnet-5-20251001", name: "Claude Sonnet 5" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    { id: "claude-opus-4-8-20251101", name: "Claude Opus 4.8" },
  ];
  readonly defaultModel = "claude-haiku-4-5-20251001";

  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || DEFAULT_BASE_URL;
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const url = `${this.baseUrl}/messages`;

    const body = {
      model: request.model || this.defaultModel,
      max_tokens: request.maxTokens ?? 4096,
      ...(request.stopSequences?.length ? { stop_sequences: request.stopSequences } : {}),
      temperature: request.temperature ?? 0.7,
      system: request.systemPrompt,
      messages: [
        {
          role: "user" as const,
          content: `${request.userMessage}\n\n请直接返回有效的 JSON，不要包含其他文字。`,
        },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: request.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "未知错误");
      throw new Error(`Anthropic API 错误 (${response.status}): ${errorText}`);
    }

    const json = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
      model: string;
      usage?: { input_tokens: number; output_tokens: number };
    };

    const textContent = json.content?.find((c) => c.type === "text");
    if (!textContent?.text) {
      throw new Error("Anthropic 返回了空的响应内容");
    }

    return {
      content: textContent.text,
      model: json.model || request.model,
      usage: json.usage
        ? {
            inputTokens: json.usage.input_tokens,
            outputTokens: json.usage.output_tokens,
          }
        : undefined,
    };
  }
}
