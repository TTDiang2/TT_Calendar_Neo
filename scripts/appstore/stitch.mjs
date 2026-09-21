// PNG 无损行拼接：tileA（页面顶部 0..SEAM）+ tileB（SEAM..2796）→ frames 最终图
// 用法：node stitch.mjs <tileA.png> <tileB.png> <seam行号> <out.png>
// 仅支持 8-bit RGB/RGBA、非隔行 PNG（Chromium 截图产物即此格式）
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync, deflateSync } from 'node:zlib'

const [aPath, bPath, seamArg, outPath] = process.argv.slice(2)
const SEAM = Number(seamArg)

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
  if (raw.readUInt32BE(0) !== 0x89504e47) throw new Error('not png: ' + path)
  let off = 8
  let ihdr, idat = []
  while (off < raw.length) {
    const len = raw.readUInt32BE(off)
    const type = raw.toString('ascii', off + 4, off + 8)
    const data = raw.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') ihdr = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  const width = ihdr.readUInt32BE(0)
  const height = ihdr.readUInt32BE(4)
  const bitDepth = ihdr[8], colorType = ihdr[9], interlace = ihdr[12]
  if (bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType))
    throw new Error(`unsupported png ${path}: depth=${bitDepth} color=${colorType} interlace=${interlace}`)
  const bpp = colorType === 6 ? 4 : 3
  const inflated = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  // 反滤波
  const rows = []
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = inflated[y * (stride + 1)]
    const line = inflated.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = Buffer.from(line)
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0
      const b = prev[i]
      const c = i >= bpp ? prev[i - bpp] : 0
      switch (filter) {
        case 1: cur[i] = cur[i] + a; break
        case 2: cur[i] = cur[i] + b; break
        case 3: cur[i] = cur[i] + ((a + b) >> 1); break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
          cur[i] = cur[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
      }
    }
    rows.push(cur)
    prev = cur
  }
  return { width, height, colorType, bpp, rows }
}

function encode(img, rows, total) {
  const { width, colorType, bpp } = img
  const height = total
  const stride = width * bpp
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter none
    rows[y].copy(raw, y * (stride + 1) + 1)
  }
  const chunks = []
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = colorType
  const chunk = (type, data) => {
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([head, body, crc])
  }
  chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  chunks.push(chunk('IHDR', ihdr))
  chunks.push(chunk('IDAT', deflateSync(raw, { level: 9 })))
  chunks.push(chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(chunks)
}

const A = decode(aPath)
const B = decode(bPath)
if (A.width !== B.width || A.colorType !== B.colorType) throw new Error('tile 参数不一致')
const total = SEAM + B.height
const rows = [...A.rows.slice(0, SEAM), ...B.rows]
if (rows.length !== total) throw new Error(`行数不符: ${rows.length} != ${total}`)
writeFileSync(outPath, encode(A, rows, total))
console.log(`[stitch] ${outPath}: ${A.width}×${total} (seam@${SEAM})`)
