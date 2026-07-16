"use client";

import { useState, useCallback } from "react";
import type { ProjectInput, CreationMode } from "@/domain/project-input";

interface ProjectInputProps {
  value: ProjectInput;
  onChange: (input: Partial<ProjectInput>) => void;
  disabled?: boolean;
}

// ============================================
// 项目输入区组件
// ============================================

export function ProjectInput({ value, onChange, disabled }: ProjectInputProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = useCallback(
    (field: string, val: string) => {
      onChange({ [field]: val });
    },
    [onChange],
  );

  const updateAdvanced = useCallback(
    (field: string, val: string) => {
      onChange({
        advanced: { ...value.advanced, [field]: val },
      });
    },
    [onChange, value.advanced],
  );

  return (
    <div className="card">
      <div className="card-header">
        <span>📋 项目输入</span>
        <span className="tag" style={{ fontSize: "0.7rem" }}>
          {value.creationMode === "original" ? "原创" : "同人"}
        </span>
      </div>

      {/* 项目名称 */}
      <div style={{ marginBottom: "0.75rem" }}>
        <div className="field-label">项目名称</div>
        <input
          type="text"
          value={value.projectName}
          onChange={(e) => update("projectName", e.target.value)}
          placeholder="给这个项目起个名字..."
          disabled={disabled}
          style={{ width: "100%" }}
        />
      </div>

      {/* 原创/同人 */}
      <div style={{ marginBottom: "0.75rem" }}>
        <div className="field-label">创作模式</div>
        <select
          value={value.creationMode}
          onChange={(e) => update("creationMode", e.target.value as CreationMode)}
          disabled={disabled}
          style={{ width: "100%" }}
        >
          <option value="original">原创</option>
          <option value="fanfiction">同人</option>
        </select>
        <div className="field-hint">
          {value.creationMode === "fanfiction"
            ? "同人模式：AI 会区分原作事实、推断和新创作内容"
            : "原创模式：从零开始创作全新角色"}
        </div>
      </div>

      {/* 原始想法 */}
      <div style={{ marginBottom: "0.75rem" }}>
        <div className="field-label">
          原始想法{" "}
          <span style={{ color: "var(--color-error)" }}>*</span>
        </div>
        <textarea
          value={value.originalIdea}
          onChange={(e) => update("originalIdea", e.target.value)}
          placeholder="用自然语言描述你想要的角色。例如：&#10;&#10;一个生活在宋代江南的才女，擅长琴棋书画，外表温柔但内心坚强。她家道中落后独自住在小镇的旧宅中，靠教人读书为生..."
          disabled={disabled}
          style={{ width: "100%", minHeight: "100px" }}
        />
        <div className="field-hint">
          此内容会始终保留，不会被生成结果覆盖
        </div>
      </div>

      {/* 基础字段 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <div className="field-label">角色名称</div>
          <input
            type="text"
            value={value.characterName}
            onChange={(e) => update("characterName", e.target.value)}
            placeholder="留空则由 AI 命名"
            disabled={disabled}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <div className="field-label">用户身份</div>
          <input
            type="text"
            value={value.userIdentity}
            onChange={(e) => update("userIdentity", e.target.value)}
            placeholder="你在故事中的身份..."
            disabled={disabled}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <div className="field-label">期望关系</div>
          <input
            type="text"
            value={value.desiredRelationship}
            onChange={(e) => update("desiredRelationship", e.target.value)}
            placeholder="如：朋友、恋人、师徒..."
            disabled={disabled}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <div className="field-label">场景</div>
          <input
            type="text"
            value={value.scene}
            onChange={(e) => update("scene", e.target.value)}
            placeholder="故事发生的场景..."
            disabled={disabled}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <div className="field-label">故事基调</div>
          <input
            type="text"
            value={value.tone}
            onChange={(e) => update("tone", e.target.value)}
            placeholder="如：温馨、悬疑、浪漫..."
            disabled={disabled}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <div className="field-label">禁止或避免内容</div>
          <input
            type="text"
            value={value.forbiddenContent}
            onChange={(e) => update("forbiddenContent", e.target.value)}
            placeholder="不希望在角色卡中出现的内容..."
            disabled={disabled}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {/* 高级设定（可折叠） */}
      <div style={{ marginTop: "0.75rem" }}>
        <button
          type="button"
          className={`collapsible-toggle ${showAdvanced ? "open" : ""}`}
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          高级设定
        </button>
        {showAdvanced && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.75rem",
              marginTop: "0.5rem",
              paddingTop: "0.5rem",
              borderTop: "1px solid var(--color-border)",
            }}
          >
            <div>
              <div className="field-label">外貌</div>
              <textarea
                value={value.advanced.appearance}
                onChange={(e) => updateAdvanced("appearance", e.target.value)}
                placeholder="发型、面容、体型、着装风格..."
                disabled={disabled}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <div className="field-label">身份与经历</div>
              <textarea
                value={value.advanced.identityAndExperience}
                onChange={(e) => updateAdvanced("identityAndExperience", e.target.value)}
                placeholder="职业、出身、重要经历..."
                disabled={disabled}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <div className="field-label">核心欲望</div>
              <input
                type="text"
                value={value.advanced.coreDesire}
                onChange={(e) => updateAdvanced("coreDesire", e.target.value)}
                placeholder="角色最想要的是什么？"
                disabled={disabled}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <div className="field-label">核心恐惧</div>
              <input
                type="text"
                value={value.advanced.coreFear}
                onChange={(e) => updateAdvanced("coreFear", e.target.value)}
                placeholder="角色最害怕的是什么？"
                disabled={disabled}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <div className="field-label">性格特征</div>
              <input
                type="text"
                value={value.advanced.personalityTraits}
                onChange={(e) => updateAdvanced("personalityTraits", e.target.value)}
                placeholder="如：热情外向、冷静理性、多疑敏感..."
                disabled={disabled}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <div className="field-label">价值观</div>
              <input
                type="text"
                value={value.advanced.values}
                onChange={(e) => updateAdvanced("values", e.target.value)}
                placeholder="角色相信什么？坚守什么？"
                disabled={disabled}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <div className="field-label">与用户的关系</div>
              <input
                type="text"
                value={value.advanced.relationship}
                onChange={(e) => updateAdvanced("relationship", e.target.value)}
                placeholder="如：初次见面、青梅竹马、前世仇敌..."
                disabled={disabled}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <div className="field-label">语言风格</div>
              <input
                type="text"
                value={value.advanced.languageStyle}
                onChange={(e) => updateAdvanced("languageStyle", e.target.value)}
                placeholder="如：古风雅言、现代口语、傲娇语气..."
                disabled={disabled}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <div className="field-label">行为边界</div>
              <input
                type="text"
                value={value.advanced.behaviorBoundaries}
                onChange={(e) => updateAdvanced("behaviorBoundaries", e.target.value)}
                placeholder="角色绝对不会做的事..."
                disabled={disabled}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <div className="field-label">开场情境</div>
              <textarea
                value={value.advanced.openingSituation}
                onChange={(e) => updateAdvanced("openingSituation", e.target.value)}
                placeholder="第一次见面时的具体场景描述..."
                disabled={disabled}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <div className="field-label">原作/设定资料</div>
              <textarea
                value={value.advanced.sourceMaterial}
                onChange={(e) => updateAdvanced("sourceMaterial", e.target.value)}
                placeholder="（同人模式）你了解的关于原作的资料..."
                disabled={disabled}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
