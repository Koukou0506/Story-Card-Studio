import { describe, expect, it } from "vitest";
import { createEmptyLanguageConstraint, createEmptyStyleProfile } from "@/domain/prose";
import { StyleRiskAnalysisReportSchema } from "@/domain/style-risk";
import { analyzeStyleRiskDeterministically, mapExcerptToRange } from "@/services/style-risk-analysis";

describe("C2.4 deterministic Chinese style-risk metrics", () => {
  const text = "然而，他感到非常悲伤。他缓缓低下头，因此，他感到非常悲伤……\n\n“我明白你的感受。”柳青说道。\n\n“我也完全明白。”林雨说道。";

  it("segments Chinese sentences without splitting ellipses or quoted dialogue", () => {
    const report = analyzeStyleRiskDeterministically({ text, mode: "generic", scopeType: "document" });
    expect(report.features.sentenceCount).toBe(4);
    expect(report.features.ellipsisFrequency).toBeGreaterThan(0);
  });

  it("recognizes dialogue and calculates dialogue/narration ratios", () => {
    const report = analyzeStyleRiskDeterministically({ text, mode: "generic", scopeType: "document" });
    expect(report.features.dialogueRatio).toBeGreaterThan(0);
    expect(report.features.dialogueRatio + report.features.narrationRatio).toBeCloseTo(1, 4);
  });

  it("calculates sentence and paragraph distributions", () => {
    const report = analyzeStyleRiskDeterministically({ text, mode: "generic", scopeType: "document" });
    expect(report.features.sentenceLengths).toHaveLength(4);
    expect(report.features.paragraphLengths).toHaveLength(3);
    expect(report.features.sentenceLengthVariance).toBeGreaterThanOrEqual(0);
  });

  it("finds repeated n-grams, openings, endings and frequent connectors", () => {
    const repeated = "然而他停下脚步，望向门外。\n\n然而他停下脚步，望向窗外。\n\n然而他停下脚步，望向门外。";
    const report = analyzeStyleRiskDeterministically({ text: repeated, mode: "generic", scopeType: "document" });
    expect(report.features.repeatedNgrams.length).toBeGreaterThan(0);
    expect(report.features.repeatedSentenceOpenings[0]?.count).toBeGreaterThanOrEqual(2);
    expect(report.features.frequentConnectors.some((item) => item.value === "然而")).toBe(true);
  });

  it("measures abstract emotion against concrete action and sensory language", () => {
    const report = analyzeStyleRiskDeterministically({ text: "他悲伤、痛苦、绝望，却只是难过。风擦过手背，他握紧杯子。", mode: "generic", scopeType: "document" });
    expect(report.features.abstractEmotionDensity).toBeGreaterThan(0);
    expect(report.features.concreteActionSensoryDensity).toBeGreaterThan(0);
  });

  it("reports Language Constraint violations and makes locked hard violations critical", () => {
    const rule = createEmptyLanguageConstraint(); rule.content = "禁止使用不由得"; rule.negativeExamples = ["不由得"]; rule.strictness = "hard"; rule.locked = true;
    const report = analyzeStyleRiskDeterministically({ text: "她不由得叹气。她又不由得回头。", mode: "project", scopeType: "scene", constraints: [rule] });
    expect(report.features.languageConstraintViolations).toHaveLength(1);
    expect(report.issues.find((item) => item.category === "language_constraint")?.severity).toBe("critical");
  });

  it("compares with the selected project Style Profile baseline", () => {
    const profile = createEmptyStyleProfile(); profile.sentenceLength = 1; profile.dialogueRatio = 80;
    const report = analyzeStyleRiskDeterministically({ text: "这是一段很长很长的叙述文字，用来明显偏离短句和高对话比例的项目风格基准，而且没有任何人物对话。", mode: "project", scopeType: "scene", styleProfile: profile });
    expect(report.baselines[0]?.baselineType).toBe("project_style");
    expect(report.dimensionRisks.projectStyleDeviation).toBeGreaterThan(0);
  });

  it("degrades texts shorter than 300 Chinese characters without a stable total score", () => {
    const report = analyzeStyleRiskDeterministically({ text: "短文本只给局部提示。", mode: "generic", scopeType: "selection" });
    expect(report.overallScore).toBeNull();
    expect(report.sampleSufficient).toBe(false);
    expect(report.summary).toContain("样本过短");
  });

  it("maps unique excerpts and marks ambiguous or absent excerpts uncertain", () => {
    expect(mapExcerptToRange("甲乙丙丁", "乙丙")).toMatchObject({ start: 1, end: 3, mappingStatus: "exact" });
    expect(mapExcerptToRange("重复。重复。", "重复").mappingStatus).toBe("uncertain");
    expect(mapExcerptToRange("正文", "不存在").mappingStatus).toBe("unmapped");
  });

  it("produces a runtime-valid report with the required authorship disclaimer", () => {
    const report = analyzeStyleRiskDeterministically({ text, mode: "generic", scopeType: "document" });
    expect(StyleRiskAnalysisReportSchema.parse(report).disclaimer).toContain("不能可靠证明文本由 AI 或人类创作");
  });
});
