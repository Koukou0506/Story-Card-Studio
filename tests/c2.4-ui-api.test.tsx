// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { StyleRiskWorkspace } from "@/components/StyleRiskWorkspace";
import { createPersonalStyleBaseline, PersonalStyleBaselineStore } from "@/services/style-risk-baselines";
import { createExtensionPanel } from "../integrations/sillytavern-extension/src/panel";

describe("C2.4 workspace, personal baselines and Extension entry", () => {
  it("creates and deletes an abstract personal baseline without retaining source text", () => {
    const baseline = createPersonalStyleBaseline({ name: "我的短篇", text: "风吹过长街。她停在门前。".repeat(30), genre: "悬疑", pointOfView: "第三人称限知", sampleScope: "第一章" });
    expect(baseline.sourceTextStored).toBe(false);
    expect(JSON.stringify(baseline)).not.toContain("风吹过长街");
    const store = new PersonalStyleBaselineStore(); store.save(baseline); expect(store.list()).toHaveLength(1); store.delete(baseline.id); expect(store.list()).toHaveLength(0);
  });

  it("renders a single-column-capable diagnosis flow with the mandatory limitation", async () => {
    const container = document.createElement("div"); const root = createRoot(container);
    await act(async () => root.render(<StyleRiskWorkspace manuscript={null} isOnline={false} provider="mock" model="mock-model" onUpdateManuscript={vi.fn()} />));
    expect(container.textContent).toContain("AI 味与文本机械感诊断");
    expect(container.textContent).toContain("不能可靠证明文本由 AI 或人类创作");
    expect(container.textContent).toContain("纯本地确定性诊断");
    expect(container.querySelector("textarea")).not.toBeNull();
    root.unmount();
  });

  it("adds the selected-message diagnosis tool and baseline selector to the Extension panel", () => {
    const run = vi.fn(); const panel = createExtensionPanel({ onConnect: vi.fn(), onSend: vi.fn(), onRunTool: run, onOpenApp: vi.fn() });
    document.body.append(panel.element);
    expect(panel.element.textContent).toContain("诊断选定文本的 AI 味与机械感");
    expect(panel.element.textContent).toContain("诊断基准");
    const button = panel.element.querySelector('button[data-action="style_risk"]') as HTMLButtonElement;
    button.click(); expect(run).toHaveBeenCalledWith("style_risk");
    panel.element.remove();
  });
});
