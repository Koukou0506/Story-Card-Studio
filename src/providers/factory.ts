import { IProviderAdapter, ProviderConfig, ProviderType } from "./types";
import { MockProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";

// ============================================
// Provider 工厂
// ============================================

/**
 * 根据配置创建 Provider Adapter 实例。
 * 服务端调用此函数，确保 API 密钥只在服务端使用。
 */
export function createProvider(config: ProviderConfig): IProviderAdapter {
  switch (config.type) {
    case "mock":
      return new MockProvider();

    case "openai": {
      const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "使用 OpenAI Provider 需要设置 OPENAI_API_KEY 环境变量。\n" +
          "如果不需要调用真实 API，请使用 Mock Provider。"
        );
      }
      return new OpenAIProvider(apiKey, config.baseUrl);
    }

    case "anthropic": {
      const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          "使用 Anthropic Provider 需要设置 ANTHROPIC_API_KEY 环境变量。\n" +
          "如果不需要调用真实 API，请使用 Mock Provider。"
        );
      }
      return new AnthropicProvider(apiKey, config.baseUrl);
    }

    default:
      throw new Error(`不支持的 Provider 类型: ${config.type}`);
  }
}

/**
 * 从环境变量获取默认的 Provider 类型
 */
export function getDefaultProviderType(): ProviderType {
  const envProvider = process.env.DEFAULT_PROVIDER;
  if (envProvider === "openai" || envProvider === "anthropic" || envProvider === "mock") {
    return envProvider;
  }
  return "mock";
}

/**
 * 获取所有可用的 Provider 类型（含 mock）
 */
export function getAvailableProviders(): Array<{
  type: ProviderType;
  name: string;
  requiresApiKey: boolean;
}> {
  return [
    { type: "mock", name: "Mock（测试用）", requiresApiKey: false },
    { type: "openai", name: "OpenAI", requiresApiKey: true },
    { type: "anthropic", name: "Anthropic", requiresApiKey: true },
  ];
}
