import { StyleStatisticsSchema, type StyleStatistics } from "@/domain/document-ingestion";

const CONNECTORS = ["然而", "但是", "因此", "于是", "随后", "同时", "不过", "其实", "仍然", "终于"];

function frequencies(values: string[], minimum = 2): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts].filter(([, count]) => count >= minimum)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 30).map(([value, count]) => ({ value, count }));
}

function countOccurrences(text: string, value: string): number {
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(value, index)) >= 0) {
    count += 1;
    index += value.length;
  }
  return count;
}

export function calculateStyleStatistics(text: string, chapterLengths: number[] = []): StyleStatistics {
  const compact = text.replace(/\s/g, "");
  const paragraphs = text.split(/\n\s*\n|\n/).map((value) => value.trim()).filter(Boolean);
  const sentences = [...text.matchAll(/[^。！？.!?]+[。！？.!?]+|[^。！？.!?]+$/gu)]
    .map((match) => match[0].replace(/\s/g, "")).filter(Boolean);
  const dialogues = [...text.matchAll(/[“「『"]([^”」』"\n]+)[”」』"]/gu)].map((match) => match[1]);
  const dialogueCharacters = dialogues.join("").replace(/\s/g, "").length;
  const punctuation: Record<string, number> = {};
  for (const character of text.match(/[，。！？；：、,.!?;:…—]/gu) ?? []) punctuation[character] = (punctuation[character] ?? 0) + 1;

  const firstPerson = countOccurrences(text, "我") + countOccurrences(text, "我们") * 2;
  const thirdPerson = ["他", "她", "它", "他们", "她们", "它们"].reduce((total, value) => total + countOccurrences(text, value), 0);
  const pronounPreference = firstPerson === 0 && thirdPerson === 0
    ? "unknown"
    : firstPerson > thirdPerson * 1.2 ? "first_person" : thirdPerson > firstPerson * 1.2 ? "third_person" : "mixed";

  const frequentConnectors = CONNECTORS.map((value) => ({ value, count: countOccurrences(text, value) })).filter((item) => item.count >= 2);
  const phraseSource = compact.replace(/[，。！？；：、,.!?;:…—“”「」『』]/gu, "");
  const phrases: string[] = [];
  for (let index = 0; index <= phraseSource.length - 4; index += 1) phrases.push(phraseSource.slice(index, index + 4));
  const cjkBigrams = [...compact.matchAll(/[\u3400-\u9fff]{2}/gu)].map((match) => match[0]);
  const addresses = [...text.matchAll(/[\u3400-\u9fff]{1,4}(?:先生|小姐|姑娘|大人|师父|老师|殿下|陛下)/gu)].map((match) => match[0]);

  return StyleStatisticsSchema.parse({
    characterCount: compact.length,
    chapterLengths,
    paragraphLengths: paragraphs.map((value) => value.replace(/\s/g, "").length),
    sentenceLengths: sentences.map((value) => value.length),
    dialogueRatio: compact.length ? dialogueCharacters / compact.length : 0,
    narrationRatio: compact.length ? 1 - dialogueCharacters / compact.length : 1,
    punctuation,
    pronounPreference,
    frequentWords: frequencies(cjkBigrams),
    frequentAddresses: frequencies(addresses),
    frequentConnectors,
    repeatedPhrases: frequencies(phrases),
    paragraphOpeningPatterns: paragraphs.map((value) => value.slice(0, 6)).filter(Boolean).slice(0, 20),
    paragraphEndingPatterns: paragraphs.map((value) => value.slice(-6)).filter(Boolean).slice(0, 20),
  });
}
