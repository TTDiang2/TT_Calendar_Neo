// App Store Connect API 小工具（Node 内置 crypto，零依赖）
// 用法：node asc.mjs <method> <path> [jsonBodyFile]
// 环境变量：ASC_KEY_PATH / ASC_KEY_ID / ASC_ISSUER_ID
import { readFileSync } from 'node:fs'
import { createSign, createHmac } from 'node:crypto'

const KEY_PATH = process.env.ASC_KEY_PATH
const KEY_ID = process.env.ASC_KEY_ID
const ISSUER = process.env.ASC_ISSUER_ID
const HOST = 'https://api.appstoreconnect.apple.com'

const b64url = (buf) => Buffer.from(buf).toString('base64url')

// ES256 的签名要 raw r||s（各 32 字节），node 输出的是 ASN.1 DER，需要转换
function derToRaw(der) {
  let off = 2 // 跳过 0x30 totalLen
  const readInt = () => {
    if (der[off] !== 0x02) throw new Error(`bad DER @${off}: 0x${der[off].toString(16)}`)
    const len = der[off + 1]
    const v = der.subarray(off + 2, off + 2 + len)
    off += 2 + len
    return v
  }
  const r = readInt()
  const s = readInt()
  const pad = (v) => {
    const t = v.length > 32 ? v.subarray(v.length - 32) : v
    return Buffer.concat([Buffer.alloc(32 - t.length, 0), t])
  }
  return Buffer.concat([pad(r), pad(s)])
}

function jwt() {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }))
  const payload = Buffer.from(JSON.stringify({ iss: ISSUER, iat: now - 10, exp: now + 1200, aud: 'appstoreconnect-v1' }))
  const signingInput = `${b64url(header)}.${b64url(payload)}`
  const der = createSign('SHA256').update(signingInput).sign(readFileSync(KEY_PATH))
  return `${signingInput}.${Buffer.from(derToRaw(der)).toString('base64url')}`
}

const [cmd] = process.argv.slice(2)
if (cmd === 'token') {
  // 只输出 JWT，供 bash 里的 curl 使用
  console.log(jwt())
  process.exit(0)
}
console.error('用法: node asc.mjs token')
process.exit(1)
