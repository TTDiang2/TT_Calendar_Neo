// 预览视频上传：6.7" 规格，zh 视频 → zh-Hans/zh-Hant，en 视频 → en-US
// 流程：建（或复用）appPreviewSets(APP_IPHONE_67) → POST appPreviews → 分片 PUT → PATCH uploaded
import { readFileSync, writeFileSync } from 'node:fs'
import { statSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const API = 'https://api.appstoreconnect.apple.com'
const TOKEN = process.env.ASC_JWT
if (!TOKEN) { console.error('需要环境变量 ASC_JWT'); process.exit(1) }

function api(method, path, body) {
  const args = ['-sS', '-g', '--max-time', '120', '-X', method, `${API}${path}`,
    '-H', `Authorization: Bearer ${TOKEN}`, '-H', 'Content-Type: application/json']
  if (body) {
    writeFileSync('_tmp-event.json', JSON.stringify(body))
    args.push('--data', '@_tmp-event.json')
  }
  const r = spawnSync('curl', args, { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('curl: ' + r.stderr)
  if (!r.stdout.trim()) return {}
  const out = JSON.parse(r.stdout)
  if (out.errors) throw new Error(`${method} ${path} → ${out.errors[0].detail ?? out.errors[0].title}`)
  return out
}

const st = JSON.parse(readFileSync('E:/TT_Calendar_Neo/artifacts/asc/v110-state.json', 'utf8'))
const PLAN = [
  { loc: 'zh-Hans', file: 'E:/TT_Calendar_Neo/artifacts/asc/v110-preview-zh-Hans.mp4' },
  { loc: 'zh-Hant', file: 'E:/TT_Calendar_Neo/artifacts/asc/v110-preview-zh-Hans.mp4' },
  { loc: 'en-US', file: 'E:/TT_Calendar_Neo/artifacts/asc/v110-preview-en-US.mp4' },
]

for (const { loc, file } of PLAN) {
  if (!existsSync(file)) { console.log(`[${loc}] 视频尚未生成，跳过: ${file}`); continue }
  const locId = st.locIds[loc]
  const size = statSync(file).size
  // 建（或复用）预览集合
  const sets = api('GET', `/v1/appStoreVersionLocalizations/${locId}/appPreviewSets?filter[previewType]=IPHONE_67`)
  let setId = sets.data?.[0]?.id
  if (!setId) {
    setId = api('POST', '/v1/appPreviewSets', {
      data: {
        type: 'appPreviewSets',
        attributes: { previewType: 'IPHONE_67' },
        relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: locId } } },
      },
    }).data.id
    console.log(`[${loc}] 已建预览集合 ${setId}`)
  } else {
    console.log(`[${loc}] 复用预览集合 ${setId}`)
  }
  // 清已有预览（幂等）
  const have = api('GET', `/v1/appPreviewSets/${setId}/appPreviews`)
  for (const p of have.data ?? []) { api('DELETE', `/v1/appPreviews/${p.id}`); console.log(`[${loc}] 清除旧视频`) }
  const created = api('POST', '/v1/appPreviews', {
    data: {
      type: 'appPreviews',
      attributes: { fileName: file.split('/').pop(), fileSize: size, mimeType: 'video/mp4' },
      relationships: { appPreviewSet: { data: { type: 'appPreviewSets', id: setId } } },
    },
  })
  const prev = created.data
  for (const op of prev.attributes.uploadOperations ?? []) {
    const buf = readFileSync(file)
    const chunk = buf.subarray(op.offset, op.offset + op.length)
    writeFileSync('_tmp-chunk.bin', chunk)
    const args = ['-sS', '--max-time', '600', '-X', op.method, op.url,
      '-H', 'Content-Type: application/octet-stream', '--data-binary', '@_tmp-chunk.bin']
    for (const h of op.requestHeaders ?? []) args.push('-H', `${h.name}: ${h.value}`)
    const r = spawnSync('curl', args, { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`分片失败 ${loc}: ${r.stderr}`)
  }
  api('PATCH', `/v1/appPreviews/${prev.id}`, {
    data: { type: 'appPreviews', id: prev.id, attributes: { uploaded: true } },
  })
  console.log(`[${loc}] 视频已上传 (${(size / 1024 / 1024).toFixed(1)}MB)`)
}
console.log('PREVIEW VIDEOS DONE')
