import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DraftVersionSchema, EditScopeSchema, SceneDraftSchema } from "@/domain/prose";
import { createProvider, getDefaultProviderType } from "@/providers/factory";
import { ProviderTypeSchema } from "@/providers/types";
import { createStyleRiskRevision } from "@/services/style-risk-service";

const RequestSchema = z.object({
  text: z.string().min(1).max(100_000), sceneDraft: SceneDraftSchema.optional(), baseVersion: DraftVersionSchema.optional(), scope: EditScopeSchema.optional(),
  issueIds: z.array(z.string()).default([]), instruction: z.string().max(2000).default("减少机械感"), provider: ProviderTypeSchema.optional(), model: z.string().optional(),
}).refine((value) => !value.sceneDraft || Boolean(value.baseVersion && value.scope), "创建 Revision 时必须提供正文版本和 Edit Scope。");

export async function POST(request: NextRequest) {
  try {
    const input = RequestSchema.parse(await request.json()); const provider = createProvider({ type: input.provider ?? getDefaultProviderType() });
    const response = await provider.generate({
      systemPrompt: "任务类型：正文生成。只返回局部优化后的目标文本；不得输出解释、JSON 或 AI 作者身份判断。保持剧情事实、人物关系、行动结果和锁定内容，不承诺绕过检测器。",
      userMessage: `优化要求：${input.instruction}\n只修改以下范围：\n${input.text}`, model: input.model || provider.defaultModel, responseFormat: "text", abortSignal: request.signal,
    });
    if (!input.sceneDraft || !input.baseVersion || !input.scope) return NextResponse.json({ replacement: response.content });
    const result = createStyleRiskRevision({ sceneDraft: input.sceneDraft, baseVersion: input.baseVersion, replacement: response.content, scope: input.scope, issueIds: input.issueIds, instruction: input.instruction, provider: provider.type, model: input.model || provider.defaultModel });
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: `局部优化失败：${(error as Error).message}` }, { status: 422 }); }
}
