#!/usr/bin/env node
/**
 * patch-ios-plist.mjs — 给 `tauri ios init` 生成的 Info.plist 注入 iOS 权限/网络键。
 *
 * 背景：gen/apple 由 `tauri ios init` 重新生成，产物 Info.plist 只有最小键集。
 * 本脚本做两件事（都幂等，重复运行不叠加）：
 *
 * 1. ATS 放行 http：App 的数据服务走内网穿透域名（http://），不放行则所有
 *    /api 请求被系统静默拦截（页面能开、数据全无）。
 * 2. NSLocalNetworkUsageDescription：App 一旦访问局域网地址（例如把 VITE_API_BASE
 *    指向局域网 IP、或装的是 dev 模式包需要连电脑 dev server），iOS 要求该键才会
 *    弹出「本地网络」授权；缺失时系统不弹窗、设置里也找不到对应开关，表现为请求
 *    静默失败。纯公网域名与本地库模式不需要它，但声明了无害。
 *    （注：Bonjour/mDNS 才需要 NSBonjourServices 与 multicast entitlement，
 *    本 App 不做设备发现，无需这两项。）
 *
 * 用法（在 `pnpm tauri ios init` 之后、xcodebuild/打包之前运行）：
 *   node scripts/patch-ios-plist.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), 'apps', 'mobile', 'src-tauri', 'gen', 'apple')

if (!statSync(ROOT, { throwIfNoEntry: false })) {
  console.error(`[patch-ios-plist] 找不到 ${ROOT}，请先运行 pnpm tauri ios init`)
  process.exit(1)
}

const ATS = `
\t<key>NSAppTransportSecurity</key>
\t<dict>
\t\t<key>NSAllowsArbitraryLoads</key>
\t\t<true/>
\t</dict>
`
const LOCAL_NETWORK = `
\t<key>NSLocalNetworkUsageDescription</key>
\t<string>日历数据支持连接同一局域网内的电脑数据服务，需要本地网络权限；不使用该功能时不会访问本地网络。</string>
`
// 出口合规：仅使用系统 HTTPS（豁免加密），声明后提审无需每次填写法国加密问卷
const EXPORT_COMPLIANCE = `
\t<key>ITSAppUsesNonExemptEncryption</key>
\t<false/>
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
  const missing = [
    ...(text.includes('NSAppTransportSecurity') ? [] : [ATS]),
    ...(text.includes('NSLocalNetworkUsageDescription') ? [] : [LOCAL_NETWORK]),
    ...(text.includes('ITSAppUsesNonExemptEncryption') ? [] : [EXPORT_COMPLIANCE]),
  ]
  if (missing.length === 0) continue
  const i = text.lastIndexOf('</dict>')
  if (i < 0) {
    console.warn(`[patch-ios-plist] 跳过（结构异常）: ${p}`)
    continue
  }
  writeFileSync(p, text.slice(0, i) + missing.join('') + text.slice(i), 'utf8')
  patched++
  console.log(`[patch-ios-plist] 已注入权限键: ${p}`)
}

console.log(`[patch-ios-plist] 完成，共修改 ${patched} 个 Info.plist`)
