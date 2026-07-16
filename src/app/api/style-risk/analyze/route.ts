import { NextRequest, NextResponse } from "next/server";
import { StyleRiskAnalysisRequestSchema } from "@/domain/style-risk";
import { createProvider, getDefaultProviderType } from "@/providers/factory";
import { ProviderTypeSchema } from "@/providers/types";
import { analyzeStyleRisk } from "@/services/style-risk-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json(); const input = StyleRiskAnalysisRequestSchema.parse(body.request);
    const type = ProviderTypeSchema.catch(getDefaultProviderType()).parse(body.provider); const provider = createProvider({ type });
    const report = await analyzeStyleRisk(input, { provider, model: String(body.model || provider.defaultModel), abortSignal: request.signal, timeoutMs: Number(process.env.API_TIMEOUT_MS || 60000) });
    return NextResponse.json({ report });
  } catch (error) { return NextResponse.json({ error: `文本诊断失败：${(error as Error).message}` }, { status: 422 }); }
}
