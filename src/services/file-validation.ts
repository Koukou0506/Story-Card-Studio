export const DEFAULT_IMPORT_LIMIT = 25 * 1024 * 1024;

export type FileDescriptor = Pick<File, "name" | "size" | "type">;
export type FileValidation = { ok: true } | { ok: false; error: string };

export function validateImportFile(file: FileDescriptor, maxBytes = DEFAULT_IMPORT_LIMIT): FileValidation {
  if (file.size > maxBytes) return { ok: false, error: `文件超过 25 MB 上限，请先确认来源并拆分或压缩备份。` };
  const jsonName = file.name.toLocaleLowerCase().endsWith(".json");
  const jsonType = !file.type || file.type === "application/json" || file.type === "text/json";
  if (!jsonName || !jsonType) return { ok: false, error: "只支持 JSON 文件；本阶段不解析 TXT、PDF 或小说正文文件。" };
  return { ok: true };
}

export async function readValidatedJsonFile(file: File, maxBytes = DEFAULT_IMPORT_LIMIT): Promise<string> {
  const result = validateImportFile(file, maxBytes);
  if (!result.ok) throw new Error(result.error);
  try {
    return await file.text();
  } catch {
    throw new Error("无法读取所选文件。请确认浏览器拥有文件访问权限后重试。");
  }
}
