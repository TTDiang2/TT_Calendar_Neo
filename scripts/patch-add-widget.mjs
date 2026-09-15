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
let pbx = readFileSync(projPath, 'utf8')

// plist 值格式化：数组 → ( item, ... )；含空格/逗号等特殊字符的字符串加引号
const fmtValue = (v) => {
  if (Array.isArray(v)) {
    if (v.length === 0) return '()'
    const items = v.map((x) => `\t\t\t\t\t${fmtValue(x)},`).join('\n')
    return `(\n${items}\n\t\t\t\t)`
  }
  if (typeof v === 'string' && /^[\w.$+\-/ @]+$/.test(v)) return v
  return JSON.stringify(v)
}
const fmtSettings = (settings) =>
  Object.entries(settings)
    .map(([k, v]) => `\t\t\t\t${k} = ${fmtValue(v)};`)
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

  // 确定性对象 ID（24 位十六进制大写）
  const ids = {
    widgetTarget: 'TT0WIDGET00000000000000001A',
    widgetConfigList: 'TT0WIDGET00000000000000002B',
    widgetCfgDebug: 'TT0WIDGET00000000000000003C',
    widgetCfgRelease: 'TT0WIDGET00000000000000004D',
    widgetSourcesPhase: 'TT0WIDGET00000000000000005E',
    widgetFrameworksPhase: 'TT0WIDGET00000000000000006F',
    widgetSwiftFileRef: 'TT0WIDGET000000000000000070',
    widgetSwiftBuildFile: 'TT0WIDGET000000000000000081',
    widgetPlistFileRef: 'TT0WIDGET000000000000000092',
    widgetEntFileRef: 'TT0WIDGET0000000000000000A3',
    widgetGroup: 'TT0WIDGET0000000000000000B4',
    widgetProductRef: 'TT0WIDGET0000000000000000C5',
    widgetProductBuildFile: 'TT0WIDGET0000000000000000D6',
    embedPhase: 'TT0WIDGET0000000000000000E7',
    embedBuildFile: 'TT0WIDGET0000000000000000F8',
  }

  // 1) PBXBuildFile
  const buildFileEntries = `
		${ids.widgetSwiftBuildFile} /* TTCalendarWidget.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ids.widgetSwiftFileRef} /* TTCalendarWidget.swift */; };
		${ids.widgetProductBuildFile} /* TTWidget.appex in Embed Foundation Extensions */ = {isa = PBXBuildFile; fileRef = ${ids.widgetProductRef} /* TTWidget.appex */; settings = {ATTRIBUTES = (RemoveHeadersOnCopy, ); }; };`
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
				${ids.embedBuildFile} /* TTWidget.appex in Embed Foundation Extensions */,
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
    TARGETED_DEVICE_FAMILY: '"1,2"',
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
  console.log('[widget] project.pbxproj 注入完成：TTWidget target（app-extension）+ Embed PlugIns phase')
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
