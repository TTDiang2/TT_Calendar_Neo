# TT Calendar · iOS 打包实战指南

> 目标：在「自己只有 Windows」的前提下，为 iPhone 产出一个能装的 App（.ipa / 模拟器 .app）。
> 本文件记录：架构、现有 CI、**我们踩过的所有坑与根因**、以及两条可行路线（云端 CI / 借·租一台 Mac 一键跑）。

状态日期：2026-09-13（✅ CI 出包，产物已二进制级验证为生产模式；真机装机复验待完成）

---

## 0. 一句话结论

> **【2026-09-13 更新】修复 CI 出包的「dev 模式白屏」根因。** 2026-09-11 装到 iPhone 的包白屏，报
> `Failed to request http://localhost:5175/ ... local network permissions`。根因不是权限声明，
> 而是 **CI 编译 Rust lib 时没带 `tauri/custom-protocol` feature**：tauri 的 build.rs 以
> `dev = !custom_protocol` 决定运行时形态（与 cargo profile 无关），缺了它 App 就运行在
> dev 模式——把 tauri:// 的资源请求代理到 devUrl（手机上当然连不通）。修复（双保险 + 守门）：
> 1. `apps/mobile/src-tauri/Cargo.toml` 的 `[features]` 把 `custom-protocol` 放进 `default`
>    （`tauri dev/ios dev` 会自动 `--no-default-features` 排除，不影响本地开发；
>    但手工 `cargo check/test` 现在默认要 `../dist` 存在，先 `pnpm --filter @tt-calendar/mobile build`）；
> 2. `scripts/ci-ios-options-server` 返回该 feature（等价官方 `tauri ios build` 的 build_options 注入）；
> 3. 新增 `scripts/verify-ios-build.mjs`：CI 打包前验证产物（无 dev 标记 + 前端资源[含 wasm]已内嵌 + plist 键齐全）。
> 另：productName 从 `TT 日历` 改为 `TTCalendar`（中文名 + 空格会在签名/侧载环节添乱）；
> Info.plist 补丁（`scripts/patch-ios-plist.mjs`）增加 `NSLocalNetworkUsageDescription`；
> `minimumSystemVersion` 提到 **iOS 15.0**（前端用了 `type:'module'` worker，Safari 15 才支持）；
> `main.tsx` 的 `boot()` 增加错误上屏（本地库起不再显示堆栈，不再无限停在启动文案）。
> 装机方式：**iLoader + SideStore**（用户实测），或 Sideloadly（见 `scripts/ios-install-guide.md`）。
> ⚠️ 待办：新包已验证为生产模式，但 **尚未在真机上完成「启动 + 写数据 + 重启数据还在」的复验**；
> 另若将来给 Secrets 配 `VITE_API_BASE`，必须用 **https**（`tauri://` 页面里 fetch http 会被
> WebKit 当混合内容拦截，ATS 放行管不了这个）。
>
> **【2026-09-04 更新】纯 GitHub Actions CI 已经打通！** 上一版「只能借 Mac」的结论已被推翻：通过「jsonrpsee 假 options 服务」绕过了 tauri-cli 的 server-addr panic，CI 全绿（run 33841117021，6 分 43 秒），自动产出真机未签名 .ipa + 模拟器包两个 artifact（见 GitHub Actions 页面下载）。**现在拿包 = 打开 Actions 页 → 最新绿色 run → 下载 artifact**，全程不需要 Mac。
>
> ~~以下为 2026-09-03 的旧结论，保留作历史记录~~ 要拿到真机可装的 iOS App，最可靠、最省事的路径是：借/租一台 Mac（或云 Mac），跑仓库里现成的傻瓜化脚本 `scripts/mac/ios-build.sh`，一次点击出包。 纯 Windows + GitHub Actions 云端 CI 出 iOS 包这条路，被 Tauri 工具链自身在「无头 CI + 无开发者证书」下的多个问题卡住（详见 §4），不是你的代码问题，反复改 CI 性价比很低。

