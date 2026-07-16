import { ProjectAssociationSchema, SILLYTAVERN_INTEGRATION_API_VERSION, type ProjectAssociation } from "../../../src/integrations/sillytavern/contracts";

export function createProjectAssociation(input: Pick<ProjectAssociation, "projectId" | "workspaceId" | "characterFingerprint" | "worldInfoFingerprint"> & Partial<Pick<ProjectAssociation, "lastAnalysisVersion">>): ProjectAssociation {
  return ProjectAssociationSchema.parse({ ...input, apiVersion: SILLYTAVERN_INTEGRATION_API_VERSION, lastSyncedAt: new Date().toISOString(), lastAnalysisVersion: input.lastAnalysisVersion ?? null });
}

export function readProjectAssociation(extensions: unknown): ProjectAssociation | null {
  if (!extensions || typeof extensions !== "object") return null;
  const result = ProjectAssociationSchema.safeParse((extensions as Record<string, unknown>).story_card_studio);
  return result.success ? result.data : null;
}

export function assertSerializableAssociation(value: ProjectAssociation): void {
  if (JSON.stringify(value) === undefined) throw new Error("项目关联数据无法序列化。");
}
