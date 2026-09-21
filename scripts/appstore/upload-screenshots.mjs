// 上传 App Store 截图（6.7" 规格）到指定版本本地化
// 用法：node upload-screenshots.mjs <versionLocalizationId> <displayType> <file...>
// 流程：建集合 → 逐张 reserve（拿 uploadOperations）→ PUT 分片 → commit（uploaded+md5）
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { createHash, createSign } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const KEY_ID = process.env.ASC_KEY_ID
const ISSUER = process.env.ASC_ISSUER_ID
const b64url = (b) => Buffer.from(b).toString('base64url')
function derToRaw(der) {
  let off = 2
  const readInt = () => {
    const len = der[off + 1]
    const v = der.subarray(off + 2, off + 2 + len)
    off += 2 + len
    return v
  }
  const r = readInt(), s = readInt()
  const pad = (v) => {
    const t = v.length > 32 ? v.subarray(v.length - 32) : v
    return Buffer.concat([Buffer.alloc(32 - t.length, 0), t])
  }
  return Buffer.concat([pad(r), pad(s)])
}
function jwt() {
  const now = Math.floor(Date.now() / 1000)
  const h = Buffer.from(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }))
  const p = Buffer.from(JSON.stringify({ iss: ISSUER, iat: now - 10, exp: now + 1200, aud: 'appstoreconnect-v1' }))
  const si = `${b64url(h)}.${b64url(p)}`
  const der = createSign('SHA256').update(si).sign(readFileSync(process.env.ASC_KEY_PATH))
  return `${si}.${Buffer.from(derToRaw(der)).toString('base64url')}`
}

function api(method, path, body) {
  const args = ['-sS', '--max-time', '120', '-X', method, `https://api.appstoreconnect.apple.com${path}`,
    '-H', `Authorization: Bearer ${jwt()}`, '-H', 'Content-Type: application/json']
  if (body) {
    writeFileSync('_tmp-body.json', JSON.stringify(body))
    args.push('--data', '@_tmp-body.json')
  }
  const r = spawnSync('curl', args, { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('curl 失败: ' + r.stderr)
  if (!r.stdout.trim()) return {} // DELETE 等返回 204 空体
  const out = JSON.parse(r.stdout)
  if (out.errors) throw new Error(`${method} ${path} → ${out.errors[0].title}: ${out.errors[0].detail}`)
  return out
}

const [locId, displayType, ...files] = process.argv.slice(2)
if (!locId || !displayType || !files.length) {
  console.error('用法: node upload-screenshots.mjs <locId> <displayType> <files...>')
  process.exit(1)
}

// 1) 建（或复用）截图集合
const existing = api('GET', `/v1/appStoreVersionLocalizations/${locId}/appScreenshotSets`)
let set = (existing.data ?? []).find((s) => s.attributes.screenshotDisplayType === displayType)
if (!set) {
  set = api('POST', '/v1/appScreenshotSets', {
    data: {
      type: 'appScreenshotSets',
      attributes: { screenshotDisplayType: displayType },
      relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: locId } } },
    },
  }).data
  console.log('已建截图集合:', set.id, displayType)
} else {
  console.log('复用已有截图集合:', set.id, displayType)
}

// 幂等：先清掉集合里已有的截图（含上次中断留下的半成品）
const have = api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`)
for (const s of have.data ?? []) {
  api('DELETE', `/v1/appScreenshots/${s.id}`)
  console.log('已清理旧截图:', s.attributes.fileName)
}

// 2) 逐张上传
for (const file of files) {
  const buf = readFileSync(file)
  const fileName = file.split(/[\\/]/).pop()
  const created = api('POST', '/v1/appScreenshots', {
    data: {
      type: 'appScreenshots',
      attributes: { fileSize: statSync(file).size, fileName },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } },
    },
  })
  const shot = created.data
  // 3) 逐分片 PUT
  for (const op of shot.attributes.uploadOperations ?? []) {
    const chunk = buf.subarray(op.offset, op.offset + op.length)
    writeFileSync('_tmp-chunk.bin', chunk)
    const args = ['-sS', '--max-time', '300', '-X', op.method, op.url,
      '-H', 'Content-Type: application/octet-stream', '--data-binary', '@_tmp-chunk.bin']
    for (const h of op.requestHeaders ?? []) args.push('-H', `${h.name}: ${h.value}`)
    const r = spawnSync('curl', args, { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`分片上传失败 ${fileName}: ${r.stderr}`)
  }
  // 4) commit（appScreenshots 只需 uploaded 标记；md5 校验字段不在此资源上）
  api('PATCH', `/v1/appScreenshots/${shot.id}`, {
    data: { type: 'appScreenshots', id: shot.id, attributes: { uploaded: true } },
  })
  console.log('已上传:', fileName, `(${(buf.length / 1024 / 1024).toFixed(1)}MB)`, 'md5', createHash('md5').update(buf).digest('hex').slice(0, 8))
}
console.log('全部完成')
