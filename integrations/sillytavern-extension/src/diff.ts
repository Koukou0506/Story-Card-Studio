export interface DiffItem { path: string; kind: "added" | "removed" | "modified"; before: unknown; after: unknown; accepted: boolean }
export interface WorldInfoDiffItem extends DiffItem { uid: string }

export function createCharacterDiff(before: Record<string, unknown>, after: Record<string, unknown>): DiffItem[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap((path) => {
    if (JSON.stringify(before[path]) === JSON.stringify(after[path])) return [];
    const kind = !(path in before) ? "added" as const : !(path in after) ? "removed" as const : "modified" as const;
    return [{ path, kind, before: before[path], after: after[path], accepted: kind === "removed" ? false : false }];
  });
}

export function createWorldInfoDiff(before: { entries?: Record<string, unknown> }, after: { entries?: Record<string, unknown> }): WorldInfoDiffItem[] {
  const left = before.entries ?? {}; const right = after.entries ?? {};
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().flatMap((uid) => {
    if (JSON.stringify(left[uid]) === JSON.stringify(right[uid])) return [];
    const kind = !(uid in left) ? "added" as const : !(uid in right) ? "removed" as const : "modified" as const;
    return [{ uid, path: `entries.${uid}`, kind, before: left[uid], after: right[uid], accepted: false }];
  });
}

export async function resolveWriteback(input: { confirmed: boolean; originalFingerprint: string; currentFingerprint: string; capabilityAvailable: boolean }): Promise<{ action: "write" | "export" | "blocked" | "cancel"; reason: string }> {
  if (!input.confirmed) return { action: "cancel", reason: "confirmation_required" };
  if (input.originalFingerprint !== input.currentFingerprint) return { action: "blocked", reason: "source_changed" };
  if (!input.capabilityAvailable) return { action: "export", reason: "write_api_unavailable" };
  return { action: "write", reason: "confirmed" };
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename.replace(/[^\p{L}\p{N}._-]+/gu, "-"); link.click(); URL.revokeObjectURL(url);
}
