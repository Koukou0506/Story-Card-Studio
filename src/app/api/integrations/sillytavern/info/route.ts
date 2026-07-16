import { NextRequest, NextResponse } from "next/server";
import { SILLYTAVERN_EXTENSION_VERSION, SILLYTAVERN_INTEGRATION_API_VERSION } from "@/integrations/sillytavern/contracts";
import { authorizeSillyTavernIntegration, sillyTavernOptions, withSillyTavernCors } from "@/server/sillytavern-integration-api";

export const runtime = "nodejs";
export function OPTIONS(request: NextRequest) { return sillyTavernOptions(request); }
export async function GET(request: NextRequest) {
  const denied = authorizeSillyTavernIntegration(request); if (denied) return withSillyTavernCors(request, denied);
  return withSillyTavernCors(request, NextResponse.json({ ok: true, apiVersion: SILLYTAVERN_INTEGRATION_API_VERSION, appVersion: "0.1.0", minimumExtensionVersion: SILLYTAVERN_EXTENSION_VERSION, workspaceEnabled: true, capabilities: { projects: true, tasks: true, characterWriteback: false, worldInfoWriteback: false } }));
}
