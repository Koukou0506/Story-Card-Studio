import { describe, expect, it } from "vitest";
import { validateImportFile } from "@/services/file-validation";

describe("mobile file validation", () => {
  it("accepts JSON selected through a mobile file picker", () => {
    expect(validateImportFile({ name: "project.json", size: 2048, type: "application/json" })).toEqual({ ok: true });
  });

  it("rejects unsupported and oversized files with Chinese errors", () => {
    expect(validateImportFile({ name: "novel.txt", size: 10, type: "text/plain" }).ok).toBe(false);
    const oversized = validateImportFile({ name: "project.json", size: 26 * 1024 * 1024, type: "application/json" });
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.error).toMatch(/25 MB/);
  });
});
