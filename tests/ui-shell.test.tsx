import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppShell } from "@/components/ui/AppShell";
import { NAV_GROUPS, getViewMeta } from "@/components/ui/navigation";

describe("Phase C2.0 application shell", () => {
  it("groups the complete workflow and exposes Home and Settings without a quality destination", () => {
    const labels = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.label));
    expect(labels).toContain("项目首页");
    expect(labels).toContain("创意输入");
    expect(labels).toContain("角色卡");
    expect(labels).toContain("世界书");
    expect(labels).toContain("剧情分析");
    expect(labels).toContain("小说规划");
    expect(labels).toContain("正文写作");
    expect(labels).toContain("连续性中心");
    expect(labels).toContain("导入导出");
    expect(labels).toContain("设置");
    expect(labels).not.toContain("项目质量");
    expect(getViewMeta("prose").title).toBe("正文写作");
  });

  it("renders semantic navigation, skip link, current page and save state", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onNavigate = vi.fn();

    await act(async () => root.render(
      <AppShell
        activeView="character"
        onNavigate={onNavigate}
        projectName="雾港计划"
        draftVersion={7}
        hasDraft
        density="comfortable"
        pageTitle="角色卡"
        pageSubtitle="编辑人物设定和互动内容"
      >
        <p>workspace content</p>
      </AppShell>,
    ));

    expect(container.querySelector('a[href="#main-content"]')?.textContent).toContain("跳到主内容");
    expect(container.querySelector("main#main-content")?.textContent).toContain("workspace content");
    expect(container.querySelector('[aria-current="page"]')?.textContent).toContain("角色卡");
    expect(container.textContent).toContain("本地已保存");
    expect(container.textContent).toContain("数据 v7");

    const home = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("项目首页"));
    await act(async () => home?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onNavigate).toHaveBeenCalledWith("home");

    root.unmount();
    container.remove();
  });

  it("composes Home and Settings through AppShell without a standalone quality route", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
    expect(source).toContain("<AppShell");
    expect(source).toContain("<ProjectHome");
    expect(source).toContain("<SettingsWorkspace");
    expect(source).not.toContain('activeTab === "quality"');
    expect(source).not.toContain('id: "quality"');
  });

  it("defines the approved semantic palette and accessibility contracts", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("#FCFCF1");
    expect(css).toContain("#294A97");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(".app-shell");
    expect(css).toContain("@media (max-width: 1024px)");
    expect(css).toContain("@media (max-width: 768px)");
    expect(css).toContain(".settings-layout { grid-template-columns: 1fr; }");
  });

  it("uses real buttons for collapsible editor sections", () => {
    for (const file of ["src/components/ProjectInput.tsx", "src/components/CharacterEditor.tsx"]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).toContain('<button');
      expect(source).toContain('className={`collapsible-toggle');
      expect(source).toContain('aria-expanded={showAdvanced}');
    }
  });

  it("loads the visual system through a dedicated stylesheet entry", () => {
    const layout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toContain('import "./visual-system.css"');
    expect(layout).not.toContain('import "./globals.css"');
    const entry = readFileSync(resolve(process.cwd(), "src/app/visual-system.css"), "utf8");
    expect(entry).toContain('@import "./globals.css"');
  });

  it("allows the local development origins used by browser previews", () => {
    const config = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain("allowedDevOrigins");
    expect(config).toContain('"localhost"');
    expect(config).toContain('"127.0.0.1"');
  });
});
