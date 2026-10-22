// Generates the app icon (build/icon.png) and its base64 data-URL module
// (src/main/icon-data.ts, used for the tray/window icon at runtime).
//
// The icon is a dark rounded square with three ascending gold bars — a
// leaderboard motif. It is generated rather than committed so the repo
// stays free of binary assets; npm hooks (predev/prebuild/predist) run
// this script automatically.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const S = 512
const R = 96
const BASE = 392
const BARS = [
  [108, 190, 268],
  [216, 298, 188],
  [324, 406, 104]
]
const BG = [16, 19, 26]
const GOLD_TOP = [255, 205, 92]
const GOLD_BOT = [232, 158, 42]

function insideRounded(x, y) {
  const cx = Math.min(Math.max(x, R), S - 1 - R)
  const cy = Math.min(Math.max(y, R), S - 1 - R)
  return (x - cx) ** 2 + (y - cy) ** 2 <= R * R
}

const rows = []
for (let y = 0; y < S; y++) {
  const row = Buffer.alloc(1 + S * 4)
  row[0] = 0
  for (let x = 0; x < S; x++) {
    const o = 1 + x * 4
    if (!insideRounded(x, y)) continue // transparent
    let [r, g, b] = BG
    let a = 255
    for (const [x0, x1, top] of BARS) {
      if (x >= x0 && x < x1 && y >= top && y < BASE) {
        const t = (y - top) / Math.max(1, BASE - top)
        r = Math.round(GOLD_TOP[0] + (GOLD_BOT[0] - GOLD_TOP[0]) * t)
        g = Math.round(GOLD_TOP[1] + (GOLD_BOT[1] - GOLD_TOP[1]) * t)
        b = Math.round(GOLD_TOP[2] + (GOLD_BOT[2] - GOLD_TOP[2]) * t)
      }
    }
    if (y >= 392 && y < 404 && x >= 84 && x < 428) {
      r = 236
      g = 238
      b = 242
    }
    row[o] = r
    row[o + 1] = g
    row[o + 2] = b
    row[o + 3] = a
  }
  rows.push(row)
}
const raw = Buffer.concat(rows)

// CRC32 (PNG chunks)
const crcTable = []
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c >>> 0
}
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

mkdirSync(join(root, 'build'), { recursive: true })
writeFileSync(join(root, 'build', 'icon.png'), png)
const ts = `export const ICON_DATA_URL =\n  'data:image/png;base64,${png.toString('base64')}'\n`
writeFileSync(join(root, 'src', 'main', 'icon-data.ts'), ts)
console.log(`icon generated: build/icon.png (${png.length} bytes), src/main/icon-data.ts`)
