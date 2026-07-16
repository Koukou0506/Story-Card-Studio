// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { DocumentIngestionWorkspace } from "@/components/DocumentIngestionWorkspace";
import { createMockDocumentIngestionProject } from "@/services/document-ingestion/mock";

describe("C2.2 document ingestion workspace", () => {
  it("offers native mobile upload, staged review and explicit candidate writes", async () => {
    const project = createMockDocumentIngestionProject();
    const onUpdate = vi.fn();
    const onWriteCharacterCard = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(
      <DocumentIngestionWorkspace
        projects={[project]}
        selected={project}
        projectId="project-1"
        existingCharacterName=""
        isOnline
        onAdd={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
        onWriteCharacterCard={onWriteCharacterCard}
        onWriteLorebook={vi.fn()}
        onWriteCanonCandidate={vi.fn()}
        onWriteStyleProfile={vi.fn()}
        onWriteLanguageConstraints={vi.fn()}
      />,
    ));

    const upload = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(upload?.accept).toContain(".txt");
    expect(upload?.accept).toContain(".pdf");
    expect(upload?.accept).toContain(".epub");
    expect(upload?.accept).toContain(".docx");
    expect(upload?.accept).toContain(".md");
    expect(upload?.multiple).toBe(true);
    expect(container.textContent).toContain("作品导入与重建");
    expect(container.textContent).toContain("重复与版本");
    expect(container.textContent).toContain("重建方案");
    expect(container.textContent).toContain("我确认拥有处理该文件的权利");
    expect(container.textContent).toContain("章节确认");
    expect(container.textContent).toContain("Source Span");

    const people = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("角色卡草稿"));
    await act(async () => people?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const write = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("写入角色卡草稿"));
    expect(write).toBeDefined();
    await act(async () => write?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onWriteCharacterCard).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalled();

    root.unmount();
    container.remove();
  });

  it("keeps external analysis unavailable while offline but retains local parsing", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <DocumentIngestionWorkspace
        projects={[]}
        selected={null}
        projectId="project-1"
        existingCharacterName=""
        isOnline={false}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
        onWriteCharacterCard={vi.fn()}
        onWriteLorebook={vi.fn()}
        onWriteCanonCandidate={vi.fn()}
        onWriteStyleProfile={vi.fn()}
        onWriteLanguageConstraints={vi.fn()}
      />,
    ));
    expect(container.textContent).toContain("仅本地解析仍可用");
    const config = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("解析配置"));
    await act(async () => config?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("查看将发送给外部模型的 0 个区块");
    const external = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("外部模型分析"));
    expect((external as HTMLButtonElement | undefined)?.disabled).toBe(true);
    root.unmount();
  });

  it("accepts a TXT through the native file input used by mobile browsers", async () => {
    const onAdd = vi.fn();
    const onUpdate = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <DocumentIngestionWorkspace projects={[]} selected={null} projectId="mobile-project" existingCharacterName="" isOnline
        onAdd={onAdd} onUpdate={onUpdate} onDelete={vi.fn()} onSelect={vi.fn()}
        onWriteCharacterCard={vi.fn()} onWriteLorebook={vi.fn()} onWriteCanonCandidate={vi.fn()}
        onWriteStyleProfile={vi.fn()} onWriteLanguageConstraints={vi.fn()} />,
    ));
    const permission = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => permission.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const input = container.querySelector('input[type="file"][accept*=".txt"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["第一章\n手机上传正文。"], "mobile.txt", { type: "text/plain" })] });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalled();
    expect(onUpdate.mock.calls.at(-1)?.[0].chapters).toHaveLength(1);
    root.unmount();
  });
});
