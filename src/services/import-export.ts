import {
  CharacterCardV2,
  CharacterCardV2Schema,
  CharacterData,
  validateCharacterCardV2,
  safeParseCharacterCardV2,
} from "@/domain/character-card";

// ============================================
// Character Card V2 导入/导出服务
// ============================================

/**
 * 导出为 Character Card V2 JSON 字符串
 */
export function exportToJSON(card: CharacterCardV2): string {
  // 校验数据完整性
  const validated = validateCharacterCardV2(card);
  return JSON.stringify(validated, null, 2);
}

/**
 * 导出为可供下载的 Blob
 */
export function exportToBlob(card: CharacterCardV2): Blob {
  const json = exportToJSON(card);
  return new Blob([json], { type: "application/json" });
}

/**
 * 生成安全的文件名
 * 移除不安全字符，限制长度
 */
export function sanitizeFilename(name: string): string {
  let sanitized = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")  // 移除 Windows 不安全字符
    .replace(/\s+/g, "_")                      // 空格替换为下划线
    .replace(/\.{2,}/g, ".")                   // 移除连续的点
    .replace(/^\.+/, "")                       // 移除开头的点
    .trim();

  // 限制长度
  if (sanitized.length > 100) {
    sanitized = sanitized.slice(0, 100);
  }

  // 如果为空，使用默认名称
  if (!sanitized) {
    sanitized = "character_card";
  }

  return sanitized;
}

/**
 * 生成导出文件名
 */
export function generateExportFilename(card: CharacterCardV2): string {
  const name = card.data.name || "未命名角色";
  const safeName = sanitizeFilename(name);
  const version = card.data.character_version || "1.0";
  return `${safeName}_v${version}.json`;
}

/**
 * 触发浏览器下载
 */
export function downloadJSON(card: CharacterCardV2): void {
  const blob = exportToBlob(card);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = generateExportFilename(card);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 从文件导入 Character Card V2
 * 返回解析后的卡片或错误信息
 */
export function importFromFile(file: File): Promise<{ success: true; card: CharacterCardV2 } | { success: false; error: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== "string") {
        resolve({ success: false, error: "无法读取文件内容。" });
        return;
      }

      try {
        const parsed = JSON.parse(text);
        const result = safeParseCharacterCardV2(parsed);

        if (result.success) {
          resolve({ success: true, card: result.card });
        } else {
          resolve({ success: false, error: `角色卡数据校验失败：${result.error}` });
        }
      } catch (err) {
        resolve({
          success: false,
          error: `文件不是有效的 JSON 格式：${(err as Error).message}`,
        });
      }
    };

    reader.onerror = () => {
      resolve({ success: false, error: "文件读取失败，请重试。" });
    };

    reader.readAsText(file);
  });
}

/**
 * 合并导入的角色卡数据到现有数据。
 * 保留未知的 extensions 字段。
 */
export function mergeCharacterData(
  existing: CharacterData,
  imported: CharacterData,
): CharacterData {
  return {
    ...imported,
    // 保留现有 extensions 中的未知字段
    extensions: {
      ...existing.extensions,
      ...imported.extensions,
    },
  };
}

/**
 * 深层比较两个角色卡是否在语义上等价（忽略格式差异）。
 * 用于 round-trip 验证。
 */
export function areCardsEqual(a: CharacterCardV2, b: CharacterCardV2): boolean {
  // 比较 spec
  if (a.spec !== b.spec || a.spec_version !== b.spec_version) {
    return false;
  }

  // 比较 data（忽略 extensions 中的顺序差异）
  const aData = { ...a.data };
  const bData = { ...b.data };

  // 标准化比较
  for (const key of Object.keys(aData) as Array<keyof CharacterData>) {
    const aVal = aData[key];
    const bVal = bData[key];

    if (JSON.stringify(aVal) !== JSON.stringify(bVal)) {
      return false;
    }
  }

  return true;
}

/**
 * 安全的深拷贝
 */
export function cloneCharacterCard(card: CharacterCardV2): CharacterCardV2 {
  return JSON.parse(JSON.stringify(card));
}
