#!/usr/bin/env node
/**
 * patch-ios-ats.mjs — 给 `tauri ios init` 生成的 Info.plist 注入 ATS 放行规则。
 *
 * 背景：iOS 的 App Transport Security (ATS) 默认禁止 http:// 明文请求。
 * 本项目移动端 App 的数据服务走内网穿透域名（http），不放行则 App 内所有 /api 请求
 * 都会被系统静默拦截（页面能开、数据全无）。
 *
 * 用法（在 `pnpm tauri ios init` 之后、`pnpm tauri ios build` 之前运行）：
 *   node scripts/patch-ios-ats.mjs
 *
 * 说明：gen/apple 每次由 ios init 重新生成，所以本脚本是幂等的——已含
 * NSAppTransportSecurity 的文件会跳过。若未来数据服务升级为 https，可删掉本步骤。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), 'apps', 'mobile', 'src-tauri', 'gen', 'apple')

if (!statSync(ROOT, { throwIfNoEntry: false })) {
  console.error(`[patch-ios-ats] 找不到 ${ROOT}，请先运行 pnpm tauri ios init`)
  process.exit(1)
}

const INJECT = `
\t<key>NSAppTransportSecurity</key>
\t<dict>
\t\t<key>NSAllowsArbitraryLoads</key>
\t\t<true/>
\t</dict>
`

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) yield* walk(p)
    else if (name === 'Info.plist') yield p
  }
}

let patched = 0
for (const p of walk(ROOT)) {
  const text = readFileSync(p, 'utf8')
  if (text.includes('NSAppTransportSecurity')) continue
  const i = text.lastIndexOf('</dict>')
  if (i < 0) {
    console.warn(`[patch-ios-ats] 跳过（结构异常）: ${p}`)
    continue
  }
  writeFileSync(p, text.slice(0, i) + INJECT + text.slice(i), 'utf8')
  patched++
  console.log(`[patch-ios-ats] 已放行 http: ${p}`)
}

console.log(`[patch-ios-ats] 完成，共修改 ${patched} 个 Info.plist`)
