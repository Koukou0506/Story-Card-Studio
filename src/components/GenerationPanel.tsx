"use client";

import { useState, useCallback } from "react";
import { ProviderType } from "@/providers/types";

interface GenerationPanelProps {
  onGenerate: (config: {
    provider: ProviderType;
    model: string;
  }) => void;
  onCancel: () => void;
  isGenerating: boolean;
  disabled?: boolean;
  error?: string | null;
  offline?: boolean;
}

// ============================================
// 生成控制面板组件
// ============================================

const PROVIDER_MODELS: Record<ProviderType, Array<{ id: string; name: string }>> = {
  mock: [{ id: "mock-model", name: "Mock 模型" }],
  openai: [
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4.1", name: "GPT-4.1" },
    { id: "o4-mini", name: "o4 Mini" },
  ],
  anthropic: [
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    { id: "claude-sonnet-5-20251001", name: "Claude Sonnet 5" },
    { id: "claude-opus-4-8-20251101", name: "Claude Opus 4.8" },
  ],
};

export function GenerationPanel({
  onGenerate,
  onCancel,
  isGenerating,
  disabled,
  error,
  offline = false,
}: GenerationPanelProps) {
  const [provider, setProvider] = useState<ProviderType>("mock");
  const [model, setModel] = useState("mock-model");

  const handleProviderChange = useCallback(
    (newProvider: ProviderType) => {
      setProvider(newProvider);
      // 自动选择该 provider 的默认模型
      const models = PROVIDER_MODELS[newProvider];
      if (models.length > 0) {
        setModel(models[0].id);
      }
    },
    [],
  );

  const handleGenerate = useCallback(() => {
    onGenerate({ provider, model });
  }, [onGenerate, provider, model]);

  const models = PROVIDER_MODELS[provider];

  return (
    <div className="card" style={{ borderColor: isGenerating ? "var(--color-primary)" : undefined }}>
      <div className="card-header">
        <span>🤖 生成角色卡</span>
        {isGenerating && (
          <span className="generating-indicator">
            <span className="spinner" />
            生成中...
          </span>
        )}
      </div>

      {/* Provider 选择 */}
      <div style={{ marginBottom: "0.75rem" }}>
        <div className="field-label">模型供应商</div>
        <select
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value as ProviderType)}
          disabled={isGenerating || disabled}
          style={{ width: "100%" }}
        >
          <option value="mock">Mock（测试用，不需 API 密钥）</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
        <div className="field-hint">
          {provider === "mock"
            ? "使用内置模拟数据，无需联网或配置 API 密钥"
            : provider === "openai"
              ? "需要在 .env.local 中配置 OPENAI_API_KEY"
              : "需要在 .env.local 中配置 ANTHROPIC_API_KEY"}
        </div>
      </div>

      {/* 模型选择 */}
      <div style={{ marginBottom: "0.75rem" }}>
        <div className="field-label">模型</div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={isGenerating || disabled}
          style={{ width: "100%" }}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* 错误信息 */}
      {offline && <div className="notice" role="status">当前离线，模型操作已暂停；本机草稿编辑和导出仍可使用。</div>}
      {error && (
        <div
          style={{
            padding: "0.75rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "0.375rem",
            color: "#991b1b",
            fontSize: "0.8125rem",
            marginBottom: "0.75rem",
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      )}

      {/* 按钮 */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {isGenerating ? (
          <button className="btn-danger" onClick={onCancel}>
            ⏹ 取消生成
          </button>
        ) : (
          <button
            className="btn-primary"
            onClick={handleGenerate}
            disabled={disabled}
            style={{ flex: 1 }}
          >
            🚀 开始生成
          </button>
        )}
      </div>

      {/* 说明 */}
      <div
        style={{
          marginTop: "0.75rem",
          fontSize: "0.7rem",
          color: "var(--color-text-secondary)",
        }}
      >
        生成的角色卡将经过 Schema 校验和格式修复后才进入编辑区。
        {provider !== "mock" && " 调用真实 API 可能产生费用。"}
      </div>
    </div>
  );
}