---

## 1. 工程与 iOS 的关系（先看懂再动手）

```
packages/ui   ← 全部界面（日历/待办/倒数日 + 移动端竖屏排版），三端共用，与 iOS 无关
apps/mobile   ← 移动端壳 = Tauri 2（iOS + Android 原生壳），UI 来自上面的 package
  └ src-tauri   ← Rust 壳（目前是"最薄壳"，数据走 HTTP 连回 PC 数据服务）
  └ src-tauri/gen/apple ← Xcode 工程（由 tauri ios init 生成，.gitignore 排除，不入库）
```

关键认知：
- **iOS App = Tauri 2 原生壳 + WKWebView 里加载上面的 React UI**。所以 UI 全都照常工作，iOS 打包只关心「把壳 + UI 包成 .app/.ipa」。
- 数据默认在手机本地（Worker 里的 sql.js + IndexedDB 快照，离线可用）；若仓库配了 Secrets 的 `VITE_API_BASE`，则改为 HTTP 连电脑数据服务（穿透/局域网）。
- bundle id：`com.tt.calendar.mobile`；productName：`TTCalendar`（2026-09-13 起全 ASCII，此前是 `TT 日历`，中文+空格在签名/侧载工具链上易出问题）。

---

## 2. 三种 iOS 产物 & 谁需要哪种

| 产物 | 是什么 | 要不要 Mac / 签名 | 用途 |
|---|---|---|---|
| **模拟器 .app** | 跑在 iOS 模拟器 | 要 Mac，无需真机签名 | 界面上看效果；可传 Appetize.io 在浏览器里跑 |
| **真机 .ipa（未签名）** | 真机装，**Sideloadly 免费自签**（7 天续） | 要 Mac 出包，**无需你的开发者证书** | 自己/朋友 iPhone 上装，日常用 |
| **真机 .ipa（签名/TestFlight）** | 真机装，1 年有效，可分发给 100 台 beta | 要 Mac + **$99 开发者账号** | 上架 App Store / 正式分发 |

**你现在要的是第 2 种（未签名真机 .ipa）**——Sideloadly 免费签自己 Apple ID，7 天重装续期。

---

## 3. 两条路线的取舍

### 路线 A：云端 CI（GitHub Actions）—— ✅ 2026-09-04 已打通，现在是首选
仓库有 `.github/workflows/ios-build.yml`，`push 到 main` 即自动触发，含两个 job：
- `模拟器包`（macos-15）
- `真机包`（未签名）

**我们实测的结果**（2026-09-03，多轮）：
1. macos-14 的 Xcode 15.4 **打不开** tauri 2.11 生成的 Xcode 16 格式工程（objectVersion 77）→ 换 macos-15（Xcode 16）解决。
2. 真机构建 `Build Rust Code` 阶段调 `tauri ios xcode-script` → `panicked: failed to read missing addr file ...server-addr`。**这是 tauri CLI 的已知 bug**（GitHub issue #6077 / #10925 / #13547），跨版本存在，不是我们的代码问题。
3. 模拟器构建崩在 `pnpm install` → `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`。同样指向 tauri 在**无 TTY 的 CI** 里跑包管理器的兼容问题。
4. 无开发者证书时，`tauri ios build` 出**签名**真机包也没有干净通道。

**结论（2026-09-04 终局）**：上述 4 个坑后来全部绕过——1/3/4 的根因和方案见 workflow 文件尾注释；第 2 条 server-addr panic 用 **`scripts/ci-ios-options-server`（与 tauri-cli 同版本 jsonrpsee 写的假 options WebSocket 服务）** 解决：xcode-script 无条件要连 options RPC，我们就在 xcodebuild 前把假服务起好、把地址写进它要读的 server-addr 文件，它就能正常走完 Rust 编译。CI 现在全自动出真机未签名 .ipa（可执行 ~7.4M）+ 模拟器包，6-7 分钟一次。

