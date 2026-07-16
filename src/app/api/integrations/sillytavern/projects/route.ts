import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createEmptyProjectDraft } from "@/domain/project-draft";
import { createProjectRecord } from "@/storage/types";
import { getWorkspaceStore } from "@/server/workspace-store";
import { authorizeSillyTavernIntegration, integrationError, readSillyTavernJson, sillyTavernOptions, withSillyTavernCors } from "@/server/sillytavern-integration-api";

export const runtime = "nodejs";
export function OPTIONS(request: NextRequest) { return sillyTavernOptions(request); }
export async function GET(request: NextRequest) { const denied = authorizeSillyTavernIntegration(request); if (denied) return withSillyTavernCors(request, denied); try { return withSillyTavernCors(request, NextResponse.json({ projects: await getWorkspaceStore().listProjects() })); } catch (error) { return withSillyTavernCors(request, integrationError(error)); } }
export async function POST(request: NextRequest) {
  const denied = authorizeSillyTavernIntegration(request); if (denied) return withSillyTavernCors(request, denied);
  try { const input = z.object({ name: z.string().trim().min(1).max(200) }).strict().parse(await readSillyTavernJson(request)); const draft = createEmptyProjectDraft(); draft.projectInput.projectName = input.name; const id = `st_${crypto.randomUUID().replace(/-/g, "")}`; const project = await getWorkspaceStore().createProject(createProjectRecord(id, draft, "server")); return withSillyTavernCors(request, NextResponse.json({ project }, { status: 201 })); }
  catch (error) { return withSillyTavernCors(request, integrationError(error)); }
}
