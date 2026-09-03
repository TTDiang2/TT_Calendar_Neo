// 生成桌面端应用图标（512x512 PNG，2x 超采样抗锯齿）
// 纯 Node 实现，不依赖任何图形库。配色沿用项目既有色板：
//   主蓝 #3D6BFB（工作图层）、强调红 #EF5350（重要日期图层）
// 用法： node scripts/make-icon.cjs [输出路径]
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const OUT = process.argv[2] || 'apps/desktop/icon-source.png'
const W = 512
const SS = 2 // 超采样倍数
const S = W * SS

const buf = new Uint8Array(S * S * 4)

const BLUE = [61, 107, 251, 255]
const RED = [239, 83, 80, 255]
const WHITE = [255, 255, 255, 255]
const DOT = [165, 180, 252, 255] // indigo-300

function px(x, y, c) {
  if (x < 0 || y < 0 || x >= S || y >= S) return
  const i = (y * S + x) * 4
  buf[i] = c[0]
  buf[i + 1] = c[1]
  buf[i + 2] = c[2]
  buf[i + 3] = c[3]
}

function roundRect(x0, y0, x1, y1, r, c) {
  for (let y = Math.round(y0); y < Math.round(y1); y++) {
    for (let x = Math.round(x0); x < Math.round(x1); x++) {
      const cx = Math.min(Math.max(x, x0 + r), x1 - r)
      const cy = Math.min(Math.max(y, y0 + r), y1 - r)
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r * r) px(x, y, c)
    }
  }
}

// ---- 绘制（坐标均为 2x 空间）----
// 1. 蓝底圆角
roundRect(40, 40, S - 40, S - 40, 180, BLUE)
// 2. 挂环（白）
roundRect(316, 300, 372, 440, 16, WHITE)
roundRect(652, 300, 708, 440, 16, WHITE)
// 3. 日历主体（白）
roundRect(224, 380, 800, 832, 36, WHITE)
// 4. 顶部红条
roundRect(224, 380, 800, 472, 0, RED)
// 5. 日期点阵 4列 x 3行
const cols = [280, 400, 520, 640]
const rows = [530, 640, 750]
for (const x of cols) {
  for (const y of rows) {
    roundRect(x, y, x + 88, y + 70, 14, DOT)
  }
}

// ---- 缩小（box filter）----
const out = new Uint8Array(W * W * 4)
const n = SS * SS
for (let y = 0; y < W; y++) {
  for (let x = 0; x < W; x++) {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    for (let dy = 0; dy < SS; dy++) {
      for (let dx = 0; dx < SS; dx++) {
        const i = ((y * SS + dy) * S + (x * SS + dx)) * 4
        r += buf[i]
        g += buf[i + 1]
        b += buf[i + 2]
        a += buf[i + 3]
      }
    }
    const o = (y * W + x) * 4
    out[o] = Math.round(r / n)
    out[o + 1] = Math.round(g / n)
    out[o + 2] = Math.round(b / n)
    out[o + 3] = Math.round(a / n)
  }
}

// ---- PNG 编码 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

function crc32(b) {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(W, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const raw = Buffer.alloc(W * (W * 4 + 1))
for (let y = 0; y < W; y++) {
  raw[y * (W * 4 + 1)] = 0 // filter: none
  Buffer.from(out.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, png)
console.log('图标已生成:', OUT, png.length, 'bytes', `${W}x${W}`)