<details><summary>2026-09-03 旧结论（已被推翻，留档）</summary>

这些都不是代码问题，而是 Tauri iOS 工具链在「GitHub 无头 runner + 无开发者证书」环境下的固有问题。要继续得降级/改 tauri、或引入证书，投入大、不保证收敛。如果你坚持走 CI，模拟器包可当「浏览器预览」，真机包仍建议绕回 Mac。

</details>

### 路线 B：借/租一台 Mac 跑傻瓜化脚本 —— 推荐 ⭐
- **为什么 Mac 能解决**：本机是**交互式终端（有 TTY）**，规避了 `ERR_PNPM_..._NO_TTY`；`tauri ios build` 在真实 Mac 上是官方测试路径（不是 CI 那种边角场景）；Xcode 版本匹配。
- **谁能提供 Mac**：你自己有 Mac？找朋友借一台（跑一次约 10–30 分钟，见 §7 的清理脚本可擦干净）？租云 Mac（如 MacStadium / AWS EC2 Mac / 国产云苹果）？
- **怎么跑**：见 §5，一键脚本，傻瓜化，报错自动留日志。

---

## 4. 踩坑全记录（含根因，留给以后的你 / 朋友排障）

### 4.1 Xcode 工程格式 77 打不开（已解决）
- 报错：`xcodebuild: error: The project cannot be opened because it is in a future Xcode project file format (77).`
- 原因：tauri CLI（当前锁 **2.11.4**）用 XcodeGen 生成 **Xcode 16** 格式工程；而 GitHub `macos-14` runner 默认 Xcode **15.4**。
- 处理：runner 换 `macos-15`（默认 Xcode 16）。本机 Mac 若 Xcode ≥16 同样没这问题。
- 关联 tauri 2.11.0 修复：`Fix iOS build failure ... using explicit XcodeDefault.xctoolchain`——说明 iOS 构建在近期版本仍在修，别锁太老的。

### 4.2 `tauri ios xcode-script` 读不到 server-addr（核心）
- 报错：`thread panicked ... failed to read missing addr file /tmp/{bundleid}-server-addr`
- 原因：xcode-script 是给 **Xcode 内 dev** 用的桥，会尝试连 dev server 读一个临时 addr 文件；**没有先起 dev 就没有该文件**。它是 tauri 的已知痛点（#6077/#10925/#13547），在 release 构建被误触发也会崩。
- 我们的错误尝试：绕过 tauri 直接 `xcodebuild` 触发这个 phase → 必崩。**教训：别绕开 `tauri ios build` 手搓 xcodebuild**，那是把 dev 逻辑一起拖进来。
- 正道：用官方 `tauri ios build`（它走 cargo-mobile2 编排，dev/build 分开）。本机 Mac 交互式跑尤其稳。

### 4.3 pnpm 无 TTY（CI 特有）
- 报错：`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`
- 原因：tauri 的 mobile 脚本在**无 TTY** 环境触发 pnpm 想清理/重装模块目录 → 中止。GitHub Actions 里常见。
- 处理：本机（有 TTY）不受影响；CI 里较难干净绕过。属"别在无头 CI 较真 iOS"的又一佐证。

### 4.4 误产出 296 字节空 .ipa（我们的脚本 bug，已修）
- 现象：脚本 `xcodebuild ... | tail` **吞掉了 xcodebuild 的真实退出码** → 明明 BUILD FAILED 却继续 find，找到 Xcode 建了但没填二进制的空 `.app` 目录 → 打出 296B 空包。
- 教训（写进所有未来脚本）：**别用 `cmd | tail` 吞退出码**；要 `set -euo pipefail` 或把输出写文件再取 `$?`；打 .ipa 前**校验 .app 里有可执行文件**。

---

## 5. 傻瓜化打包：借/租 Mac 后怎么跑

