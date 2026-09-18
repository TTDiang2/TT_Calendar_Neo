#!/usr/bin/env node
/**
 * 把仓库里 `tauri icon` 生成的 iOS 图标覆盖进 gen/apple 的 AppIcon.appiconset。
 *
 * 为什么需要（20260918 任务书 1.4）：CI 用 `tauri ios init --ci` 现场生成 Xcode
 * 工程，资源目录里放的是 tauri 内置的默认图标；官方 `tauri ios build` 会在构建时
 * 同步图标，而本仓库 CI 走「直接 xcodebuild」路线（原因见 ios-build.yml 头注释），
 * 没有任何环节做这个同步——打出来的包永远是 Tauri 默认图标，仓库里精心生成的
 * apps/mobile/src-tauri/icons/ios/ 全套从未进过产物。
 *
 * 做法：读生成工程里每个 AppIcon.appiconset/Contents.json 引用的文件名清单，
 * 用 src-tauri/icons/ios/ 下同名文件逐一覆盖；对不上号的打警告，一个都没覆盖到
 * 则报错退出（防「以为换了图标其实还在用默认」的静默失败）。
 */
import { readFileSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const genDir = join(repoRoot, 'apps', 'mobile', 'src-tauri', 'gen', 'apple')
const srcDir = join(repoRoot, 'apps', 'mobile', 'src-tauri', 'icons', 'ios')

if (!existsSync(srcDir)) {
  console.error(`[patch-ios-icons] 找不到图标源目录：${srcDir}`)
  console.error('[patch-ios-icons] 先在 apps/mobile 下跑 `pnpm exec tauri icon icon-source.png` 生成。')
  process.exit(1)
}

/** 递归找 gen/apple 下所有 AppIcon.appiconset（主 App + 小组件扩展都可能带） */
function findAppIconSets(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (!statSync(p).isDirectory()) continue
    if (name === 'AppIcon.appiconset') out.push(p)
    else out.push(...findAppIconSets(p))
  }
  return out
}

if (!existsSync(genDir)) {
  console.error(`[patch-ios-icons] 找不到生成的 Xcode 工程：${genDir}`)
  console.error('[patch-ios-icons] 请在 `pnpm tauri ios init` 之后运行本脚本。')
  process.exit(1)
}

const sets = findAppIconSets(genDir)
if (sets.length === 0) {
  console.error('[patch-ios-icons] gen/apple 下没有任何 AppIcon.appiconset（工程结构变了？）')
  process.exit(1)
}

let totalCopied = 0
for (const set of sets) {
  const manifestPath = join(set, 'Contents.json')
  if (!existsSync(manifestPath)) {
    console.warn(`[patch-ios-icons] ${set} 缺 Contents.json，跳过`)
    continue
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const filenames = [...new Set((manifest.images ?? []).map((img) => img.filename).filter(Boolean))]
  let copied = 0
  const missing = []
  for (const name of filenames) {
    const srcFile = join(srcDir, name)
    if (existsSync(srcFile)) {
      copyFileSync(srcFile, join(set, name))
      copied += 1
    } else {
      missing.push(name)
    }
  }
  totalCopied += copied
  const rel = set.replace(genDir, 'gen/apple')
  console.log(`[patch-ios-icons] ${rel}: 覆盖 ${copied}/${filenames.length} 枚图标`)
  if (missing.length > 0) {
    console.warn(`[patch-ios-icons] ⚠️ ${rel} 引用了源目录没有的文件（保持原样）：${missing.join(', ')}`)
  }
}

if (totalCopied === 0) {
  console.error('[patch-ios-icons] 一枚图标都没覆盖成——工程 Contents.json 与 icons/ios 文件名完全对不上，中止构建以免静默出默认图标包。')
  process.exit(1)
}
console.log(`[patch-ios-icons] 完成：共覆盖 ${totalCopied} 枚图标。`)
