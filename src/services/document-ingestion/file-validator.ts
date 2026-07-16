export const DEFAULT_DOCUMENT_FILE_LIMIT = 50 * 1024 * 1024;

export type DocumentFormat = "txt" | "pdf" | "epub" | "docx" | "markdown";
export type DocumentFileDescriptor = Pick<File, "name" | "size" | "type">;
export type DocumentFileValidation =
  | { ok: true; format: DocumentFormat }
  | { ok: false; error: string };

export interface DocumentFileValidationOptions {
  maxBytes?: number;
  knownHashes?: string[];
}

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];
const EXECUTABLE_SIGNATURES = [
  [0x4d, 0x5a],
  [0x7f, 0x45, 0x4c, 0x46],
];
const ZIP_SIGNATURES = [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08]];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${Math.ceil(bytes / (1024 * 1024))} MiB`;
}

export function sanitizeDocumentFilename(name: string): string {
  const basename = name.split(/[\\/]/).pop() || "document.txt";
  const match = basename.toLocaleLowerCase().match(/\.(txt|pdf|epub|docx|md|markdown)$/);
  const extension = match ? `.${match[1]}` : ".txt";
  const stem = basename.slice(0, -extension.length)
    .normalize("NFKC")
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_")
    .replace(/^\.+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "document";
  return `${stem}${extension}`;
}

export function validateDocumentFile(
  file: DocumentFileDescriptor,
  headerBytes: Uint8Array,
  options: DocumentFileValidationOptions = {},
): DocumentFileValidation {
  const maxBytes = options.maxBytes ?? DEFAULT_DOCUMENT_FILE_LIMIT;
  if (file.size === 0) return { ok: false, error: "文件为空，无法解析。" };
  if (file.size > maxBytes) return { ok: false, error: `文件超过 ${formatBytes(maxBytes)} 上限，请拆分文件或调整管理员配置。` };

  const lowerName = file.name.toLocaleLowerCase();
  const isPdfName = lowerName.endsWith(".pdf");
  const isTxtName = lowerName.endsWith(".txt");
  const isEpubName = lowerName.endsWith(".epub");
  const isDocxName = lowerName.endsWith(".docx");
  const isMarkdownName = lowerName.endsWith(".md") || lowerName.endsWith(".markdown");
  if (!isPdfName && !isTxtName && !isEpubName && !isDocxName && !isMarkdownName) return { ok: false, error: "支持 TXT、PDF、EPUB、DOCX 和 Markdown 作品文件。" };

  if (EXECUTABLE_SIGNATURES.some((signature) => startsWith(headerBytes, signature))) {
    return { ok: false, error: "文件签名与小说文档不符，已拒绝处理。" };
  }

  if (isEpubName || isDocxName) {
    const expectedMime = isEpubName ? ["application/epub+zip", "application/zip", "application/octet-stream", ""] : ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "application/octet-stream", ""];
    if (!expectedMime.includes(file.type) || !ZIP_SIGNATURES.some((signature) => startsWith(headerBytes, signature))) return { ok: false, error: `${isEpubName ? "EPUB" : "DOCX"} 扩展名、MIME 或 ZIP 文件签名不一致。` };
    return { ok: true, format: isEpubName ? "epub" : "docx" };
  }
  if (ZIP_SIGNATURES.some((signature) => startsWith(headerBytes, signature))) return { ok: false, error: "文本文件的扩展名与 ZIP 文件签名不一致。" };

  if (isPdfName) {
    const mimeOk = !file.type || file.type === "application/pdf" || file.type === "application/octet-stream";
    if (!mimeOk || !startsWith(headerBytes, PDF_SIGNATURE)) return { ok: false, error: "PDF 扩展名、MIME 或文件签名不一致。" };
    return { ok: true, format: "pdf" };
  }

  const mimeOk = !file.type || file.type === "text/plain" || file.type === "text/markdown" || file.type === "application/octet-stream";
  if (!mimeOk || startsWith(headerBytes, PDF_SIGNATURE)) return { ok: false, error: "TXT 扩展名、MIME 或文件签名不一致。" };
  return { ok: true, format: isMarkdownName ? "markdown" : "txt" };
}

export async function calculateContentHash(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return `sha256:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export async function inspectDocumentFile(
  file: File,
  options: DocumentFileValidationOptions = {},
): Promise<(DocumentFileValidation & { contentHash?: string; safeFilename?: string })> {
  const data = await file.arrayBuffer();
  const validation = validateDocumentFile(file, new Uint8Array(data, 0, Math.min(data.byteLength, 16)), options);
  if (!validation.ok) return validation;
  const contentHash = await calculateContentHash(data);
  if (options.knownHashes?.includes(contentHash)) return { ok: false, error: "相同内容的文件已导入；如需重新分析，请在已有文档中创建新任务。" };
  return { ...validation, contentHash, safeFilename: sanitizeDocumentFilename(file.name) };
}