> 前提：那台 Mac 有网络、能 `git clone` 本仓库、装了 Xcode（≥16，App Store 装或 `xcode-select --install` 的完整版）。
> 你没 Mac 证书也没关系——脚本出**未签名**包，你在 Windows 用 Sideloadly 自签。

### 5.1 一条命令跑完（推荐）
在 Mac 的终端里，进入仓库目录后：

```bash
bash scripts/mac/ios-build.sh
```

脚本会依次：检查环境 → `pnpm install` → `pnpm tauri ios build` → 定位真机 `.app` → 校验非空 → 打成 `Payload/` 结构的 `.ipa`。**所有输出同时写进 `artifacts/ios-build-<时间>.log`**，失败会给出错误摘要与下一步。

产物：`apps/mobile/tt-calendar-unsigned.ipa`（或脚本打印的路径）。

### 5.2 拿到 .ipa 后，回到 Windows 装机（Sideloadly，免费）
见 `scripts/ios-install-guide.md`，要点：
1. 下载 Sideloadly（sideloadly.io）→ 手机 USB 连电脑；
2. Apple ID 登录，把 `.ipa` 拖进，点 Start；
3. iPhone 上「设置 → 通用 → VPN 与设备管理」信任你的 Apple ID；
4. **7 天重签**：到期重新 Start 一次即可（数据不丢）。

### 5.3 出错怎么排查
- 先看 `artifacts/ios-build-*.log` 尾部（脚本已把关键错误摘要也打出来了）；
- 常见：
  - `Xcode command line tools` 报错 → 装完整 Xcode；
  - `format (77)` / `future Xcode` → 升级 Xcode 到 16+；
  - 卡 `pnpm install` → 检查网络；
  - 真机 .app 找不到 → 截图日志发给我。

---

## 6. 借用 Mac 后的清理（把人家机器擦干净）

跑完 iOS 构建，Mac 上会留下：依赖、`.git` 工作区、`src-tauri/gen/apple`（Xcode 工程）、Rust `target/` 编译缓存、`~/.cargo` 装的 iOS target、Homebrew 装的 `xcodegen`、Xcode `DerivedData`。

**用仓库里现成的清理脚本**（在仓库目录内跑）：
```bash
bash scripts/mac/ios-cleanup.sh
```
它会删掉以上所有本项目相关残留，但**不碰** Mac 上别的东西、**不卸载 Xcode**。跑完可把整个仓库目录删掉，机器基本恢复原样。

> 想更彻底（可选、非必须）：脚本末尾会提示如何 `brew uninstall xcodegen`、`rustup target remove ...`，你自己确认后执行即可。Xcode 本体不用动。

---

## 7. 归档的云/租 Mac 参考（还没用到，先记下）
- 若以后想自己买/租而不打扰朋友：AWS EC2 macOS、MacStadium、以及国内一些「云 Mac/苹果 CI」服务可按需起一台，装好 Xcode 后跑同样的 `ios-build.sh`，用完 `ios-cleanup.sh` + 释放实例。
- 真要上架 App Store，再补 $99 开发者账号 + 签名 job（见 `.github/workflows/ios-build.yml` 末尾注释），仍建议在 Mac 上跑签名导出。

---

## 8. 相关文件速查
| 文件 | 作用 |
|---|---|
| `.github/workflows/ios-build.yml` | 云端 CI（模拟器包可用；真机包受 tauri CI 问题限制） |
| `scripts/mac/ios-build.sh` | **Mac 一键出未签名真机 .ipa（推荐走这条）** |
| `scripts/mac/ios-cleanup.sh` | 借 Mac 用完的清理脚本 |
| `scripts/ios-install-guide.md` | iLoader/SideStore/Sideloadly 免费装机说明 |
| `scripts/patch-ios-plist.mjs` | CI/本机构建后注入 Info.plist 权限键（ATS 放行 http + 本地网络描述） |
| `scripts/verify-ios-build.mjs` | CI 打包前验证产物为生产模式（无 dev 标记 / 资源内嵌 / plist 键） |
