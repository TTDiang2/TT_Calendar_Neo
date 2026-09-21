#!/usr/bin/env node
/**
 * patch-ios-device-family.mjs — 把 iOS 工程的设备族收敛为 iPhone（TARGETED_DEVICE_FAMILY="1"）。
 *
 * 为什么：tauri ios init 生成的工程默认 "1,2"（iPhone + iPad），而 App Store 对声明
 * 支持 iPad 的 App 强制要求 12.9" iPad 截图，且审核会在 iPad 上实测——本工程从未在
 * iPad 上验证过（20260921 提审实测：报 STATE_ERROR.SCREENSHOT_REQUIRED.APP_IPAD_PRO_3GEN_129）。
 * v1.0.0 按 iPhone 专用提交；将来要支持 iPad，先在真机走查再撤掉本脚本。
 *
 * 用法（在 `tauri ios init` + patch-add-widget 之后、xcodebuild 之前运行）：
 *   node scripts/patch-ios-device-family.mjs
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.argv[2] ?? join(process.cwd(), 'apps', 'mobile', 'src-tauri', 'gen', 'apple')

if (!statSync(ROOT, { throwIfNoEntry: false })) {
  console.error(`[patch-ios-device-family] 找不到 ${ROOT}，请先运行 pnpm tauri ios init`)
  process.exit(1)
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) yield* walk(p)
    else yield p
  }
}

let patched = 0
for (const p of walk(ROOT)) {
  if (!p.endsWith('project.pbxproj')) continue
  const text = readFileSync(p, 'utf8')
  // 带引号（本仓库生成物）与不带引号两种写法都换
  const next = text
    .replace(/TARGETED_DEVICE_FAMILY = "1,2";/g, 'TARGETED_DEVICE_FAMILY = "1";')
    .replace(/TARGETED_DEVICE_FAMILY = 1,2;/g, 'TARGETED_DEVICE_FAMILY = "1";')
  if (next !== text) {
    const n = (text.match(/TARGETED_DEVICE_FAMILY = ("?)1,2\1;/g) ?? []).length
    writeFileSync(p, next, 'utf8')
    patched += n
    console.log(`[patch-ios-device-family] 已收敛为 iPhone 专用（${n} 处）: ${p}`)
  }
}

if (patched === 0) {
  console.error('[patch-ios-device-family] 未找到任何 TARGETED_DEVICE_FAMILY = 1,2 —— 工程结构可能变了，请检查')
  process.exit(1)
}
console.log(`[patch-ios-device-family] 完成，共 ${patched} 处`)
