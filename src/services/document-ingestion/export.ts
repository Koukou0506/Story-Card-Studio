import {
  DocumentIngestionProjectSchema,
  type DocumentIngestionProject,
} from "@/domain/document-ingestion";

const SENSITIVE_KEYS = new Set([
  "authorization",
  "bearertoken",
  "cookie",
  "cookies",
  "credential",
  "credentials",
  "debuglog",
  "debuglogs",
  "extractionlog",
  "extractionlogs",
  "log",
  "logs",
  "promptlog",
  "promptlogs",
  "providerlog",
  "providerlogs",
  "requestlog",
  "requestlogs",
  "responselog",
  "responselogs",
  "accesstoken",
  "refreshtoken",
]);

const DETACHED_ASSET_KEYS = new Set([
  "assetdata",
  "cleanedtext",
  "extractedtext",
  "filebytes",
  "filedata",
  "normalizedtext",
  "originalbytes",
  "originalfile",
  "originalfiledata",
  "rawtext",
]);

function normalizedKey(key: string): string {
  return key.normalize("NFKC").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return normalized.includes("password")
    || /(?:api|openai|anthropic|provider|model|secret|encryption|access)key(?:id)?$/.test(normalized)
    || normalized.endsWith("log")
    || normalized.endsWith("logs")
    || SENSITIVE_KEYS.has(normalized)
    || DETACHED_ASSET_KEYS.has(normalized);
}

function sanitizeJsonValue(value: unknown, ancestors = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error("数据包含循环引用。");
    ancestors.add(value);
    const result = value.map((item) => sanitizeJsonValue(item, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (!value || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new Error("数据包含循环引用。");
  ancestors.add(value);
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!isSensitiveKey(key)) result[key] = sanitizeJsonValue(child, ancestors);
  }
  ancestors.delete(value);
  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

export function exportDocumentIngestionJSON(project: DocumentIngestionProject): string {
  try {
    const safeProject = DocumentIngestionProjectSchema.parse(sanitizeJsonValue(project));
    return JSON.stringify(safeProject, null, 2);
  } catch (error) {
    throw new Error(`C2.2 JSON 导出失败：${errorMessage(error)}`);
  }
}

export function importDocumentIngestionJSON(text: string): DocumentIngestionProject {
  try {
    const input = JSON.parse(text) as unknown;
    return DocumentIngestionProjectSchema.parse(sanitizeJsonValue(input));
  } catch (error) {
    throw new Error(`C2.2 JSON 导入失败：${errorMessage(error)}`);
  }
}

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function safeDocumentIngestionFilename(name: string): string {
  let safe = name
    .normalize("NFKC")
    .replace(/\.{2,}/g, "-")
    .replace(/[<>:"/\\|?*\x00-\x1F\x7F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+|[. ]+$/g, "")
    .replace(/-{2,}/g, "-");
  if (!safe || !/[^. -]/u.test(safe)) safe = "document-ingestion";
  if (WINDOWS_RESERVED_NAME.test(safe)) safe = `_${safe}`;
  return safe.slice(0, 100).replace(/[. ]+$/g, "") || "document-ingestion";
}
