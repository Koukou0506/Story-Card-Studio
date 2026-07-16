import { NextRequest, NextResponse } from "next/server";
import { LorebookGenerationInputSchema } from "@/domain/lorebook";
import { ProviderTypeSchema } from "@/providers/types";
import { createProvider, getDefaultProviderType } from "@/providers/factory";
import { GenerationError } from "@/services/generator";
import { generateLorebook } from "@/services/lorebook-generator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = LorebookGenerationInputSchema.safeParse(body.input);
    if (!input.success) return NextResponse.json({ error: "世界书生成输入格式有误。",
      details: input.error.issues.map(i => ({ field: i.path.join("."), message: i.message })) }, { status: 400 });
    const providerType = ProviderTypeSchema.catch(getDefaultProviderType()).parse(body.provider);
    const provider = createProvider({ type: providerType });
    const result = await generateLorebook(input.data, { provider, model: String(body.model || provider.defaultModel),
      timeoutMs: Number.parseInt(process.env.API_TIMEOUT_MS || "60000", 10), abortSignal: request.signal });
    return NextResponse.json({ success: true, data: result.lorebook,
      meta: { model: result.model, retriesUsed: result.retriesUsed, usage: result.usage } });
  } catch (error) {
    if (error instanceof GenerationError) {
      const status = { timeout: 504, cancelled: 499, provider_error: 502, validation_error: 422, parse_error: 422 }[error.code];
      return NextResponse.json({ error: error.message, code: error.code, retriesUsed: error.retriesUsed }, { status });
    }
    return NextResponse.json({ error: `世界书生成服务错误：${(error as Error).message}` }, { status: 500 });
  }
}
