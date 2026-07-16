import { z } from "zod";
import { CharacterCardV2Schema } from "@/domain/character-card";
import { SillyTavernWorldInfoSchema } from "@/adapters/sillytavern-world-info";

export const SILLYTAVERN_INTEGRATION_API_VERSION = "1.0.0";
export const SILLYTAVERN_EXTENSION_VERSION = "0.2.0";
export const SILLYTAVERN_MINIMUM_VERSION = "1.12.12";
export const SILLYTAVERN_CONTRACT_TESTED_VERSION = "1.18.0";

export const ChatRangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("last"), roles: z.array(z.enum(["user", "assistant"])).optional() }),
  z.object({ kind: z.literal("recent"), count: z.number().int().min(1).max(200).default(4), roles: z.array(z.enum(["user", "assistant"])).optional() }),
  z.object({ kind: z.literal("manual"), start: z.number().int().min(0), end: z.number().int().min(0), roles: z.array(z.enum(["user", "assistant"])).optional() }),
  z.object({ kind: z.literal("full"), roles: z.array(z.enum(["user", "assistant"])).optional() }),
]);

export const SnapshotMessageSchema = z.object({
  index: z.number().int().min(0), role: z.enum(["user", "assistant"]), name: z.string().max(200),
  text: z.string().max(100_000), fingerprint: z.string().length(64),
});

export const WorldInfoSnapshotSchema = z.object({
  name: z.string().min(1).max(240), fingerprint: z.string().length(64),
  data: SillyTavernWorldInfoSchema, warnings: z.array(z.string()).default([]),
});

export const SillyTavernContextSnapshotSchema = z.object({
  snapshotId: z.string().min(1), createdAt: z.string(), mode: z.enum(["none", "character", "group"]),
  chatId: z.string().nullable(),
  character: z.object({
    index: z.number().int().min(0), name: z.string(), avatar: z.string(), modifiedMarker: z.string(),
    fingerprint: z.string().length(64), card: CharacterCardV2Schema,
  }).nullable(),
  group: z.object({ id: z.string(), name: z.string(), members: z.array(z.string()), selectedMembers: z.array(z.string()) }).nullable(),
  chat: z.object({ range: ChatRangeSchema, messages: z.array(SnapshotMessageSchema), characterCount: z.number().int().min(0), participants: z.array(z.string()) }),
  worldInfo: z.array(WorldInfoSnapshotSchema),
  persona: z.object({ name: z.string(), description: z.string() }).nullable().default(null),
  capabilities: z.object({ characterWriteback: z.boolean(), worldInfoWriteback: z.boolean(), associationWriteback: z.boolean() }),
}).strict();

export const ProjectAssociationSchema = z.object({
  apiVersion: z.literal(SILLYTAVERN_INTEGRATION_API_VERSION), projectId: z.string().min(1).max(120),
  workspaceId: z.string().min(1).max(120), characterFingerprint: z.string().max(128).nullable(),
  worldInfoFingerprint: z.string().max(128).nullable(), lastSyncedAt: z.string(), lastAnalysisVersion: z.string().nullable(),
}).strict();

export const ExtensionToolSchema = z.enum([
  "character_generate", "character_analyze", "lorebook_generate", "lorebook_analyze",
  "plot_analysis", "character_fit", "continuity_analysis",
  "style_risk",
]);

export const IntegrationTaskOptionsSchema = z.object({
  styleRiskBaseline: z.enum(["generic", "project", "personal", "character"]).default("generic"),
}).default({ styleRiskBaseline: "generic" });

export const IntegrationTaskSchema = z.object({
  id: z.string().min(1), projectId: z.string().min(1), snapshotId: z.string().min(1), tool: ExtensionToolSchema,
  options: IntegrationTaskOptionsSchema,
  status: z.enum(["pending", "running", "completed", "cancelled", "failed", "stale"]),
  createdAt: z.string(), modifiedAt: z.string(), error: z.string().nullable(),
  result: z.object({ kind: z.enum(["character_card", "lorebook", "analysis_report", "quality_report", "style_risk_report"]), payload: z.unknown(), warnings: z.array(z.string()) }).nullable(),
}).strict();

export const IntegrationInfoSchema = z.object({
  ok: z.boolean(), apiVersion: z.literal(SILLYTAVERN_INTEGRATION_API_VERSION), appVersion: z.string(),
  minimumExtensionVersion: z.string(), workspaceEnabled: z.boolean(),
  capabilities: z.object({ projects: z.boolean(), tasks: z.boolean(), characterWriteback: z.literal(false), worldInfoWriteback: z.literal(false) }),
}).strict();

export const ExtensionProjectSummarySchema = z.object({
  id: z.string().min(1), name: z.string().min(1), version: z.number().int().nonnegative(),
  modifiedAt: z.string(),
}).passthrough();

export const ExtensionProjectRecordSchema = ExtensionProjectSummarySchema.extend({
  draft: z.unknown(),
});

export type ChatRange = z.infer<typeof ChatRangeSchema>;
export type SillyTavernContextSnapshot = z.infer<typeof SillyTavernContextSnapshotSchema>;
export type ProjectAssociation = z.infer<typeof ProjectAssociationSchema>;
export type ExtensionTool = z.infer<typeof ExtensionToolSchema>;
export type IntegrationTaskOptions = z.infer<typeof IntegrationTaskOptionsSchema>;
export type IntegrationTask = z.infer<typeof IntegrationTaskSchema>;
export type IntegrationInfo = z.infer<typeof IntegrationInfoSchema>;
export type ExtensionProjectSummary = z.infer<typeof ExtensionProjectSummarySchema>;
export type ExtensionProjectRecord = z.infer<typeof ExtensionProjectRecordSchema>;
