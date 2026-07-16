import { NextRequest, NextResponse } from "next/server";
import { ProjectInputSchema } from "@/domain/project-input";
import { createProvider, getDefaultProviderType } from "@/providers/factory";
import { ProviderType } from "@/providers/types";
import { generateCharacterCard, GenerationError } from "@/services/generator";

// ============================================
// POST /api/generate
// 角色卡生成 API
// ============================================

export async function POST(request: NextRequest) {
  try {
    // 解析请求体
    const body = await request.json().catch(() => {
      return NextResponse.json(
        { error: "请求体不是有效的 JSON 格式。请检查请求内容。" },
        { status: 400 },
      );
    });
    if (!body || typeof body !== "object") return body; // 上面已返回

    // 校验用户输入
    const inputResult = ProjectInputSchema.safeParse(body.input);
    if (!inputResult.success) {
      return NextResponse.json(
        {
          error: "输入信息不完整或格式有误。",
          details: inputResult.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    // 获取 provider 配置（从请求体或环境变量）
    const providerType: ProviderType = body.provider || getDefaultProviderType();
    const model = body.model || "";

    // 创建 Provider
    let provider;
    try {
      provider = createProvider({ type: providerType });
    } catch (err) {
      return NextResponse.json(
        { error: `无法初始化模型服务：${(err as Error).message}` },
        { status: 500 },
      );
    }

    // 获取超时配置
    const timeoutMs = parseInt(process.env.API_TIMEOUT_MS || "60000", 10);

    // 调用生成服务
    const result = await generateCharacterCard(inputResult.data, {
      provider,
      model,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      timeoutMs,
    });

    // 返回结果
    return NextResponse.json({
      success: true,
      data: result.data,
      meta: {
        model: result.model,
        retriesUsed: result.retriesUsed,
        usage: result.usage,
      },
    });
  } catch (err) {
    // 处理已知错误类型
    if (err instanceof GenerationError) {
      const statusMap: Record<string, number> = {
        timeout: 504,
        cancelled: 499,
        provider_error: 502,
        validation_error: 422,
        parse_error: 422,
      };
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          retriesUsed: err.retriesUsed,
        },
        { status: statusMap[err.code] || 500 },
      );
    }

    // 未知错误
    console.error("生成角色卡时发生未知错误:", err);
    return NextResponse.json(
      {
        error: "服务器内部错误，请稍后重试。如果问题持续出现，请尝试使用 Mock Provider。",
      },
      { status: 500 },
    );
  }
}
