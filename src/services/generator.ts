import { IProviderAdapter } from "@/providers/types";
import { ProjectInput } from "@/domain/project-input";
import { CharacterData, CharacterDataSchema, formatZodError } from "@/domain/character-card";
import { buildSystemPrompt, buildUserMessage } from "@/prompts/v1";

// ============================================
// 角色卡生成服务
// ============================================

/** 生成配置 */
export interface GenerationConfig {
  provider: IProviderAdapter;
  model: string;
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  /** JSON 格式修复的最大重试次数 */
  maxRetries?: number;
  /** 请求超时时间（毫秒） */
  timeoutMs?: number;
}

/** 生成结果 */
export interface GenerationResult {
  data: CharacterData;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  retriesUsed: number;
}

/** 生成错误类型 */
export class GenerationError extends Error {
  constructor(
    message: string,
    public readonly code: "timeout" | "cancelled" | "provider_error" | "validation_error" | "parse_error",
    public readonly retriesUsed: number = 0,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

/**
 * 从模型响应文本中提取 JSON 对象
 */
function extractJSON(text: string): string {
  // 尝试直接解析
  let trimmed = text.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // 继续尝试提取
  }

  // 尝试提取 markdown 代码块中的 JSON
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    const extracted = codeBlockMatch[1].trim();
    try {
      JSON.parse(extracted);
      return extracted;
    } catch {
      // 继续
    }
  }

  // 尝试找到第一个 { 和最后一个 }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const extracted = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      JSON.parse(extracted);
      return extracted;
    } catch {
      // 继续
    }
  }

  throw new GenerationError(
    "无法从模型响应中提取有效的 JSON。请重试或尝试更换模型。",
    "parse_error",
  );
}

/**
 * 修复常见的 JSON 格式问题
 */
function repairJSON(text: string): string {
  let result = text.trim();

  // 移除 BOM
  if (result.charCodeAt(0) === 0xfeff) {
    result = result.slice(1);
  }

  // 修复常见问题：尾部逗号
  result = result.replace(/,(\s*[}\]])/g, "$1");

  // 修复单引号（将键名和字符串值中的单引号替换为双引号）
  // 注意：只在 JSON 上下文中的单引号，不在字符串内容中的

  return result;
}

/**
 * 带超时的 fetch 封装
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<T> {
  if (timeoutMs <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new GenerationError("生成请求超时，请重试或尝试更短的输入内容。", "timeout"));
    }, timeoutMs);

    if (abortSignal) {
      if (abortSignal.aborted) {
        clearTimeout(timer);
        reject(new GenerationError("生成已被用户取消。", "cancelled"));
        return;
      }
      abortSignal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new GenerationError("生成已被用户取消。", "cancelled"));
      });
    }

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * 核心生成函数：调用模型 → 提取 JSON → Schema 校验 → 格式修复重试
 */
export async function generateCharacterCard(
  input: ProjectInput,
  config: GenerationConfig,
): Promise<GenerationResult> {
  const maxRetries = config.maxRetries ?? 2;
  const timeoutMs = config.timeoutMs ?? 60000;

  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage(input);

  let lastError: Error | null = null;
  let retriesUsed = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 调用模型
      const response = await withTimeout(
        config.provider.generate({
          systemPrompt,
          userMessage: attempt === 0
            ? userMessage
            : `${userMessage}\n\n【重要提醒】上次的响应格式不正确。请务必只返回纯 JSON 对象，不要添加任何解释文字或 markdown 标记。`,
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          abortSignal: config.abortSignal,
        }),
        timeoutMs,
        config.abortSignal,
      );

      // 提取 JSON
      let jsonText: string;
      try {
        jsonText = extractJSON(response.content);
      } catch (parseErr) {
        // 尝试修复
        try {
          const repaired = repairJSON(response.content);
          jsonText = extractJSON(repaired);
        } catch {
          // 如果修复后仍然失败，在非最后一次尝试时重试
          if (attempt < maxRetries) {
            retriesUsed = attempt + 1;
            continue;
          }
          throw parseErr;
        }
      }

      // 解析 JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        if (attempt < maxRetries) {
          // 尝试修复后重新解析
          try {
            const repaired = repairJSON(jsonText);
            parsed = JSON.parse(repaired);
          } catch {
            retriesUsed = attempt + 1;
            continue;
          }
        } else {
          throw new GenerationError(
            "模型返回的内容不是有效的 JSON 格式。已尝试修复但失败。请重试或减少输入内容。",
            "parse_error",
            retriesUsed,
          );
        }
      }

      // Schema 校验
      const result = CharacterDataSchema.safeParse(parsed);
      if (result.success) {
        return {
          data: result.data,
          model: response.model,
          usage: response.usage,
          retriesUsed,
        };
      }

      // 校验失败
      const errorMsg = formatZodError(result.error);
      if (attempt < maxRetries) {
        // 对缺失字段填入默认值后重试
        userMessage + `\n\n【格式修正提示】上一次返回的 JSON 存在以下问题：${errorMsg}\n请修正后重新返回完整 JSON。`;
        retriesUsed = attempt + 1;
        continue;
      }

      throw new GenerationError(
        `角色卡数据校验失败：${errorMsg}`,
        "validation_error",
        retriesUsed,
      );
    } catch (err) {
      lastError = err as Error;

      // 如果是 GenerationError，直接抛出（除非还要重试）
      if (err instanceof GenerationError) {
        if (attempt < maxRetries) {
          retriesUsed = attempt + 1;
          continue;
        }
        throw err;
      }

      // 检查是否是取消/超时
      if (err instanceof Error) {
        if (err.name === "AbortError" || err.message?.includes("abort")) {
          throw new GenerationError("生成已被用户取消。", "cancelled", retriesUsed);
        }
        if (err.message?.includes("timeout") || err.message?.includes("超时")) {
          throw new GenerationError("生成请求超时，请重试。", "timeout", retriesUsed);
        }
      }

      if (attempt < maxRetries) {
        retriesUsed = attempt + 1;
        continue;
      }

      throw new GenerationError(
        `模型调用失败：${(err as Error).message || "未知错误"}`,
        "provider_error",
        retriesUsed,
      );
    }
  }

  throw lastError || new GenerationError("生成失败，已达最大重试次数。", "provider_error", retriesUsed);
}
