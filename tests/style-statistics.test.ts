import { describe, expect, it } from "vitest";
import { calculateStyleStatistics } from "@/services/document-ingestion/style-statistics";

describe("deterministic style statistics", () => {
  it("computes paragraph/sentence/dialogue/punctuation and POV features without a model", () => {
    const text = "我推开门。\n\n“你来了？”我问。\n\n她点头，却没有回答。……雨还在下。";
    const stats = calculateStyleStatistics(text, [12, 18]);
    expect(stats.characterCount).toBe(text.replace(/\s/g, "").length);
    expect(stats.paragraphLengths).toHaveLength(3);
    expect(stats.sentenceLengths.length).toBeGreaterThanOrEqual(4);
    expect(stats.dialogueRatio).toBeGreaterThan(0);
    expect(stats.punctuation["。 ".trim()]).toBeGreaterThan(0);
    expect(stats.punctuation["？"]).toBe(1);
    expect(stats.pronounPreference).toBe("first_person");
  });

  it("detects repeated phrases and frequent connectors", () => {
    const text = "然而他没有回答。然而她也没有回答。然而风停了。";
    const stats = calculateStyleStatistics(text);
    expect(stats.frequentConnectors.some((item) => item.value === "然而")).toBe(true);
    expect(stats.repeatedPhrases.length).toBeGreaterThan(0);
  });
});
