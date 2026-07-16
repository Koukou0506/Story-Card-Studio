import type { IProviderAdapter } from "@/providers/types";
import type { AssistantContext } from "@/domain/project-assistant";
import type { ContinuitySourceReference } from "@/domain/continuity";
import { routeAssistantIntent } from "./assistant-intent-router";
import { AssistantToolRegistry } from "./assistant-tools";
import { createChangeProposal } from "./change-proposal";
export class AssistantOrchestrator {
  constructor(private registry: AssistantToolRegistry, private options: { maxToolCalls?: number; provider?: IProviderAdapter; model?: string } = {}) {}
  async respond(input: { message: string; context: AssistantContext; signal?: AbortSignal }) {
    const routed = routeAssistantIntent(input.message);
    if (routed.intent === "modify") {
      const proposal = createChangeProposal({ conversationId: "pending", userRequest: input.message, operation: "revision", targetType: input.context.sceneId ? "scene" : "project_note", targetIds: [input.context.sceneId || input.context.projectId], currentValue: input.context.textSelection?.text ?? "", proposedValue: input.context.textSelection?.text ?? "", reason: "修改请求已转换为待确认提案；请编辑建议值后确认。", sourceVersion: String(input.context.revision) });
      return { answer: "已创建变更提案。确认前不会修改项目。", sources: [], toolRuns: [], modelStatus: "not_requested", context: input.context, intent: routed.intent, proposal };
    }
    const ids = routed.intent === "visualize" ? ["visual.query"] : routed.intent === "search" ? ["project.search"] : /时间/.test(input.message) ? ["timeline.query"] : /伏笔|剧情线/.test(input.message) ? ["threads.query"] : /Canon/.test(input.message) ? ["canon.query"] : /连续性|关系|知情|状态/.test(input.message) ? ["continuity.query"] : ["project.search", "canon.query", "project.overview"];
    const toolRuns: Array<{ toolId: string; status: string }> = []; const sources: ContinuitySourceReference[] = []; const summaries: string[] = [];
    for (const id of [...new Set(ids)].slice(0, Math.min(this.options.maxToolCalls ?? 5, 8))) { input.signal?.throwIfAborted(); const result = await this.registry.execute(id, { query: input.message.replace(/^(搜索|查找)/, "").trim() }, { allowConfirmedWrite: false }, input.signal); toolRuns.push({ toolId: id, status: "completed" }); summaries.push(result.summary); sources.push(...result.sources); }
    let answer = summaries.filter(Boolean).join("\n"); let modelStatus = "not_requested";
    if (this.options.provider) { try { const response = await this.options.provider.generate({ systemPrompt: "只根据提供的项目查询结果简洁回答，区分事实与推断，不虚构来源。", userMessage: `问题：${input.message}\n查询结果：${answer.slice(0, 12000)}`, model: this.options.model || this.options.provider.defaultModel, responseFormat: "text", abortSignal: input.signal }); answer = response.content; modelStatus = "completed"; } catch { modelStatus = "failed_fallback"; } }
    return { answer: answer || "项目中没有足够资料。", sources: [...new Map(sources.map((x) => [`${x.sourceType}:${x.sourceId}`, x])).values()], toolRuns, modelStatus, context: input.context, intent: routed.intent, proposal: null };
  }
}
