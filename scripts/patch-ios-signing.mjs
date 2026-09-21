#!/usr/bin/env node
/**
 * patch-ios-signing.mjs — 把两个 target 的签名方式改为「手动签名 + 自建发布证书/描述文件」。
 *
 * 为什么：归档步骤原本用自动签名（-allowProvisioningUpdates → Apple 云签）。云签在
 * 每台全新的 CI 机器上找不到可用的开发证书，就**新建**一张——账户证书配额（2026-09
 * 实测：dev 证书上限 3 张）很快被吃满，之后每次构建都报
 * "Your account has reached the maximum number of certificates"（20260921 实录）。
 * 手动签名用我们自己经 ASC API 创建的分发证书 + 两份 App Store 描述文件
 * （CI 里已装入临时 keychain 与 Provisioning Profiles 目录），零云签依赖。
 *
 * 用法（在 tauri ios init + patch-add-widget + patch-ios-device-family 之后、
 *      xcodebuild 之前运行）：
 *   node scripts/patch-ios-signing.mjs [gen/apple 路径]
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.argv[2] ?? join(process.cwd(), 'apps', 'mobile', 'src-tauri', 'gen', 'apple')
const TEAM_ID = '8RRWT62P25'
/** bundle id → 描述文件名称（与 ASC 里创建的一致，见 docs/APPSTORE-SUBMISSION.md） */
const PROFILES = {
  'com.tt.calendar.mobile': 'TT Calendar AppStore',
  'com.tt.calendar.mobile.widget': 'TT Widget AppStore',
}

if (!statSync(ROOT, { throwIfNoEntry: false })) {
  console.error(`[patch-ios-signing] 找不到 ${ROOT}，请先运行 pnpm tauri ios init`)
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

/** 需要写入的签名设置（含引号形态，与工程既有风格一致） */
const settingsFor = (bundleId) => [
  `\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";`,
  `\t\t\t\tCODE_SIGN_STYLE = Manual;`,
  `\t\t\t\tDEVELOPMENT_TEAM = "${TEAM_ID}";`,
  `\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "${PROFILES[bundleId]}";`,
]
const MANAGED_KEYS = [
  /^\s*CODE_SIGN_IDENTITY = /,
  /^\s*CODE_SIGN_STYLE = /,
  /^\s*DEVELOPMENT_TEAM = /,
  /^\s*PROVISIONING_PROFILE_SPECIFIER = /,
]

let patchedTargets = 0
for (const p of walk(ROOT)) {
  if (!p.endsWith('project.pbxproj')) continue
  const lines = readFileSync(p, 'utf8').split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // 找出 buildSettings 块，判断它属于哪个 bundle id
    if (/^\s*buildSettings = \{$/.test(line)) {
      // 找块结束（缩进少一级的 };）
      let end = i + 1
      while (end < lines.length && !/^\t\t\t\};$/.test(lines[end])) end += 1
      const block = lines.slice(i + 1, end)
      const bundleLine = block.find((l) => /PRODUCT_BUNDLE_IDENTIFIER = /.test(l))
      const bundleId = bundleLine?.match(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;/)?.[1]
      if (bundleId && PROFILES[bundleId]) {
        const kept = block.filter((l) => !MANAGED_KEYS.some((re) => re.test(l)))
        out.push(line, ...kept, ...settingsFor(bundleId))
        patchedTargets += 1
        i = end
        continue
      }
      // 无关块：原样保留
      out.push(...lines.slice(i, end))
      i = end
      continue
    }
    out.push(line)
    i += 1
  }
  writeFileSync(p, out.join('\n'), 'utf8')
}

if (patchedTargets === 0) {
  console.error('[patch-ios-signing] 未找到任何可打补丁的 target（工程结构可能变了）')
  process.exit(1)
}
console.log(`[patch-ios-signing] 已改为手动签名（${patchedTargets} 个构建设置块，team ${TEAM_ID}）`)
