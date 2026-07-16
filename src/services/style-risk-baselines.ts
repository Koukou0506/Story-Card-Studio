import { PersonalStyleBaselineSchema, type PersonalStyleBaseline } from "@/domain/style-risk";
import { analyzeStyleRiskDeterministically } from "@/services/style-risk-analysis";

export function createPersonalStyleBaseline(input: { name: string; text: string; genre?: string; pointOfView?: string; sampleScope?: string; documentId?: string | null; chapterIds?: string[]; characterIds?: string[] }): PersonalStyleBaseline {
  const report = analyzeStyleRiskDeterministically({ text: input.text, mode: "generic", scopeType: "document" });
  return PersonalStyleBaselineSchema.parse({
    name: input.name, baselineType: "personal_sample", language: "zh-CN", genre: input.genre ?? "自定义", pointOfView: input.pointOfView ?? "mixed",
    sampleScope: input.sampleScope ?? "用户选择样本", sampleSize: report.features.characterCount,
    featureStatistics: {
      averageSentenceLength: report.features.averageSentenceLength, sentenceLengthVariance: report.features.sentenceLengthVariance,
      paragraphLengthAverage: report.features.paragraphLengths.length ? report.features.paragraphLengths.reduce((a, b) => a + b, 0) / report.features.paragraphLengths.length : 0,
      dialogueRatio: report.features.dialogueRatio, punctuation: report.features.punctuation,
      frequentConnectors: report.features.frequentConnectors, repeatedSentenceOpenings: report.features.repeatedSentenceOpenings,
      abstractEmotionDensity: report.features.abstractEmotionDensity, concreteActionSensoryDensity: report.features.concreteActionSensoryDensity,
    },
    confidence: report.sampleSufficient ? "medium" : "low", isUserConfirmed: false, sourceTextStored: false,
    documentId: input.documentId ?? null, chapterIds: input.chapterIds ?? [], characterIds: input.characterIds ?? [], samplePointOfView: input.pointOfView ?? "",
  });
}

export class PersonalStyleBaselineStore {
  private readonly values = new Map<string, PersonalStyleBaseline>();
  list(): PersonalStyleBaseline[] { return [...this.values.values()].map((item) => structuredClone(item)); }
  save(value: PersonalStyleBaseline): PersonalStyleBaseline { const parsed = PersonalStyleBaselineSchema.parse(value); this.values.set(parsed.id, structuredClone(parsed)); return structuredClone(parsed); }
  delete(id: string): boolean { return this.values.delete(id); }
}

export const personalStyleBaselineStore = new PersonalStyleBaselineStore();
