import type { Lorebook, LorebookSourceFormat } from "@/domain/lorebook";

export interface CompatibilityWarning {
  code: string;
  message: string;
  entryId?: string;
  lossy: boolean;
}

export interface AdapterImportResult {
  lorebook: Lorebook;
  warnings: CompatibilityWarning[];
}

export interface AdapterExportResult<T = unknown> {
  data: T;
  warnings: CompatibilityWarning[];
}

export interface LorebookAdapter<T = unknown> {
  readonly format: LorebookSourceFormat;
  detect(data: unknown): boolean;
  validate(data: unknown): { success: true; data: T } | { success: false; error: string };
  import(data: unknown, options?: { name?: string }): AdapterImportResult;
  export(book: Lorebook): AdapterExportResult<T>;
}

export function unknownFields(
  value: Record<string, unknown>,
  known: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !known.includes(key)));
}

