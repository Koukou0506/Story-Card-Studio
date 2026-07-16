"use client";

import { useState, useRef, useCallback } from "react";
import { CharacterCardV2 } from "@/domain/character-card";
import { downloadJSON, importFromFile, sanitizeFilename } from "@/services/import-export";
import { validateImportFile } from "@/services/file-validation";

interface ImportExportProps {
  card: CharacterCardV2;
  onImport: (card: CharacterCardV2) => void;
  disabled?: boolean;
}

// ============================================
// 导入导出区组件
// ============================================

export function ImportExport({ card, onImport, disabled }: ImportExportProps) {
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showMessage = useCallback(
    (type: "success" | "error" | "info", text: string) => {
      setMessage({ type, text });
      setTimeout(() => setMessage(null), 5000);
    },
    [],
  );

  const handleExport = useCallback(() => {
    try {
      downloadJSON(card);
      const filename = sanitizeFilename(card.data.name || "未命名角色");
      showMessage("success", `已导出：${filename}_v${card.data.character_version || "1.0"}.json`);
    } catch (err) {
      showMessage("error", `导出失败：${(err as Error).message}`);
    }
  }, [card, showMessage]);

  const handleImport = useCallback(async () => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // 检查文件类型
      const validation = validateImportFile(file);
      if (!validation.ok) {
        showMessage("error", validation.error);
        return;
      }

      try {
        const result = await importFromFile(file);
        if (result.success) {
          onImport(result.card);
          showMessage(
            "success",
            `已导入角色卡：${result.card.data.name || "未命名"}（v${result.card.spec_version}）`,
          );
        } else {
          showMessage("error", result.error);
        }
      } catch (err) {
        showMessage("error", `导入失败：${(err as Error).message}`);
      }

      // 重置 input 以允许重复导入同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onImport, showMessage],
  );

  // 统计信息
  const fieldCount = Object.entries(card.data).filter(
    ([, v]) => {
      if (typeof v === "string") return v.length > 0;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "object" && v !== null) return Object.keys(v).length > 0;
      return false;
    },
  ).length;
  const extKeyCount = Object.keys(card.data.extensions).length;

  return (
    <div className="card">
      <div className="card-header">
        <span>📦 导入 / 导出</span>
      </div>

      {/* 文件信息 */}
      <div
        style={{
          marginBottom: "0.75rem",
          padding: "0.5rem 0.75rem",
          background: "#f8fafc",
          borderRadius: "0.375rem",
          fontSize: "0.75rem",
          color: "var(--color-text-secondary)",
          display: "flex",
          gap: "1rem",
        }}
      >
        <span>格式: CCv{card.spec_version}</span>
        <span>已填充字段: {fieldCount}</span>
        {extKeyCount > 0 && <span>扩展: {extKeyCount} 个</span>}
      </div>

      {/* 按钮组 */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <button className="btn-primary" onClick={handleExport} disabled={disabled}>
          📥 导出 JSON
        </button>
        <button className="btn-secondary" onClick={handleImport} disabled={disabled}>
          📤 导入 JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
      </div>

      {/* 说明 */}
      <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
        <p style={{ margin: "0 0 0.25rem" }}>
          • 导出为 SillyTavern 兼容的 Character Card V2 JSON 文件
        </p>
        <p style={{ margin: "0 0 0.25rem" }}>
          • 导入后可继续编辑所有字段
        </p>
        <p style={{ margin: "0 0 0.25rem" }}>
          • 导出 → 导入 保持内容一致（round-trip）
        </p>
        <p style={{ margin: "0 0 0.25rem" }}>
          • 未知扩展字段在导入/导出过程中不会丢失
        </p>
        <p style={{ margin: "0" }}>
          • 文件名包含特殊字符时会自动安全处理
        </p>
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`toast ${message.type}`}
          style={{ position: "relative", top: 0, right: 0, marginTop: "0.75rem" }}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
