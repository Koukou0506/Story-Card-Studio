export interface SafeArchiveEntry { path: string; data: Uint8Array; compressedSize: number; uncompressedSize: number; }
export interface SafeArchiveOptions { maxEntries?: number; maxEntryBytes?: number; maxTotalBytes?: number; maxCompressionRatio?: number; }

const u16 = (view: DataView, offset: number) => view.getUint16(offset, true);
const u32 = (view: DataView, offset: number) => view.getUint32(offset, true);

function safePath(input: string): string {
  const path = input.replace(/\\/g, "/");
  if (!path || path.startsWith("/") || /^[a-z]:/i.test(path) || path.split("/").some((part) => part === ".." || part === "" && path.startsWith("//"))) {
    throw new Error(`压缩包包含路径穿越或非法路径：${input}`);
  }
  return path.split("/").filter((part) => part && part !== ".").join("/");
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("当前环境不支持 EPUB/DOCX 的 Deflate 解压。请升级浏览器或改用工作区服务。");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readSafeZip(data: ArrayBuffer, options: SafeArchiveOptions = {}): Promise<Map<string, SafeArchiveEntry>> {
  const bytes = new Uint8Array(data);
  const view = new DataView(data);
  const maxEntries = options.maxEntries ?? 4_000;
  const maxEntryBytes = options.maxEntryBytes ?? 32 * 1024 * 1024;
  const maxTotalBytes = options.maxTotalBytes ?? 256 * 1024 * 1024;
  const maxRatio = options.maxCompressionRatio ?? 200;
  let eocd = -1;
  for (let offset = Math.max(0, bytes.length - 65_557); offset <= bytes.length - 22; offset += 1) if (u32(view, offset) === 0x06054b50) eocd = offset;
  if (eocd < 0) throw new Error("压缩容器损坏：找不到 ZIP 目录。" );
  const entryCount = u16(view, eocd + 10);
  const centralOffset = u32(view, eocd + 16);
  if (entryCount > maxEntries) throw new Error(`压缩包文件数超过 ${maxEntries} 项安全上限。`);
  let cursor = centralOffset;
  let total = 0;
  const result = new Map<string, SafeArchiveEntry>();
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length || u32(view, cursor) !== 0x02014b50) throw new Error("压缩容器目录损坏。" );
    const flags = u16(view, cursor + 8);
    const method = u16(view, cursor + 10);
    const compressedSize = u32(view, cursor + 20);
    const uncompressedSize = u32(view, cursor + 24);
    const nameLength = u16(view, cursor + 28);
    const extraLength = u16(view, cursor + 30);
    const commentLength = u16(view, cursor + 32);
    const localOffset = u32(view, cursor + 42);
    const path = safePath(new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (path.endsWith("/")) continue;
    if (flags & 1) throw new Error(`受保护的压缩条目无法解析：${path}`);
    if (![0, 8].includes(method)) throw new Error(`不支持的压缩算法 (${method})：${path}`);
    if (uncompressedSize > maxEntryBytes) throw new Error(`压缩条目超过单项安全上限：${path}`);
    if (compressedSize > 0 && uncompressedSize / compressedSize > maxRatio) throw new Error(`压缩比异常，已阻止可能的 Zip Bomb：${path}`);
    total += uncompressedSize;
    if (total > maxTotalBytes) throw new Error("压缩内容超过解压总量安全上限。" );
    if (localOffset + 30 > bytes.length || u32(view, localOffset) !== 0x04034b50) throw new Error(`压缩条目索引损坏：${path}`);
    const localNameLength = u16(view, localOffset + 26);
    const localExtraLength = u16(view, localOffset + 28);
    const bodyOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(bodyOffset, bodyOffset + compressedSize);
    const output = method === 0 ? compressed : await inflateRaw(compressed);
    if (output.byteLength !== uncompressedSize) throw new Error(`压缩条目长度校验失败：${path}`);
    result.set(path, { path, data: output, compressedSize, uncompressedSize });
  }
  return result;
}
