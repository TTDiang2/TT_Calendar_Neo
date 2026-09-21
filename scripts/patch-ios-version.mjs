#!/usr/bin/env node
/**
 * patch-ios-version.mjs — 给 `tauri ios init` 生成的工程注入唯一的 CFBundleVersion。
 *
 * 背景：App Store Connect 要求同一 CFBundleShortVersionString 下，每次上传的
 * CFBundleVersion 必须唯一（重复会被拒收）。而 tauri 每次生成的工程都是固定值：
 *   · 主 App 的 Info.plist：CFBundleVersion 是字面量（= tauri.conf.json 的 version）
 *   · 小组件：Info.plist 写 $(CURRENT_PROJECT_VERSION)，值来自 pbxproj 里的 "1"
 * 不注入的话第二次上传必然撞车。本脚本把两处都改成同一个 BUILD_NUMBER
 * （嵌入的 extension 与宿主 App 的 CFBundleVersion 必须一致，否则上传校验拒收）。
 *
 * 用法（在 `tauri ios init` + patch-add-widget 之后、xcodebuild 之前运行）：
 *   BUILD_NUMBER=<run_number> node scripts/patch-ios-version.mjs [gen/apple 路径]
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.argv[2] ?? join(process.cwd(), 'apps', 'mobile', 'src-tauri', 'gen', 'apple')
const BUILD = (process.env.BUILD_NUMBER ?? String(Math.floor(Date.now() / 1000))).trim()
if (!/^\d+(\.\d+)*$/.test(BUILD)) {
  console.error(`[patch-ios-version] BUILD_NUMBER 不是合法版本号: ${BUILD}`)
  process.exit(1)
}

if (!statSync(ROOT, { throwIfNoEntry: false })) {
  console.error(`[patch-ios-version] 找不到 ${ROOT}，请先运行 pnpm tauri ios init`)
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

let plistPatched = 0
let pbxPatched = 0
for (const p of walk(ROOT)) {
  const base = p.split(/[\\/]/).pop()

  if (base === 'Info.plist') {
    const text = readFileSync(p, 'utf8')
    // 只认 CFBundleVersion 那个键（$(VAR) 与字面量都吃）
    const next = text.replace(
      /(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/,
      (_m, a, b) => `${a}${BUILD}${b}`,
    )
    if (next !== text) {
      writeFileSync(p, next, 'utf8')
      plistPatched++
      console.log(`[patch-ios-version] Info.plist CFBundleVersion → ${BUILD}: ${p}`)
    }
    continue
  }

  if (base === 'project.pbxproj') {
    const text = readFileSync(p, 'utf8')
    // CURRENT_PROJECT_VERSION 的值可能是带引号字符串或裸值，两种写法都换掉
    const next = text.replace(
      /(CURRENT_PROJECT_VERSION = )("[^"]*"|[^;]+)(;)/g,
      (_m, a, _v, c) => `${a}"${BUILD}"${c}`,
    )
    const hits = (text.match(/CURRENT_PROJECT_VERSION = /g) ?? []).length
    if (next !== text) {
      writeFileSync(p, next, 'utf8')
      pbxPatched += hits
      console.log(`[patch-ios-version] pbxproj CURRENT_PROJECT_VERSION → ${BUILD}（${hits} 处）: ${p}`)
    }
  }
}

// 硬校验：主 App 的 Info.plist 必须被改到，否则版本号根本没注入进去
const mainPlist = [...walk(ROOT)].find((p) => p.includes('_iOS') && p.endsWith('Info.plist'))
if (!mainPlist) {
  console.error('[patch-ios-version] 找不到主 App 的 Info.plist（*_iOS/Info.plist）')
  process.exit(1)
}
const mainText = readFileSync(mainPlist, 'utf8')
if (!mainText.includes(`<key>CFBundleVersion</key>\n\t<string>${BUILD}</string>`)) {
  console.error(`[patch-ios-version] 主 App Info.plist 的 CFBundleVersion 未变成 ${BUILD}，注入失败`)
  console.error(mainText.match(/<key>CFBundleVersion<\/key>[\s\S]{0,60}/)?.[0] ?? '(找不到该键)')
  process.exit(1)
}

console.log(`[patch-ios-version] 完成：plist ${plistPatched} 个 / pbxproj ${pbxPatched} 处，BUILD=${BUILD}`)
