"use client";

import { useState } from "react";
import { CharacterData } from "@/domain/character-card";

interface CharacterEditorProps {
  data: CharacterData;
  onChange: <K extends keyof CharacterData>(field: K, value: CharacterData[K]) => void;
  disabled?: boolean;
}

// ============================================
// 角色卡编辑区组件
// ============================================

const FIELD_DEFINITIONS: Array<{
  key: keyof CharacterData;
  label: string;
  hint: string;
  type: "text" | "textarea" | "tags" | "greetings";
  advanced?: boolean;
}> = [
  {
    key: "name",
    label: "名称",
    hint: "角色的名字或称呼",
    type: "text",
  },
  {
    key: "description",
    label: "角色描述",
    hint: "角色的外貌、背景、身份等客观描述。会作为角色定义的上下文发送给模型。",
    type: "textarea",
  },
  {
    key: "personality",
    label: "性格",
    hint: "角色的性格特征、行为模式、喜好和厌恶。定义角色'是什么样的人'。",
    type: "textarea",
  },
  {
    key: "scenario",
    label: "场景",
    hint: "对话发生的初始场景或情境背景。帮助模型理解对话的上下文。",
    type: "textarea",
  },
  {
    key: "first_mes",
    label: "第一条消息",
    hint: "角色在对话中发送的第一条消息。好的开场消息应包含可互动的情境，给用户自然的回应入口。",
    type: "textarea",
  },
  {
    key: "mes_example",
    label: "示例对话",
    hint: '使用 <START> 分隔每组对话，{{user}} 和 {{char}} 标记说话者。展示角色应当如何说话和回应。',
    type: "textarea",
  },
  {
    key: "creator_notes",
    label: "创作者备注",
    hint: "给使用者看的备注信息，不会发送给模型。可以记录创作意图、角色灵感、版本说明等。",
    type: "textarea",
    advanced: true,
  },
  {
    key: "system_prompt",
    label: "系统提示词",
    hint: "定义角色扮演的核心规则。默认会替换用户的全局系统提示词设置。支持 {{original}} 占位符。",
    type: "textarea",
    advanced: true,
  },
  {
    key: "post_history_instructions",
    label: "对话后指令",
    hint: "追加在对话历史之后的指令，用于维持角色的一致性。支持 {{original}} 占位符。",
    type: "textarea",
    advanced: true,
  },
  {
    key: "alternate_greetings",
    label: "备选开场",
    hint: "用户可以在第一条消息处切换使用这些备选开场消息。每行一条。",
    type: "greetings",
    advanced: true,
  },
  {
    key: "tags",
    label: "标签",
    hint: "用于分类和筛选的标签。用逗号或空格分隔。不应影响模型行为。",
    type: "tags",
    advanced: true,
  },
  {
    key: "creator",
    label: "创作者",
    hint: "角色卡的创作者名称，仅用于署名。",
    type: "text",
    advanced: true,
  },
  {
    key: "character_version",
    label: "角色版本",
    hint: "角色卡的版本号，方便追踪修改。",
    type: "text",
    advanced: true,
  },
];

export function CharacterEditor({ data, onChange, disabled }: CharacterEditorProps) {
  const basicFields = FIELD_DEFINITIONS.filter((f) => !f.advanced);
  const advancedFields = FIELD_DEFINITIONS.filter((f) => f.advanced);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const renderField = (def: (typeof FIELD_DEFINITIONS)[number]) => {
    const value = data[def.key];

    switch (def.type) {
      case "textarea":
        return (
          <textarea
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(def.key, e.target.value)}
            disabled={disabled}
            style={{ width: "100%", minHeight: def.key === "mes_example" ? "150px" : "80px" }}
          />
        );

      case "tags":
        return (
          <div>
            <input
              type="text"
              value={Array.isArray(value) ? value.join(", ") : ""}
              onChange={(e) => {
                const tags = e.target.value
                  .split(/[,，\s]+/)
                  .map((t) => t.trim())
                  .filter(Boolean);
                onChange(def.key, tags as CharacterData[typeof def.key]);
              }}
              placeholder="用逗号分隔"
              disabled={disabled}
              style={{ width: "100%" }}
            />
            {Array.isArray(value) && value.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginTop: "0.25rem" }}>
                {value.map((tag: string, i: number) => (
                  <span key={i} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        );

      case "greetings":
        return (
          <div>
            <textarea
              value={Array.isArray(value) ? value.join("\n") : ""}
              onChange={(e) => {
                const greetings = e.target.value
                  .split("\n")
                  .map((g) => g.trim())
                  .filter(Boolean);
                onChange(def.key, greetings as CharacterData[typeof def.key]);
              }}
              placeholder="每行一条备选开场消息"
              disabled={disabled}
              style={{ width: "100%", minHeight: "80px" }}
            />
            <div className="field-hint">
              已输入 {Array.isArray(value) ? value.length : 0} 条备选开场
            </div>
          </div>
        );

      default:
        return (
          <input
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(def.key, e.target.value)}
            disabled={disabled}
            style={{ width: "100%" }}
          />
        );
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <span>✏️ 角色卡编辑</span>
        {data.name && (
          <span className="tag">{data.name}</span>
        )}
      </div>

      {/* 基础字段 */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {basicFields.map((def) => (
          <div key={def.key}>
            <div className="field-label">{def.label}</div>
            {renderField(def)}
            <div className="field-hint">{def.hint}</div>
          </div>
        ))}
      </div>

      {/* 高级字段（可折叠） */}
      <div style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className={`collapsible-toggle ${showAdvanced ? "open" : ""}`}
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          高级设置
        </button>
        {showAdvanced && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              marginTop: "0.5rem",
              paddingTop: "0.5rem",
              borderTop: "1px solid var(--color-border)",
            }}
          >
            {advancedFields.map((def) => (
              <div key={def.key}>
                <div className="field-label">{def.label}</div>
                {renderField(def)}
                <div className="field-hint">{def.hint}</div>
              </div>
            ))}

            {/* extensions 只读提示 */}
            <div
              style={{
                padding: "0.75rem",
                background: "#f8fafc",
                borderRadius: "0.375rem",
                fontSize: "0.75rem",
                color: "var(--color-text-secondary)",
              }}
            >
              <strong>extensions（扩展字段）</strong>：已自动保留。
              包含 {Object.keys(data.extensions).length} 个扩展键。
              扩展字段在导入/导出时保持不变，无需手动编辑。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
