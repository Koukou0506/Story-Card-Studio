import { describe, expect, it } from "vitest";
import { MockProvider } from "@/providers/mock";
import { buildContextSnapshot } from "../integrations/sillytavern-extension/src/context-adapter";
import { executeSillyTavernTool } from "@/services/sillytavern-integration-tasks";
import { ExtensionToolSchema } from "@/integrations/sillytavern/contracts";

describe("C2.4 SillyTavern selected-message diagnosis", () => {
  it("exposes a style-risk tool without chat writeback", async () => {
    expect(ExtensionToolSchema.parse("style_risk")).toBe("style_risk");
    const snapshot = await buildContextSnapshot({ characterId: null, groupId: null, chatId: "chat", characters: [], groups: [], chat: [{ mes: "然而，他感到非常悲伤。因此，他感到非常悲伤。", is_user: false, name: "角色" }], chatMetadata: {} }, { chatRange: { kind: "last", roles: ["assistant"] } });
    const result = await executeSillyTavernTool(snapshot, "style_risk", { provider: new MockProvider(), model: "mock-model" });
    expect(result.kind).toBe("style_risk_report");
    expect((result.payload as { disclaimer: string }).disclaimer).toContain("不能可靠证明");
    expect(result.warnings.join(" ")).toContain("不会修改 SillyTavern 历史聊天");
  });
});
