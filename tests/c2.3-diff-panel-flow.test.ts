import { describe, expect, it, vi } from "vitest";
import { createCharacterDiff, createWorldInfoDiff, resolveWriteback } from "../integrations/sillytavern-extension/src/diff";
import { createExtensionPanel } from "../integrations/sillytavern-extension/src/panel";

describe("C2.3 diff, safety fallback and panel flow", () => {
  it("creates field-level character and entry-level World Info diffs", () => {
    const character = createCharacterDiff({ name: "柳青", description: "旧" }, { name: "柳青", description: "新", scenario: "临水镇" });
    expect(character.map((item) => item.path)).toEqual(["description", "scenario"]);
    const world = createWorldInfoDiff({ entries: { 1: { uid: 1, content: "旧" } } }, { entries: { 1: { uid: 1, content: "新" }, 2: { uid: 2, content: "新增" } } });
    expect(world.map((item) => item.kind)).toEqual(["modified", "added"]);
  });

  it("blocks stale writes and degrades unavailable write APIs to export", async () => {
    await expect(resolveWriteback({ confirmed: true, originalFingerprint: "a", currentFingerprint: "b", capabilityAvailable: true })).resolves.toEqual({ action: "blocked", reason: "source_changed" });
    await expect(resolveWriteback({ confirmed: true, originalFingerprint: "a", currentFingerprint: "a", capabilityAvailable: false })).resolves.toEqual({ action: "export", reason: "write_api_unavailable" });
    await expect(resolveWriteback({ confirmed: false, originalFingerprint: "a", currentFingerprint: "a", capabilityAvailable: true })).resolves.toEqual({ action: "cancel", reason: "confirmation_required" });
  });

  it("loads a usable offline panel and never renders response HTML", () => {
    const panel = createExtensionPanel({ onConnect: vi.fn(), onSend: vi.fn(), onRunTool: vi.fn(), onOpenApp: vi.fn(), onOpenImport: vi.fn(), onOpenAssistant: vi.fn(), onOpenSettingChange: vi.fn() });
    panel.setState({ connection: "offline", contextLabel: "未选择角色", projectLabel: "未关联", taskLabel: "无任务", preview: "<img src=x onerror=alert(1)>" });
    document.body.append(panel.element);
    expect(panel.element.textContent).toContain("服务离线");
    expect(panel.element.querySelector("img")).toBeNull();
    expect(panel.element.querySelector("button[data-action='connect']")).not.toBeNull();
    expect(panel.element.querySelector("button[data-action='open-work-import']")?.textContent).toBe("打开作品导入与重建");
    expect(panel.element.querySelector("button[data-action='open-project-assistant']")?.textContent).toBe("打开项目助手");
    expect(panel.element.querySelector("button[data-action='open-setting-change']")?.textContent).toBe("创建设定变更提案");
  });
});
