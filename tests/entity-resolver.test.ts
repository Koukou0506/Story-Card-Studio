import { describe, expect, it } from "vitest";
import { resolveEntityPair } from "@/services/document-ingestion/entity-resolver";

describe("EntityResolver", () => {
  it("treats aliases with strong shared context as probably same but not user-confirmed", () => {
    const result = resolveEntityPair(
      { id: "a", type: "character", name: "柳如烟", aliases: ["柳姑娘"], identity: ["柳家长女"], locations: ["临水镇"], cooccurringEntityIds: ["traveler"] },
      { id: "b", type: "character", name: "柳姑娘", aliases: [], identity: ["柳家长女"], locations: ["临水镇"], cooccurringEntityIds: ["traveler"] },
    );
    expect(result.result).toBe("probably_same");
    expect(result.userConfirmed).toBe(false);
  });

  it("does not auto-merge same-name characters with conflicting identities", () => {
    const result = resolveEntityPair(
      { id: "a", type: "character", name: "林青", aliases: [], identity: ["北境将军"], locations: ["北境"], identityKey: "general" },
      { id: "b", type: "character", name: "林青", aliases: [], identity: ["江南医师"], locations: ["江南"], identityKey: "doctor" },
    );
    expect(["different_entity", "conflict"]).toContain(result.result);
    expect(result.userConfirmed).toBe(false);
  });

  it("only returns same_entity for an explicit shared stable entity", () => {
    const result = resolveEntityPair(
      { id: "a", type: "character", name: "阿烟", aliases: [], identity: [], locations: [], existingEntityId: "character-1" },
      { id: "b", type: "character", name: "柳如烟", aliases: ["阿烟"], identity: [], locations: [], existingEntityId: "character-1" },
    );
    expect(result.result).toBe("same_entity");
  });
});
