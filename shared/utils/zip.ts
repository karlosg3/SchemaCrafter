/**
 * Minimal zero-dependency ZIP archive writer (Store / method 0 with IEEE 802.3 CRC-32).
 */

export interface ZipEntryInput {
  path: string
  content: string | Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xFF]! ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function u16(view: DataView, offset: number, val: number): void {
  view.setUint16(offset, val & 0xFFFF, true)
}

function u32(view: DataView, offset: number, val: number): void {
  view.setUint32(offset, val >>> 0, true)
}

export function createZipBytes(entries: readonly ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const cleanName = entry.path.replace(/^\/+/, '')
    const nameBytes = encoder.encode(cleanName)
    const dataBytes = typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content
    const crc = crc32(dataBytes)

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(localHeader.buffer)
    u32(lv, 0, 0x04034B50)
    u16(lv, 4, 20) // version needed
    u16(lv, 6, 0x0800) // UTF-8 filename flag
    u16(lv, 8, 0) // method 0 (store)
    u16(lv, 10, 0) // mod time
    u16(lv, 12, 0x5421) // mod date
    u32(lv, 14, crc)
    u32(lv, 18, dataBytes.length)
    u32(lv, 22, dataBytes.length)
    u16(lv, 26, nameBytes.length)
    u16(lv, 28, 0)
    localHeader.set(nameBytes, 30)

    localParts.push(localHeader, dataBytes)

    // Central directory header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(centralHeader.buffer)
    u32(cv, 0, 0x02014B50)
    u16(cv, 4, 20) // version made by
    u16(cv, 6, 20) // version needed
    u16(cv, 8, 0x0800)
    u16(cv, 10, 0) // store
    u16(cv, 12, 0)
    u16(cv, 14, 0x5421)
    u32(cv, 16, crc)
    u32(cv, 20, dataBytes.length)
    u32(cv, 24, dataBytes.length)
    u16(cv, 28, nameBytes.length)
    u16(cv, 30, 0)
    u16(cv, 32, 0)
    u16(cv, 34, 0)
    u16(cv, 36, 0)
    u32(cv, 38, 0)
    u32(cv, 42, offset)
    centralHeader.set(nameBytes, 46)

    centralParts.push(centralHeader)
    offset += localHeader.length + dataBytes.length
  }

  const centralSize = centralParts.reduce((acc, part) => acc + part.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  u32(ev, 0, 0x06054B50)
  u16(ev, 4, 0)
  u16(ev, 6, 0)
  u16(ev, 8, entries.length)
  u16(ev, 10, entries.length)
  u32(ev, 12, centralSize)
  u32(ev, 16, offset)
  u16(ev, 20, 0)

  const totalSize = offset + centralSize + eocd.length
  const out = new Uint8Array(totalSize)
  let pos = 0
  for (const part of localParts) {
    out.set(part, pos)
    pos += part.length
  }
  for (const part of centralParts) {
    out.set(part, pos)
    pos += part.length
  }
  out.set(eocd, pos)
  return out
}
