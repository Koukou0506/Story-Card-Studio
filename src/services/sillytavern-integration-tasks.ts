import { CharacterCardV2Schema } from "@/domain/character-card";
import { createEmptyAnalysisProject } from "@/domain/plot-analysis";
import { createEmptyLorebook, LorebookGenerationInputSchema } from "@/domain/lorebook";
import { ProjectInputSchema } from "@/domain/project-input";
import { SillyTavernWorldInfoAdapter } from "@/adapters/sillytavern-world-info";
import type { IProviderAdapter } from "@/providers/types";
import { generateCharacterCard } from "@/services/generator";
import { generateLorebook } from "@/services/lorebook-generator";
import { generatePlotAnalysis } from "@/services/analysis-generator";
import { runLorebookQualityChecks } from "@/services/lorebook-quality";
import { analyzeStyleRisk } from "@/services/style-risk-service";
import type { ExtensionTool, IntegrationTask, SillyTavernContextSnapshot } from "@/integrations/sillytavern/contracts";

export interface SillyTavernToolConfig { provider: IProviderAdapter; model: string; abortSignal?: AbortSignal; timeoutMs?: number; styleRiskBaseline?: "generic" | "project" | "personal" | "character" }
export type SillyTavernToolResult = NonNullable<IntegrationTask["result"]>;

function chatText(snapshot: SillyTavernContextSnapshot): string {
  return snapshot.chat.messages.map((message) => `${message.name}：${message.text}`).join("\n");
}

function snapshotLorebooks(snapshot: SillyTavernContextSnapshot) {
  const adapter = new SillyTavernWorldInfoAdapter();
  return snapshot.worldInfo.map((item) => adapter.import(item.data, { name: item.name }).lorebook);
}

export async function executeSillyTavernTool(snapshot: SillyTavernContextSnapshot, tool: ExtensionTool, config: SillyTavernToolConfig): Promise<SillyTavernToolResult> {
  const warning = "结果仅供预览，尚未写回 SillyTavern。";
  const timeoutMs = config.timeoutMs ?? 60_000;
  if (tool === "style_risk") {
    const mode = config.styleRiskBaseline === "project" ? "project" : config.styleRiskBaseline === "personal" ? "personal" : config.styleRiskBaseline === "character" ? "character" : "generic";
    const report = await analyzeStyleRisk({ text: chatText(snapshot), mode, scopeType: "selection", useModel: true }, { provider: config.provider, model: config.model, abortSignal: config.abortSignal, timeoutMs });
    return { kind: "style_risk_report", payload: report, warnings: [warning, "诊断结果不会修改 SillyTavern 历史聊天消息。"] };
  }
  if (tool === "character_generate") {
    if (!snapshot.character) throw new Error("当前没有可用于生成的角色卡。");
    const result = await generateCharacterCard(ProjectInputSchema.parse({
      projectName: snapshot.character.name, characterName: snapshot.character.name,
      originalIdea: chatText(snapshot), scene: snapshot.character.card.data.scenario,
      advanced: { personalityTraits: snapshot.character.card.data.personality, identityAndExperience: snapshot.character.card.data.description },
    }), { provider: config.provider, model: config.model, abortSignal: config.abortSignal, timeoutMs });
    const card = CharacterCardV2Schema.parse({ ...snapshot.character.card, data: { ...snapshot.character.card.data, ...result.data, extensions: snapshot.character.card.data.extensions, character_book: snapshot.character.card.data.character_book } });
    return { kind: "character_card", payload: card, warnings: [warning] };
  }

  const books = snapshotLorebooks(snapshot);
  if (tool === "lorebook_generate") {
    const result = await generateLorebook(LorebookGenerationInputSchema.parse({
      originalIdea: chatText(snapshot), characterData: snapshot.character?.card.data ?? null,
      supplementalSetting: books.map((book) => book.entries.map((entry) => entry.content).join("\n")).join("\n"),
      scope: "根据 SillyTavern 当前上下文完善世界书", existingEntries: books.flatMap((book) => book.entries), mode: books.length ? "update_related" : "full",
    }), { provider: config.provider, model: config.model, abortSignal: config.abortSignal, timeoutMs });
    return { kind: "lorebook", payload: result.lorebook, warnings: [warning] };
  }
  if (tool === "lorebook_analyze") {
    const book = books[0] ?? createEmptyLorebook("空世界书");
    return { kind: "quality_report", payload: runLorebookQualityChecks(book, { characterData: snapshot.character?.card.data }), warnings: [warning] };
  }
  if (!snapshot.character) throw new Error("当前没有可用于分析的角色卡。");
  const project = createEmptyAnalysisProject();
  project.title = `SillyTavern · ${snapshot.character.name}`;
  project.proposal.occurredPlot = chatText(snapshot);
  project.proposal.proposedPlot = chatText(snapshot);
  project.proposal.plotGoal = tool === "character_fit" || tool === "character_analyze" ? "检查人物契合度" : tool === "continuity_analysis" ? "检查当前聊天连续性" : "检查剧情合理性";
  const result = await generatePlotAnalysis(project, snapshot.character.card, books, { provider: config.provider, model: config.model, abortSignal: config.abortSignal, timeoutMs });
  return { kind: "analysis_report", payload: result.report, warnings: [warning] };
}
