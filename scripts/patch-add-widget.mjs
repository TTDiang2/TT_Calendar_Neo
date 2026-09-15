#!/usr/bin/env node
/**
 * patch-add-widget.mjs — 在 `tauri ios init` 生成的 Xcode 工程里注入
 * WidgetKit extension target（主屏小组件 TTWidget）。
 *
 * 做什么：
 *  1. 把 apps/mobile/widget/ 的 Swift/Info.plist/entitlements 拷进 gen/apple/TTWidget/
 *  2. 给 project.pbxproj 注入 TTWidget target（com.apple.product-type.app-extension）
 *     + Sources/Frameworks phase + 「Embed Foundation Extensions」phase（挂到主
 *     App target，产物进 Payload/*.app/PlugIns/）+ debug/release 双配置
 *  3. 给主 App 的 entitlements 文件追加 App Group（幂等）
 *
 * 幂等：pbxproj 里已有 TTWidget 标记时跳过 pbxproj 注入；entitlements 已含
 * App Group 时跳过追加。在 tauri ios init 之后、xcodebuild 之前运行。
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const widgetSrc = join(repoRoot, 'apps', 'mobile', 'widget')
const genApple = process.argv[2] ?? join(repoRoot, 'apps', 'mobile', 'src-tauri', 'gen', 'apple')

// ── 定位 .xcodeproj ──
const entries = existsSync(genApple) ? readdirSync(genApple) : []
const projDir = entries.find((d) => d.endsWith('.xcodeproj'))
if (!projDir) {
  console.error(`[widget] 找不到 .xcodeproj（${genApple}），跳过注入`)
  process.exit(1)
}
const projPath = join(genApple, projDir, 'project.pbxproj')

// 确定性对象 ID：**必须恰好 24 个十六进制字符**（0-9A-F）。
// 早先用 'TT0WIDGET...' 前缀（含 T/W/G 非十六进制字符、且长 27 位）会导致
// xcodebuild 解析 pbxproj 失败（CI 表现：xcodebuild -list 退 74，被 set -e 掐断）。
const ID_SEQ = ['01','02','03','04','05','06','07','08','09','0A','0B','0C','0D','0E','0F','10']
const ID_PREFIX = 'FEED' + '0'.repeat(18) // 4 + 18 = 22 位
const idAt = (n) => ID_PREFIX + ID_SEQ[n]
const ids = {
  widgetTarget: idAt(0),
  widgetConfigList: idAt(1),
  widgetCfgDebug: idAt(2),
  widgetCfgRelease: idAt(3),
  widgetSourcesPhase: idAt(4),
  widgetFrameworksPhase: idAt(5),
  widgetSwiftFileRef: idAt(6),
  widgetSwiftBuildFile: idAt(7),
  widgetPlistFileRef: idAt(8),
  widgetEntFileRef: idAt(9),
  widgetGroup: idAt(10),
  widgetProductRef: idAt(11),
  widgetProductBuildFile: idAt(12),
  embedPhase: idAt(13),
  containerProxy: idAt(15),
  targetDependency: ID_PREFIX + '11',
}
let pbx = readFileSync(projPath, 'utf8')

// plist 值格式化。
// ⚠️ pbxproj（OpenStep plist）里**含空格的值必须加引号**：早先把
// `iPhone Developer` 裸写导致解析器读到 "iPhone" 就等分号 →
// "missing semicolon in dictionary" → 整个工程被判损坏（CI 实测第 552 行）。
// 规则收紧：只有纯标识符（字母/下划线开头 + 词字符）才裸写，其余一律
// JSON 引号化（路径、$(VAR)、1,2、带空格的值、-Onone 全走引号）。
const fmtValue = (v) => {
  if (Array.isArray(v)) {
    if (v.length === 0) return '()'
    const items = v.map((x) => `\t\t\t\t\t${fmtValue(x)},`).join('\n')
    return `(\n${items}\n\t\t\t\t)`
  }
  if (typeof v === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) return v
  return JSON.stringify(v)
}
// 收集所有由本脚本生成的 build setting 行，供 validateInjected 精准自检
// （只查自己写的行，避免对 Xcode 原生语法——如行尾注释、内联 dict——误报）
const generatedSettingLines = []
const fmtSettings = (settings) =>
  Object.entries(settings)
    .map(([k, v]) => {
      const line = `\t\t\t\t${k} = ${fmtValue(v)};`
      generatedSettingLines.push(line)
      return line
    })
    .join('\n')

if (pbx.includes('/* TTWidget */')) {
  console.log('[widget] project.pbxproj 已注入过，跳过（幂等）')
} else {
  // ── 拷贝小组件源文件进工程目录 ──
  const widgetDir = join(genApple, 'TTWidget')
  mkdirSync(widgetDir, { recursive: true })
  for (const f of ['TTCalendarWidget.swift', 'Info.plist', 'Widget.entitlements']) {
    copyFileSync(join(widgetSrc, f), join(widgetDir, f))
  }
  console.log('[widget] 源文件已拷贝 ->', widgetDir)


  // 1) PBXBuildFile
  const buildFileEntries = `
		${ids.widgetSwiftBuildFile} /* TTCalendarWidget.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ids.widgetSwiftFileRef} /* TTCalendarWidget.swift */; };
		${ids.widgetProductBuildFile} /* TTWidget.appex in Embed Foundation Extensions */ = {isa = PBXBuildFile; fileRef = ${ids.widgetProductRef} /* TTWidget.appex */; settings = {ATTRIBUTES = (CodeSignOnCopy, RemoveHeadersOnCopy, ); }; };`
  pbx = pbx.replace('/* End PBXBuildFile section */', `${buildFileEntries}\n/* End PBXBuildFile section */`)

  // 2) PBXFileReference
  const fileRefEntries = `
		${ids.widgetSwiftFileRef} /* TTCalendarWidget.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = TTCalendarWidget.swift; sourceTree = "<group>"; };
		${ids.widgetPlistFileRef} /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };
		${ids.widgetEntFileRef} /* Widget.entitlements */ = {isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = Widget.entitlements; sourceTree = "<group>"; };
		${ids.widgetProductRef} /* TTWidget.appex */ = {isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; includeInIndex = 0; path = TTWidget.appex; sourceTree = BUILT_PRODUCTS_DIR; };`
  pbx = pbx.replace('/* End PBXFileReference section */', `${fileRefEntries}\n/* End PBXFileReference section */`)

  // 3) PBXCopyFilesBuildPhase（Embed Foundation Extensions，dst=PlugIns）
  const embedSection = `
/* Begin PBXCopyFilesBuildPhase section */
		${ids.embedPhase} /* Embed Foundation Extensions */ = {
			isa = PBXCopyFilesBuildPhase;
			buildActionMask = 2147483647;
			dstPath = "";
			dstSubfolderSpec = 13;
			files = (
				${ids.widgetProductBuildFile} /* TTWidget.appex in Embed Foundation Extensions */,
			);
			name = "Embed Foundation Extensions";
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXCopyFilesBuildPhase section */
`
  pbx = pbx.replace('/* Begin PBXFileReference section */', `${embedSection}\n/* Begin PBXFileReference section */`)

  // 4) PBXGroup：TTWidget 组 + 挂进 mainGroup / Products
  const widgetGroup = `
		${ids.widgetGroup} /* TTWidget */ = {
			isa = PBXGroup;
			children = (
				${ids.widgetSwiftFileRef} /* TTCalendarWidget.swift */,
				${ids.widgetPlistFileRef} /* Info.plist */,
				${ids.widgetEntFileRef} /* Widget.entitlements */,
			);
			path = TTWidget;
			sourceTree = "<group>";
		};`
  pbx = pbx.replace('/* End PBXGroup section */', `${widgetGroup}\n/* End PBXGroup section */`)
  pbx = pbx.replace(
    '\t\t\t\tB484EA2FFA959FC3293E6477 /* Products */,\n',
    '\t\t\t\tB484EA2FFA959FC3293E6477 /* Products */,\n\t\t\t\t' +
      ids.widgetGroup +
      ' /* TTWidget */,\n',
  )
  pbx = pbx.replace(
    '\t\t\t\t8605B698ED4B432C4DB3738F /* tt-calendar-mobile_iOS.app */,\n',
    '\t\t\t\t8605B698ED4B432C4DB3738F /* tt-calendar-mobile_iOS.app */,\n\t\t\t\t' +
      ids.widgetProductRef +
      ' /* TTWidget.appex */,\n',
  )

  // 5) PBXNativeTarget
  const nativeTarget = `
		${ids.widgetTarget} /* TTWidget */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = ${ids.widgetConfigList} /* Build configuration list for PBXNativeTarget "TTWidget" */;
			buildPhases = (
				${ids.widgetSourcesPhase} /* Sources */,
				${ids.widgetFrameworksPhase} /* Frameworks */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = TTWidget;
			packageProductDependencies = (
			);
			productName = TTWidget;
			productReference = ${ids.widgetProductRef} /* TTWidget.appex */;
			productType = "com.apple.product-type.app-extension";
		};
/* End PBXNativeTarget section */`
  pbx = pbx.replace('/* End PBXNativeTarget section */', `${nativeTarget}\n`)

  // 6) PBXProject：targets 列表 + TargetAttributes
  pbx = pbx.replace(
    '\t\t\t\t8502366358141A1CA3C565AC /* tt-calendar-mobile_iOS */,\n',
    '\t\t\t\t8502366358141A1CA3C565AC /* tt-calendar-mobile_iOS */,\n\t\t\t\t' +
      ids.widgetTarget +
      ' /* TTWidget */,\n',
  )
  pbx = pbx.replace(
    '\t\t\t\tTargetAttributes = {\n',
    [
      '\t\t\t\tTargetAttributes = {',
      `\t\t\t\t\t${ids.widgetTarget} = {`,
      '\t\t\t\t\t\tCreatedOnToolsByXcodePro = WidgetKit;',
      '\t\t\t\t\t\tSystemCapabilities = {',
      '\t\t\t\t\t\t\tcom.apple.ApplicationGroups.iOS = {',
      '\t\t\t\t\t\t\t\tenabled = 1;',
      '\t\t\t\t\t\t\t};',
      '\t\t\t\t\t\t};',
      '\t\t\t\t\t};',
    ].join('\n'),
  )

  // 6.5) 主 App target 的 buildPhases 末尾挂 Embed phase（Frameworks 之后）
  pbx = pbx.replace(
    '\t\t\t\tA4570ACABEF261ED099DB689 /* Frameworks */,\n',
    '\t\t\t\tA4570ACABEF261ED099DB689 /* Frameworks */,\n\t\t\t\t' +
      ids.embedPhase +
      ' /* Embed Foundation Extensions */,\n',
  )

  // 6.6) 关键：target 依赖（app → widget）。
  // 嵌入 appex 不会产生「隐式依赖」（隐式依赖只来自链接），scheme 的
  // BuildAction 又只列了主 App target——没有这条显式依赖，xcodebuild 不会
  // 编译 widget，Embed phase 会拿不到产物。
  const projectObjectId = (pbx.match(/rootObject = (\w+) \/\* Project object \*\//) ?? [])[1]
  if (!projectObjectId) {
    console.error('[widget] 无法解析 rootObject（Project object ID），target 依赖注入失败')
    process.exit(1)
  }
  const containerProxySection = `
/* Begin PBXContainerItemProxy section */
		${ids.containerProxy} /* PBXContainerItemProxy */ = {
			isa = PBXContainerItemProxy;
			containerPortal = ${projectObjectId} /* Project object */;
			proxyType = 1;
			remoteGlobalIDString = ${ids.widgetTarget};
			remoteInfo = TTWidget;
		};
/* End PBXContainerItemProxy section */
`
  pbx = pbx.replace('/* Begin PBXCopyFilesBuildPhase section */', `${containerProxySection}\n/* Begin PBXCopyFilesBuildPhase section */`)

  const targetDependencySection = `
/* Begin PBXTargetDependency section */
		${ids.targetDependency} /* PBXTargetDependency */ = {
			isa = PBXTargetDependency;
			target = ${ids.widgetTarget} /* TTWidget */;
			targetProxy = ${ids.containerProxy} /* PBXContainerItemProxy */;
		};
/* End PBXTargetDependency section */
`
  pbx = pbx.replace('/* Begin PBXFrameworksBuildPhase section */', `${targetDependencySection}\n/* Begin PBXFrameworksBuildPhase section */`)

  // 挂到主 App target 的 dependencies。文件里第一处 `dependencies = (` 属于主 App
  // target（widget target 追加在 PBXNativeTarget 段末尾），且此处替换不带 /g
  // 只改第一处，故锚点稳定（早先按 target 行 3 个 tab 缩进匹配是错的——实际 2 个 tab）。
  const depsAnchor = '\n\t\t\tdependencies = (\n\t\t\t);'
  if (!pbx.includes(depsAnchor)) {
    console.error('[widget] 未找到主 App 的 dependencies 锚点，target 依赖未注入')
    process.exit(1)
  }
  pbx = pbx.replace(
    depsAnchor,
    `\n\t\t\tdependencies = (\n\t\t\t\t${ids.targetDependency} /* PBXTargetDependency */,\n\t\t\t);`,
  )

  // 7) widget 的 Sources / Frameworks build phase
  const phasesSection = `
/* Begin TTWidget build phases（patch-add-widget.mjs 注入） */
		${ids.widgetSourcesPhase} /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				${ids.widgetSwiftBuildFile} /* TTCalendarWidget.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
		${ids.widgetFrameworksPhase} /* Frameworks */ = {
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End TTWidget build phases */
`
  pbx = pbx.replace('/* Begin PBXProject section */', `${phasesSection}\n/* Begin PBXProject section */`)

  // 8) XCBuildConfiguration（debug/release，自包含设置）
  const baseSettings = {
    ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES: 'YES',
    ARCHS: ['arm64'],
    CODE_SIGN_ENTITLEMENTS: 'TTWidget/Widget.entitlements',
    CODE_SIGN_IDENTITY: 'iPhone Developer',
    CURRENT_PROJECT_VERSION: '1',
    INFOPLIST_FILE: 'TTWidget/Info.plist',
    IPHONEOS_DEPLOYMENT_TARGET: '15.0',
    LD_RUNPATH_SEARCH_PATHS: ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks'],
    MARKETING_VERSION: '1.0',
    PRODUCT_BUNDLE_IDENTIFIER: 'com.tt.calendar.mobile.widget',
    PRODUCT_NAME: '$(TARGET_NAME)',
    SDKROOT: 'iphoneos',
    SWIFT_VERSION: '5.0',
    TARGETED_DEVICE_FAMILY: '1,2',
    VALID_ARCHS: 'arm64',
    WRAPPER_EXTENSION: 'appex',
  }
  const debugSettings = {
    ...baseSettings,
    GCC_OPTIMIZATION_LEVEL: '0',
    SWIFT_ACTIVE_COMPILATION_CONDITIONS: 'DEBUG',
    SWIFT_OPTIMIZATION_LEVEL: '-Onone',
  }
  const debugCfg = `
		${ids.widgetCfgDebug} /* debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
${fmtSettings(debugSettings)}
			};
			name = debug;
		};`
  const releaseCfg = `
		${ids.widgetCfgRelease} /* release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
${fmtSettings(baseSettings)}
			};
			name = release;
		};`
  pbx = pbx.replace('/* End XCBuildConfiguration section */', `${debugCfg}\n${releaseCfg}\n/* End XCBuildConfiguration section */`)

  // 9) XCConfigurationList（widget target）
  const configList = `
		${ids.widgetConfigList} /* Build configuration list for PBXNativeTarget "TTWidget" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				${ids.widgetCfgDebug} /* debug */,
				${ids.widgetCfgRelease} /* release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = release;
		};
`
  pbx = pbx.replace('/* End XCConfigurationList section */', `${configList}/* End XCConfigurationList section */`)

  writeFileSync(projPath, pbx)
  validateInjected(pbx)
  console.log('[widget] project.pbxproj 注入完成：TTWidget target（app-extension）+ Embed PlugIns phase + target 依赖')
}

/**
 * 自检注入结果：OpenStep plist 里**未加引号的值不能含空格/逗号**，否则解析器
 * 会说 "missing semicolon in dictionary" 并把整个工程判为损坏（2026-09-15 CI
 * 实测：CODE_SIGN_IDENTITY = iPhone Developer 缺引号，第 552 行）。Windows 上
 * 没有 xcodebuild 可提前发现，故在脚本里兜一道。
 */
function validateInjected(text) {
  const problems = []
  for (const raw of generatedSettingLines) {
    // 多行数组值（ARCHS/LD_RUNPATH_SEARCH_PATHS）逐项都由 fmtValue 加引号，
    // 结构固定，跳过单行检查即可
    if (raw.includes('\n')) continue
    const m = /^\s*([A-Za-z_][\w.[\]]*)\s+= (.+);$/.exec(raw)
    if (!m) {
      problems.push(`行格式异常 -> ${raw.trim()}`)
      continue
    }
    const value = m[2]
    const isQuoted = value.startsWith('"') && value.endsWith('"')
    const isVar = value.startsWith('$(')
    const isContainer = value.startsWith('(') || value.startsWith('{')
    if (!isQuoted && !isVar && !isContainer && /[\s,]/.test(value)) {
      problems.push(`未加引号的值含空格/逗号 -> ${raw.trim()}`)
    }
  }
  if (problems.length > 0) {
    console.error('[widget] ✗ pbxproj 自检失败（会致工程被判损坏）：')
    for (const pr of problems.slice(0, 5)) console.error('   ', pr)
    process.exit(1)
  }
  const braces = (text.match(/\{/g) ?? []).length - (text.match(/\}/g) ?? []).length
  const parens = (text.match(/\(/g) ?? []).length - (text.match(/\)/g) ?? []).length
  if (braces !== 0 || parens !== 0) {
    console.error(`[widget] ✗ pbxproj 括号不配平：braces=${braces} parens=${parens}`)
    process.exit(1)
  }

  // 悬空引用检查（2026-09-15 真实翻车点）：pbxproj 里被引用的对象 ID 必须在
  // 定义段出现过，否则 Xcode **静默忽略**该引用——当时嵌入阶段写错了一个 ID，
  // 结果 appex 既不报错也没被拷进 PlugIns，排查代价很高。
  const defined = new Set()
  for (const m of text.matchAll(/\n\t\t([0-9A-F]{24}) \/\* [\s\S]*?\*\/ = \{/g)) defined.add(m[1])
  for (const m of text.matchAll(/\n\t\t([0-9A-F]{24}) \/\* [\s\S]*?\*\/ = \{isa = /g)) defined.add(m[1])
  const referenced = new Set()
  for (const m of text.matchAll(/fileRef = ([0-9A-F]{24})/g)) referenced.add(m[1])
  for (const m of text.matchAll(/^\t\t\t\t([0-9A-F]{24}) \/\*[^\n]*\*\/,$/gm)) referenced.add(m[1])
  const dangling = [...referenced].filter((id) => !defined.has(id))
  if (dangling.length > 0) {
    console.error('[widget] ✗ pbxproj 存在悬空引用（Xcode 会静默忽略）：', dangling.join(', '))
    process.exit(1)
  }
  console.log(
    `[widget] pbxproj 自检通过（${generatedSettingLines.length} 条设置行引号合规 + 括号配平 + ${referenced.size} 处引用无悬空）`,
  )
}

// 11) scheme 补丁：把 widget 加进 BuildActionEntries。
// xcodebuild 用 scheme 构建，scheme 默认只列主 App target；虽然 target 依赖已能
// 让构建系统先编 widget，但显式列进 scheme 与「Xcode 里手动加小组件」的行为一致，
// 更稳（也便于在 Xcode 里直接 Run widget 调试）。
{
  const schemeDir = join(genApple, projDir, 'xcshareddata', 'xcschemes')
  if (existsSync(schemeDir)) {
    for (const f of readdirSync(schemeDir)) {
      if (!f.endsWith('.xcscheme')) continue
      const schemePath = join(schemeDir, f)
      let scheme = readFileSync(schemePath, 'utf8')
      if (scheme.includes('TTWidget.appex')) continue // 幂等
      const entry = `         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "${ids.widgetTarget}"
               BuildableName = "TTWidget.appex"
               BlueprintName = "TTWidget"
               ReferencedContainer = "container:${projDir}">
            </BuildableReference>
         </BuildActionEntry>
`
      scheme = scheme.replace('      </BuildActionEntries>', entry + '      </BuildActionEntries>')
      writeFileSync(schemePath, scheme)
      console.log('[widget] scheme 已追加 widget BuildActionEntry：', f)
    }
  } else {
    console.warn('[widget] 未找到 xcschemes 目录：', schemeDir)
  }
}

// 10) 主 App entitlements 追加 App Group（幂等；兼容 <dict/> 自闭合与 CRLF）
const APP_GROUP_KEY = 'com.apple.security.application-groups'
const appGroupPlistFragment =
  '\t<key>' + APP_GROUP_KEY + '</key>\n\t<array>\n\t\t<string>group.com.tt.calendar.mobile</string>\n\t</array>\n'
const appEnt = join(genApple, 'tt-calendar-mobile_iOS', 'tt-calendar-mobile_iOS.entitlements')
if (existsSync(appEnt)) {
  let ent = readFileSync(appEnt, 'utf8')
  if (ent.includes(APP_GROUP_KEY)) {
    console.log('[widget] 主 App entitlements 已含 App Group，跳过')
  } else if (ent.includes('<dict/>')) {
    ent = ent.replace('<dict/>', '<dict>\n' + appGroupPlistFragment + '</dict>')
    writeFileSync(appEnt, ent)
    console.log('[widget] 主 App entitlements 已追加 App Group（自闭合 dict）')
  } else if (/<\/dict>\s*<\/plist>/.test(ent)) {
    ent = ent.replace(/<\/dict>(\s*)<\/plist>/, appGroupPlistFragment + '</dict>\n</plist>')
    writeFileSync(appEnt, ent)
    console.log('[widget] 主 App entitlements 已追加 App Group')
  } else {
    console.warn('[widget] entitlements 格式无法识别，未追加 App Group')
  }
} else {
  console.warn('[widget] 未找到主 App entitlements：', appEnt)
}
