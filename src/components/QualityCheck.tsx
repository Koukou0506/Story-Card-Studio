"use client";

import { QualityReport, Severity } from "@/domain/quality-check";

interface QualityCheckProps {
  report: QualityReport | null;
}

// ============================================
// 质量检查区组件
// ============================================

const SEVERITY_CONFIG: Record<Severity, { label: string; className: string; icon: string }> = {
  error: { label: "错误", className: "error", icon: "❌" },
  warning: { label: "警告", className: "warning", icon: "⚠️" },
  info: { label: "提示", className: "info", icon: "ℹ️" },
};

export function QualityCheck({ report }: QualityCheckProps) {
  if (!report) {
    return (
      <div className="card">
        <div className="card-header">
          <span>🔍 质量检查</span>
        </div>
        <div
          style={{
            textAlign: "center",
            padding: "2rem",
            color: "var(--color-text-secondary)",
            fontSize: "0.875rem",
          }}
        >
          尚未运行质量检查。生成或编辑角色卡后点击"检查质量"按钮。
        </div>
      </div>
    );
  }

  if (report.issues.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <span>🔍 质量检查</span>
          <span className="tag" style={{ background: "#dcfce7", color: "#166534" }}>
            ✅ 全部通过
          </span>
        </div>
        <div
          style={{
            textAlign: "center",
            padding: "2rem",
            color: "#166534",
            fontSize: "0.875rem",
          }}
        >
          所有质量检查已通过，角色卡状态良好。
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <span>🔍 质量检查</span>
        <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
          {report.issues.length} 个问题
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {report.issues.map((issue, index) => {
          const config = SEVERITY_CONFIG[issue.severity];
          return (
            <div
              key={index}
              style={{
                padding: "0.75rem",
                borderRadius: "0.375rem",
                border: "1px solid var(--color-border)",
                borderLeft: `4px solid ${
                  issue.severity === "error"
                    ? "var(--color-error)"
                    : issue.severity === "warning"
                      ? "var(--color-warning)"
                      : "var(--color-info)"
                }`,
              }}
            >
              {/* 标题行 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "0.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>{config.icon}</span>
                  <strong style={{ fontSize: "0.875rem" }}>{issue.name}</strong>
                </div>
                <span className={`tag ${config.className}`}>{config.label}</span>
              </div>

              {/* 详细信息 */}
              <div style={{ fontSize: "0.8125rem", lineHeight: 1.5 }}>
                <div style={{ marginBottom: "0.25rem" }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>涉及字段：</span>
                  {issue.fields.map((f, i) => (
                    <code
                      key={i}
                      style={{
                        background: "#f1f5f9",
                        padding: "0.0625rem 0.375rem",
                        borderRadius: "0.1875rem",
                        fontSize: "0.75rem",
                        marginLeft: i > 0 ? "0.25rem" : "0.25rem",
                      }}
                    >
                      {f}
                    </code>
                  ))}
                </div>
                <div style={{ marginBottom: "0.25rem" }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>判断依据：</span>
                  {issue.rationale}
                </div>
                <div style={{ color: "var(--color-primary)" }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>建议：</span>
                  {issue.suggestion}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: "0.75rem",
          padding: "0.5rem",
          background: "#f8fafc",
          borderRadius: "0.375rem",
          fontSize: "0.75rem",
          color: "var(--color-text-secondary)",
        }}
      >
        质量检查仅提供建议，不会自动修改角色卡内容。请根据建议自行判断是否需要修改。
      </div>
    </div>
  );
}
