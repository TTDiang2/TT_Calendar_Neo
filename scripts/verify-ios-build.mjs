#!/usr/bin/env node
/**
 * verify-ios-build.mjs — 构建后验证 iOS 产物是「生产模式」而非「dev 模式」。
 *
 * 背景（2026-09 事故）：CI 的 xcode-script 编译 Rust lib 时若没带
 * `tauri/custom-protocol` feature，tauri 的 build.rs 会置 cfg(dev)，产物 App
 * 运行时把 tauri:// 的资源请求代理到 devUrl（http://localhost:5175）——真机上
 * 白屏并报 "did you grant local network permissions"。该错误文案属于
 * `#[cfg(all(dev, mobile))]` 的代理代码，release 产物里不存在；同时 dev 模式
 * 不嵌入前端资源（dist 里的文件名不在二进制中）。两者一查便知。
 *
 * 用法（在 macOS CI / 本机构建后运行；依赖 plutil，仅 macOS 有）：
 *   node scripts/verify-ios-build.mjs <path/to/App.app> [path/to/apps/mobile/dist]
 *
 * 检查项：
 *   1. 二进制中不得出现 dev 专属代理错误文案；
 *   2. 二进制中必须内嵌前端资源（dist/assets 的文件名，含 index 入口、worker、
 *      sql.js wasm 与 css——本地库能不能起来全看这些）；
 *   3. Info.plist 必须含 NSLocalNetworkUsageDescription / NSAppTransportSecurity；
 *   4. 可执行文件名必须是 ASCII（中文名会让签名/侧载工具出问题）。
 *
 * ⚠️ 判据是「当前传入的 dist 里的文件名出现在二进制中」——只在同一次构建
 *   （CI 里 dist 与 .app 同源）下成立。拿 CI 下载的 .app 配本机陈旧 dist 手动跑，
 *   会得到假失败/假通过。
 */
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const [, , appPath, distPath = 'apps/mobile/dist'] = process.argv
if (!appPath) {
  console.error('用法: node scripts/verify-ios-build.mjs <App.app 路径> [dist 目录]')
  process.exit(2)
}
if (!statSync(appPath, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`[verify-ios] .app 不存在: ${appPath}`)
  process.exit(2)
}

const fail = (msg) => {
  console.error(`[verify-ios] ❌ ${msg}`)
  process.exit(1)
}

// ── 定位可执行文件（优先 CFBundleExecutable）──────────────────────────────
const plistPath = join(appPath, 'Info.plist')
if (!existsSync(plistPath)) fail(`缺少 Info.plist: ${plistPath}`)
const plistText = execSync(`plutil -p "${plistPath}"`, { encoding: 'utf8' })
const exeName = /"CFBundleExecutable"\s*=>\s*"([^"]+)"/.exec(plistText)?.[1]
const binPath = exeName ? join(appPath, exeName) : undefined
if (!binPath || !existsSync(binPath)) fail(`Info.plist 的 CFBundleExecutable 无效: ${exeName}`)
const bin = readFileSync(binPath)

// ── 1. dev 专属错误文案不得存在 ──
const DEV_MARKER = 'did you grant local network permissions'
if (bin.includes(DEV_MARKER)) {
  fail(
    '二进制含 dev 模式专属的错误文案：Rust lib 被编成了 dev 模式（缺 tauri/custom-protocol feature）。\n' +
      '   检查 apps/mobile/src-tauri/Cargo.toml 的 [features] 与 scripts/ci-ios-options-server 的 features 返回值。'
  )
}
console.log('[verify-ios] ✅ 无 dev 模式标记')

// ── 2. 前端资源必须内嵌 ──
const assetsDir = join(distPath, 'assets')
if (!statSync(assetsDir, { throwIfNoEntry: false })) {
  fail(`前端 dist 不存在: ${assetsDir}（请先构建前端）`)
}
const assetNames = readdirSync(assetsDir).filter((n) =>
  /^index-.*\.js$|^index-.*\.css$|^db\.worker-.*\.js$|^window-.*\.js$|^sql-wasm-.*\.wasm$/.test(n),
)
if (assetNames.length === 0) fail(`dist/assets 中未找到入口产物: ${assetsDir}`)
const missing = assetNames.filter((n) => !bin.includes(Buffer.from(n)))
if (missing.length > 0) {
  fail(`前端资源未内嵌进二进制（说明走了 dev 模式或资源未打包）: ${missing.join(', ')}`)
}
console.log(`[verify-ios] ✅ 前端资源已内嵌（${assetNames.length} 个入口产物）`)

// ── 3. Info.plist 权限键 ──
for (const key of ['NSLocalNetworkUsageDescription', 'NSAppTransportSecurity']) {
  if (!plistText.includes(key)) fail(`Info.plist 缺少 ${key}（请运行 scripts/patch-ios-plist.mjs）`)
}
console.log('[verify-ios] ✅ Info.plist 权限键齐全')

// ── 4. 可执行文件名 ASCII ──
if (!/^[\x21-\x7E]+$/.test(exeName)) fail(`可执行文件名含非 ASCII 字符: ${exeName}`)
console.log(`[verify-ios] ✅ 可执行文件名 ASCII: ${exeName}`)

console.log('[verify-ios] 🎉 iOS 产物为生产模式，验证通过')
