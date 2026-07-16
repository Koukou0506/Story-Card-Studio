import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { OcrJob } from "@/domain/work-import";
import type { OcrPageRecognition } from "./ocr";

const execFile = promisify(execFileCallback);
export interface TesseractAvailability { available: boolean; tesseract: boolean; pdfRenderer: boolean; message: string; }
export interface TesseractPdfOptions { languages: OcrJob["languages"]; signal?: AbortSignal; onPage?: (pageNumber: number, total: number, result: OcrPageRecognition) => Promise<void> | void; }

async function commandAvailable(command: string, args: string[]): Promise<boolean> { try { await execFile(command, args, { timeout: 8_000, windowsHide: true }); return true; } catch { return false; } }
export async function getTesseractCliAvailability(): Promise<TesseractAvailability> {
  const [tesseract, pdfRenderer] = await Promise.all([commandAvailable("tesseract", ["--version"]), commandAvailable("pdftoppm", ["-v"])]);
  return { available: tesseract && pdfRenderer, tesseract, pdfRenderer, message: tesseract && pdfRenderer ? "本地 OCR 可用。" : "需要安装 Tesseract OCR 与 Poppler（pdftoppm）；缺失时仍可导入文本型 PDF。" };
}
function parseTsv(tsv: string): OcrPageRecognition {
  const lines = tsv.split(/\r?\n/).slice(1); const words: string[] = []; const confidences: number[] = [];
  for (const line of lines) { const cells = line.split("\t"); const text = cells.slice(11).join("\t").trim(); const confidence = Number(cells[10]); if (text) words.push(text); if (confidence >= 0) confidences.push(confidence / 100); }
  return { text: words.join(" ").replace(/\s+([，。！？；：])/g, "$1"), confidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0 };
}
export async function recognizeScannedPdfWithTesseract(data: ArrayBuffer, options: TesseractPdfOptions): Promise<OcrPageRecognition[]> {
  const availability = await getTesseractCliAvailability(); if (!availability.available) throw new Error(availability.message);
  const directory = await mkdtemp(join(tmpdir(), "story-card-studio-ocr-"));
  try {
    const pdfPath = join(directory, "source.pdf"); const prefix = join(directory, "page"); await writeFile(pdfPath, new Uint8Array(data));
    await execFile("pdftoppm", ["-png", "-r", "220", pdfPath, prefix], { signal: options.signal, timeout: 10 * 60_000, maxBuffer: 1024 * 1024, windowsHide: true });
    const images = (await readdir(directory)).filter((name) => /^page-\d+\.png$/i.test(name)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
    if (!images.length) throw new Error("PDF 页面栅格化失败，未生成可供 OCR 的页面。" );
    const results: OcrPageRecognition[] = [];
    for (const [index, image] of images.entries()) {
      if (options.signal?.aborted) throw new DOMException("OCR 已取消", "AbortError");
      const { stdout } = await execFile("tesseract", [join(directory, image), "stdout", "-l", options.languages.join("+"), "tsv"], { signal: options.signal, timeout: 5 * 60_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
      const result = parseTsv(stdout); result.imageReference = `ocr-page:${index + 1}`; results.push(result); await options.onPage?.(index + 1, images.length, result);
    }
    return results;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
