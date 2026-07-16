import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ExtensionToolSchema, IntegrationTaskOptionsSchema } from "@/integrations/sillytavern/contracts";
import { createProvider, getDefaultProviderType } from "@/providers/factory";
import { executeSillyTavernTool } from "@/services/sillytavern-integration-tasks";
import { authorizeSillyTavernIntegration, integrationError, readSillyTavernJson, sillyTavernOptions, withSillyTavernCors } from "@/server/sillytavern-integration-api";
import { sillyTavernTaskStore } from "@/server/sillytavern-task-store";

export const runtime = "nodejs";
const RequestSchema = z.object({ projectId: z.string().min(1).max(120), snapshotId: z.string().min(1).max(200), tool: ExtensionToolSchema, options: IntegrationTaskOptionsSchema.optional() }).strict();
export function OPTIONS(request: NextRequest) { return sillyTavernOptions(request); }
export async function POST(request: NextRequest) {
  const denied = authorizeSillyTavernIntegration(request); if (denied) return withSillyTavernCors(request, denied);
  try { const input = RequestSchema.parse(await readSillyTavernJson(request)); const provider = createProvider({ type: getDefaultProviderType() }); const task = sillyTavernTaskStore.createTask(input.projectId, input.snapshotId, input.tool, (snapshot, tool, signal, options) => executeSillyTavernTool(snapshot, tool, { provider, model: provider.defaultModel, abortSignal: signal, timeoutMs: Number.parseInt(process.env.API_TIMEOUT_MS ?? "60000", 10), styleRiskBaseline: options.styleRiskBaseline }), input.options); return withSillyTavernCors(request, NextResponse.json(task, { status: 202 })); }
  catch (error) { return withSillyTavernCors(request, integrationError(error)); }
}
