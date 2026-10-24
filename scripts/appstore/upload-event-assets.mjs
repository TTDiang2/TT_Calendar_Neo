// App 内活动卡片图上传：一张语言中立卡复用到 8 个 appEventLocalization
// 流程：POST appEventScreenshots（拿 uploadOperations）→ 分片 PUT → PATCH uploaded:true
import { readFileSync, writeFileSync } from 'node:fs'
import { statSync } from 'node:fs'
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

const file = 'E:/TT_Calendar_Neo/artifacts/asc/v110-event-card.png'
const buf = readFileSync(file)
const size = statSync(file).size

const LOCS = {
  'zh-Hans': '86295403-8ad6-419a-9964-76d4d95fdcf9',
  'zh-Hant': '7d8542a7-55d2-4831-918d-0ac2056e4957',
  'en-US': '05da7da0-37a8-4912-9964-42706e4c826f',
  'ja': '86e4fbe4-52f8-4c4a-9779-40434875e100',
  'ko': 'd3f14f2d-b648-4cd6-863f-4d38cbcb0016',
  'fr-FR': '8c4643ba-0f3a-4934-8e08-db7eb3424e20',
  'es-ES': 'c2353947-990e-4ecb-89a8-0299fbc3b530',
  'ru': '0f5afcae-478f-45f9-a30f-e95b45f284f4',
}

for (const [loc, id] of Object.entries(LOCS)) {
  // 幂等：先清已有
  const have = api('GET', `/v1/appEventLocalizations/${id}/appEventScreenshots`)
  for (const s of have.data ?? []) { api('DELETE', `/v1/appEventScreenshots/${s.id}`); console.log(`[${loc}] 清除旧图`) }
  const created = api('POST', '/v1/appEventScreenshots', {
    data: {
      type: 'appEventScreenshots',
      attributes: { fileName: 'v110-event-card.png', fileSize: size, appEventAssetType: 'EVENT_CARD' },
      relationships: { appEventLocalization: { data: { type: 'appEventLocalizations', id } } },
    },
  })
  const shot = created.data
  for (const op of shot.attributes.uploadOperations ?? []) {
    const chunk = buf.subarray(op.offset, op.offset + op.length)
    writeFileSync('_tmp-chunk.bin', chunk)
    const args = ['-sS', '--max-time', '300', '-X', op.method, op.url,
      '-H', 'Content-Type: application/octet-stream', '--data-binary', '@_tmp-chunk.bin']
    for (const h of op.requestHeaders ?? []) args.push('-H', `${h.name}: ${h.value}`)
    const r = spawnSync('curl', args, { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`分片失败 ${loc}: ${r.stderr}`)
  }
  api('PATCH', `/v1/appEventScreenshots/${shot.id}`, {
    data: { type: 'appEventScreenshots', id: shot.id, attributes: { uploaded: true } },
  })
  console.log(`[${loc}] 卡片已上传`)
}
console.log('EVENT ASSETS DONE')
