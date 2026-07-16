function u16(value: number): number[] { return [value & 0xff, (value >>> 8) & 0xff]; }
function u32(value: number): number[] { return [...u16(value & 0xffff), ...u16((value >>> 16) & 0xffff)]; }

export function createStoredZip(entries: Record<string, string>): ArrayBuffer {
  const encoder = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name);
    const body = encoder.encode(value);
    local.push(...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(body.length), ...u32(body.length), ...u16(nameBytes.length), ...u16(0), ...nameBytes, ...body);
    central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(body.length), ...u32(body.length), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes);
    offset = local.length;
  }
  const result = new Uint8Array([
    ...local,
    ...central,
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(Object.keys(entries).length), ...u16(Object.keys(entries).length),
    ...u32(central.length), ...u32(local.length), ...u16(0),
  ]);
  return result.buffer;
}
