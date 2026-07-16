import {
  IProviderAdapter,
  ProviderType,
  GenerateRequest,
  GenerateResponse,
} from "./types";

// ============================================
// OpenAI Provider Adapter
// ============================================

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export class OpenAIProvider implements IProviderAdapter {
  readonly type: ProviderType = "openai";
  readonly displayName = "OpenAI";
  readonly models = [
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "gpt-4.1", name: "GPT-4.1" },
    { id: "o4-mini", name: "o4 Mini" },
  ];
  readonly defaultModel = "gpt-4o-mini";

  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || DEFAULT_BASE_URL;
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: request.model || this.defaultModel,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userMessage },
      ],
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
      ...(request.stopSequences?.length ? { stop: request.stopSequences } : {}),
    };
    if (request.responseFormat !== "text") body.response_format = { type: "json_object" };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: request.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "未知错误");
      throw new Error(`OpenAI API 错误 (${response.status}): ${errorText}`);
    }

    const json = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI 返回了空的响应内容");
    }

    return {
      content,
      model: json.model || request.model,
      usage: json.usage
        ? {
            inputTokens: json.usage.prompt_tokens,
            outputTokens: json.usage.completion_tokens,
          }
        : undefined,
    };
  }
}
