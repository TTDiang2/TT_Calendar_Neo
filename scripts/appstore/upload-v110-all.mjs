// 1.1.0 截图批量上传驱动：8 语言 × 9 张，每语言最多重试 4 次（upload-screenshots.mjs 幂等：
// 先清集合内旧图再传，重跑安全）
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const st = JSON.parse(readFileSync(join(HERE, '..', '..', 'artifacts', 'asc', 'v110-state.json'), 'utf8'))
const files = ['01', '02', '03', '04', '05', '06', '07', '08', '09'].map(
  (n) => `E:/TT_Calendar_Neo/artifacts/preview/v3-out/final/xx-${n}.png`,
)

for (const [lang, locId] of Object.entries(st.locIds)) {
  let ok = false
  for (let att = 1; att <= 4 && !ok; att++) {
    try {
      console.log(`=== ${lang}（第 ${att} 次）===`)
      const out = execFileSync(
        process.execPath,
        ['scripts/appstore/upload-screenshots.mjs', locId, 'APP_IPHONE_67', ...files.map((f) => f.replace('xx', lang))],
        { encoding: 'utf8', timeout: 420_000 },
      )
      const lines = out.trim().split('\n').filter((l) => /已上传|已建|复用|全部完成/.test(l))
      for (const l of lines) console.log(' ', l.trim())
      ok = out.includes('全部完成')
    } catch (e) {
      const msg = String(e.stdout ?? '') + String(e.stderr ?? e.message ?? '')
      console.error(`  失败: ${msg.split('\n').filter((l) => /Error|失败|curl/.test(l)).slice(0, 3).join(' | ').slice(0, 300)}`)
      if (att < 4) {
        console.log('  15s 后重试…')
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15_000)
      }
    }
  }
  if (!ok) {
    console.error(`❌ ${lang} 4 次未成功，中止（其余语言继续）`)
  }
}
console.log('DRIVER DONE')
