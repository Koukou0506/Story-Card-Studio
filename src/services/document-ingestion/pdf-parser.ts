export interface PdfPageText {
  pageNumber: number;
  text: string;
  startOffset: number;
  endOffset: number;
  itemCount: number;
  empty: boolean;
}

export interface PdfParseResult {
  status: "ready" | "needs_password" | "needs_ocr" | "failed";
  rawText: string;
  pageCount: number;
  pages: PdfPageText[];
  warnings: string[];
  errors: string[];
  extractionQuality: "high" | "medium" | "low";
}

export interface OcrAdapter {
  readonly id: string;
  recognize(data: ArrayBuffer, signal?: AbortSignal): Promise<{ text: string; confidence: number; pages: PdfPageText[] }>;
}

function containsAscii(bytes: Uint8Array, value: string): boolean {
  const target = new TextEncoder().encode(value);
  outer: for (let start = 0; start <= bytes.length - target.length; start += 1) {
    for (let index = 0; index < target.length; index += 1) if (bytes[start + index] !== target[index]) continue outer;
    return true;
  }
  return false;
}

function passwordResult(): PdfParseResult {
  return {
    status: "needs_password", rawText: "", pageCount: 0, pages: [],
    warnings: ["PDF 已加密或需要密码。密码仅用于本次解析，不会写入日志或长期保存。"],
    errors: [], extractionQuality: "low",
  };
}

export async function parsePdfDocument(data: ArrayBuffer, options: { password?: string; signal?: AbortSignal } = {}): Promise<PdfParseResult> {
  const bytes = new Uint8Array(data);
  if (!options.password && containsAscii(bytes, "/Encrypt")) return passwordResult();
  if (options.signal?.aborted) throw new DOMException("PDF 解析已取消", "AbortError");

  let loadingTask: { destroy(): Promise<void> } | null = null;
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({
      data: bytes,
      password: options.password,
      useWorkerFetch: false,
    });
    loadingTask = task;
    const document = await task.promise;
    const pages: PdfPageText[] = [];
    const warnings: string[] = [];
    let rawText = "";
    let suspiciousOrder = false;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      if (options.signal?.aborted) {
        await task.destroy();
        throw new DOMException("PDF 解析已取消", "AbortError");
      }
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({ includeMarkedContent: false });
      const parts: string[] = [];
      let previousX = -Infinity;
      for (const item of content.items) {
        if (!("str" in item) || !item.str) continue;
        const x = Array.isArray(item.transform) ? Number(item.transform[4] ?? 0) : 0;
        if (x + 100 < previousX) suspiciousOrder = true;
        previousX = x;
        parts.push(item.str);
        if (item.hasEOL) parts.push("\n");
        else parts.push(" ");
      }
      const text = parts.join("").replace(/[ \t]+\n/g, "\n").trim();
      if (rawText && text) rawText += "\n\n";
      const startOffset = rawText.length;
      rawText += text;
      pages.push({ pageNumber, text, startOffset, endOffset: rawText.length, itemCount: content.items.length, empty: !text });
      page.cleanup();
    }
    if (!rawText.trim()) {
      return {
        status: "needs_ocr", rawText: "", pageCount: pages.length, pages,
        warnings: ["PDF 没有可用文本层，需要 OCR。当前阶段不会伪造解析结果。"],
        errors: [], extractionQuality: "low",
      };
    }
    const emptyPages = pages.filter((page) => page.empty).length;
    if (emptyPages) warnings.push(`${emptyPages} 页没有提取到有效文本。`);
    if (suspiciousOrder) warnings.push("检测到可能的多栏排版或文本阅读顺序异常，请核对预览。");
    const replacementCount = [...rawText].filter((character) => character === "\ufffd").length;
    if (replacementCount / rawText.length > 0.01) warnings.push("检测到字符映射异常，部分文字可能无法正确还原。");
    return {
      status: "ready", rawText, pageCount: pages.length, pages, warnings, errors: [],
      extractionQuality: warnings.length ? "medium" : "high",
    };
  } catch (error) {
    const value = error as Error & { code?: number };
    if (value.name === "PasswordException" || /password/i.test(value.message)) return passwordResult();
    if (value.name === "AbortError") throw value;
    return {
      status: "failed", rawText: "", pageCount: 0, pages: [], warnings: [],
      errors: [`PDF 文本提取失败：${value.message || "未知错误"}`], extractionQuality: "low",
    };
  } finally {
    if (loadingTask) {
      try { await loadingTask.destroy(); } catch { /* already destroyed */ }
    }
  }
}
