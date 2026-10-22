// Generates the app icon (build/icon.png), a macOS menu-bar template icon,
// and their base64 data-URL module (src/main/icon-data.ts, used for the
// window/tray icons at runtime).
//
// The app icon is a dark rounded square with three ascending gold bars — a
// leaderboard motif. The tray icon is a transparent, solid-black template so
// macOS can tint it for light/dark menu bars. Icons are generated rather than
// committed so the repo stays free of binary assets; npm hooks
// (predev/prebuild/predist) run this script automatically.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/* ---------- PNG encoder ---------- */

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
function encodePng(width, height, raw) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------- app icon ---------- */

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
    const a = 255
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
const appPng = encodePng(S, S, Buffer.concat(rows))

/* ---------- macOS tray template ---------- */

// 36×36 so the menu bar gets a crisp 2× image at 18 pt. Solid black with
// alpha only: macOS recolours template images to match the menu bar.
const T = 36
const TRAY_BARS = [
  [4, 11, 20],
  [15, 22, 14],
  [26, 33, 8]
]
const trayRows = []
for (let y = 0; y < T; y++) {
  const row = Buffer.alloc(1 + T * 4)
  row[0] = 0
  for (let x = 0; x < T; x++) {
    let on = false
    for (const [x0, x1, top] of TRAY_BARS) {
      if (x >= x0 && x < x1 && y >= top && y < 30) on = true
    }
    if (y >= 30 && y < 32 && x >= 3 && x < 34) on = true
    if (!on) continue
    const o = 1 + x * 4
    row[o] = 0
    row[o + 1] = 0
    row[o + 2] = 0
    row[o + 3] = 255
  }
  trayRows.push(row)
}
const trayPng = encodePng(T, T, Buffer.concat(trayRows))

/* ---------- write outputs ---------- */

mkdirSync(join(root, 'build'), { recursive: true })
writeFileSync(join(root, 'build', 'icon.png'), appPng)
const ts = `export const ICON_DATA_URL =\n  'data:image/png;base64,${appPng.toString('base64')}'\n\nexport const TRAY_ICON_DATA_URL =\n  'data:image/png;base64,${trayPng.toString('base64')}'\n`
writeFileSync(join(root, 'src', 'main', 'icon-data.ts'), ts)
console.log(
  `icon generated: build/icon.png (${appPng.length} bytes), src/main/icon-data.ts (tray ${trayPng.length} bytes)`
)
