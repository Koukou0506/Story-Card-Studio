import { z } from "zod";

// ============================================
// 模型供应商类型定义
// ============================================

/** Provider 类型标识 */
export const ProviderTypeSchema = z.enum(["openai", "anthropic", "mock"]);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

/** 模型生成请求参数 */
export interface GenerateRequest {
  /** 系统提示词 */
  systemPrompt: string;
  /** 用户消息 */
  userMessage: string;
  /** 模型名称 */
  model: string;
  /** 温度参数 (0-2) */
  temperature?: number;
  /** 最大输出 token 数 */
  maxTokens?: number;
  /** 响应契约；正文生成必须使用 text，结构化领域生成使用 json。 */
  responseFormat?: "json" | "text";
  /** 可选停止序列。 */
  stopSequences?: string[];
  /** 中止信号 */
  abortSignal?: AbortSignal;
}

/** 模型生成响应 */
export interface GenerateResponse {
  /** 生成的文本内容 */
  content: string;
  /** 使用的模型名称 */
  model: string;
  /** 实际使用的 token 数（如果 provider 返回） */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/** Provider Adapter 统一接口 */
export interface IProviderAdapter {
  /** Provider 类型标识 */
  readonly type: ProviderType;
  /** Provider 显示名称 */
  readonly displayName: string;
  /** 可用的模型列表 */
  readonly models: Array<{ id: string; name: string }>;
  /** 默认模型 */
  readonly defaultModel: string;
  /** 调用模型生成内容 */
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  /** Provider 可选流式能力；每个 chunk 仅包含新增正文。 */
  generateStream?(request: GenerateRequest): AsyncIterable<string>;
}

/** Provider 工厂配置 */
export interface ProviderConfig {
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
}
