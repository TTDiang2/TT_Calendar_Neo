// 去掉 PNG 的 alpha 通道（RGBA → RGB）：App Store 截图不接受 alpha（IMAGE_ALPHA_NOT_ALLOWED）
// 用法：node to-rgb.mjs <in.png> <out.png>
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync, deflateSync } from 'node:zlib'

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let c = -1
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function decode(path) {
  const raw = readFileSync(path)
  let off = 8, ihdr, idat = []
  while (off < raw.length) {
    const len = raw.readUInt32BE(off)
    const type = raw.toString('ascii', off + 4, off + 8)
    const data = raw.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') ihdr = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4)
  const colorType = ihdr[9], interlace = ihdr[12]
  if (ihdr[8] !== 8 || interlace !== 0) throw new Error('只支持 8bit 非隔行 PNG')
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (!bpp) throw new Error('不支持的颜色类型 ' + colorType)
  const inflated = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const rows = []
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = inflated[y * (stride + 1)]
    const cur = Buffer.from(inflated.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0
      const b = prev[i]
      const c = i >= bpp ? prev[i - bpp] : 0
      switch (filter) {
        case 1: cur[i] += a; break
        case 2: cur[i] += b; break
        case 3: cur[i] += (a + b) >> 1; break
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
          cur[i] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        }
      }
    }
    rows.push(cur)
    prev = cur
  }
  return { width, height, colorType, bpp, rows }
}

function encodeRGB(img, out) {
  const { width, height, bpp, rows } = img
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const src = rows[y]
    const base = y * (stride + 1)
    raw[base] = 0 // filter none
    if (bpp === 3) {
      src.copy(raw, base + 1)
    } else {
      // RGBA 丢 alpha：假定不透明（我们的图背景全铺满）
      for (let x = 0, o = base + 1; x < width; x++, o += 3) {
        raw[o] = src[x * 4]
        raw[o + 1] = src[x * 4 + 1]
        raw[o + 2] = src[x * 4 + 2]
      }
    }
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([head, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2 // RGB
  writeFileSync(out, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]))
}

const [inFile, outFile] = process.argv.slice(2)
const img = decode(inFile)
encodeRGB(img, outFile)
console.log(`${inFile} (colorType ${img.colorType}) → ${outFile} (RGB, 无水印 alpha)`)
