import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SillyTavernContextSnapshotSchema } from "@/integrations/sillytavern/contracts";
import { authorizeSillyTavernIntegration, integrationError, readSillyTavernJson, sillyTavernOptions, withSillyTavernCors } from "@/server/sillytavern-integration-api";
import { sillyTavernTaskStore } from "@/server/sillytavern-task-store";

export const runtime = "nodejs";
const RequestSchema = z.object({ projectId: z.string().min(1).max(120), snapshot: SillyTavernContextSnapshotSchema }).strict();
export function OPTIONS(request: NextRequest) { return sillyTavernOptions(request); }
export async function POST(request: NextRequest) {
  const denied = authorizeSillyTavernIntegration(request); if (denied) return withSillyTavernCors(request, denied);
  try { const input = RequestSchema.parse(await readSillyTavernJson(request)); sillyTavernTaskStore.saveSnapshot(input.projectId, input.snapshot); return withSillyTavernCors(request, NextResponse.json({ snapshotId: input.snapshot.snapshotId }, { status: 201 })); }
  catch (error) { return withSillyTavernCors(request, integrationError(error)); }
}
