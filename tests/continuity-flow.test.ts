import { describe, expect, it } from "vitest";
import { createEmptyProjectDraft, migrateProjectDraft, PROJECT_DATA_VERSION } from "@/domain/project-draft";
import { ContinuityProjectSchema } from "@/domain/continuity";
import { MockProvider } from "@/providers/mock";
import { createMockContinuityProject } from "@/services/continuity-mock";
import { buildContinuityContext } from "@/services/continuity-context-builder";
import { generateContinuityProject, validateContinuityReferences } from "@/services/continuity-generator";
import { exportContinuityJSON, exportContinuityMarkdown, importContinuityJSON, safeContinuityFilename } from "@/services/continuity-export";

describe("C1 Mock Provider complete flow", () => {
  it("demonstrates Canon, conflict, Retcon, snapshots, threads, foreshadows, drift, health and next context", () => {
    const project = createMockContinuityProject(); expect(ContinuityProjectSchema.parse(project)).toEqual(project);
    expect(project.canonLedger.facts.filter((f) => f.status === "confirmed" || f.status === "locked")).toHaveLength(5);
    expect(project.canonLedger.facts.filter((f) => f.status === "candidate")).toHaveLength(3);
    expect(project.canonLedger.conflicts).toHaveLength(1); expect(project.canonLedger.retcons).toHaveLength(1);
    expect(project.characterSnapshots).toHaveLength(2); expect(project.relationshipSnapshots).toHaveLength(2);
    expect(project.plotThreads).toHaveLength(3); expect(project.openQuestions).toHaveLength(2); expect(project.foreshadowThreads).toHaveLength(2);
    expect(project.foreshadowThreads.some((f) => f.overdue)).toBe(true); expect(project.drifts).toHaveLength(1); expect(project.healthReports).toHaveLength(1); expect(project.contextPackages).toHaveLength(1);
  });

  it("runs structured generation through Mock Provider without a real API", async () => {
    const project = createMockContinuityProject(); const result = await generateContinuityProject({ project, mode: "project_continuity", context: {}, allowedSourceIds: project.canonLedger.facts.flatMap((f) => f.sources.map((s) => s.sourceId)), provider: new MockProvider(), model: "mock-model", timeoutMs: 3000, maxRetries: 0 });
    expect(result.project.canonLedger.facts.length).toBeGreaterThan(5); expect(result.model).toBe("mock-model"); expect(result.retriesUsed).toBe(0);
  });

  it("marks unavailable model references invalid", () => {
    const project = createMockContinuityProject(); const result = validateContinuityReferences(project, ["user-liu"]);
    expect(result.warnings.length).toBeGreaterThan(0); expect(result.project.canonLedger.facts.flatMap((f) => f.sources).some((s) => !s.valid)).toBe(true);
  });
});

describe("C1 context, export and migration", () => {
  it("builds an inspectable budgeted context and prioritizes locked Canon", () => {
    const draft = createEmptyProjectDraft(); const project = createMockContinuityProject(); const context = buildContinuityContext(draft, project, "", 50);
    expect(context.totalCharacters).toBeLessThanOrEqual(50); expect(context.truncated).toBe(true); expect(context.items.find((i) => i.title === "柳如烟的身份")?.included).toBe(true);
  });

  it("exports Markdown sections and JSON round trips without secrets", () => {
    const project = createMockContinuityProject(); const markdown = exportContinuityMarkdown(project); expect(markdown).toContain("## Canon"); expect(markdown).toContain("## 知情矩阵"); expect(markdown).toContain("## 下一章上下文包");
    const json = exportContinuityJSON(project); expect(importContinuityJSON(json)).toEqual(project); expect(json).not.toMatch(/api[_-]?key/i); expect(json).not.toContain("debugLog");
  });

  it("sanitizes export filenames", () => { expect(safeContinuityFilename('A:/\\*?"<>|')).not.toMatch(/[<>:"/\\|?*]/); });

  it("migrates a v6 project without losing A1-B3 data", () => {
    const current = createEmptyProjectDraft(); current.characterData.name = "保留角色"; current.projectInput.originalIdea = "保留创意";
    const raw = { ...current, dataVersion: 6 } as Record<string, unknown>; delete raw.continuityProjects; delete raw.selectedContinuityProjectId;
    const migrated = migrateProjectDraft(raw); expect(migrated.dataVersion).toBe(PROJECT_DATA_VERSION); expect(migrated.characterData.name).toBe("保留角色"); expect(migrated.projectInput.originalIdea).toBe("保留创意"); expect(migrated.continuityProjects).toEqual([]);
  });

  it("preserves raw recovery data when migration fails", () => {
    const raw = "invalid-project"; const migrated = migrateProjectDraft(raw); expect(migrated.migrationError).toBeTruthy(); expect(migrated.recoveryData).toBe(raw);
  });
});
