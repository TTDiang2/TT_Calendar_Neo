# iOS 真机安装说明（iLoader + SideStore，免费）

本工程 CI 产出一个 **ad-hoc 签名**的真机 .ipa（`tt-calendar-ios-unsigned.ipa`，App 名 `TTCalendar`），
用免费 Apple ID 重签后即可装到自己的 iPhone。无需 $99 开发者账号。

> 为什么是 ad-hoc 而不是完全未签名：主屏小组件（WidgetKit extension）带着
> App Group entitlements，未签名的 extension 无法被正确嵌入与加载；ad-hoc 签名
> 让 CI 产物结构完整，侧载工具重签时会把 entitlements 一并替换成你的账号。

> 2026-09-13 之前的旧包有「dev 模式白屏」bug（报 `localhost:5175` / local network），
> 请务必装**最新一次 CI run** 的产物。装完若仍白屏，先确认下载的 run 日期。

## 你需要
- 一台 Windows 电脑 + 一根数据线
- iPhone（**iOS 15+**，前端用了 module worker）、免费 Apple ID
- 免费签名的固有限制：**同一 Apple ID 最多 3 个自签 App，7 天有效期**（到期在 SideStore 里刷新即可，数据不丢）

## 路线 1（推荐，已实测）：iLoader 装 SideStore，再在手机里装 App

[iLoader](https://github.com/nab138/iloader)（官方渠道只有 GitHub 仓库与 **iloader.app**，谨防假站）
是 Windows/macOS/Linux 通用的侧载工具，负责把 [SideStore](https://sidestore.io) 装进手机；
之后装/刷 App 都在手机上完成，不再依赖电脑。

1. **下载 .ipa**：GitHub 仓库 → Actions → iOS build → 最新绿色 run → 底部 Artifacts
   下载 `tt-calendar-ios-unsigned-ipa`，解压得到 `tt-calendar-ios-unsigned.ipa`，想办法传到手机（网盘/文件 App 均可）。
2. **装 SideStore**：iPhone 用数据线连电脑并信任，打开 iLoader → 登录 Apple ID → 安装 SideStore。
3. **导入配对文件（pairing file）**：按 SideStore 文档（docs.sidestore.io）生成并导入，
   之后 SideStore 才能在手机上自己签名/无线刷新。
4. **信任开发者**（首次必做）：设置 → 通用 → VPN 与设备管理 → 你的 Apple ID → 信任。
5. **装本 App**：iPhone 上打开 SideStore → 「+」→ 选 `tt-calendar-ios-unsigned.ipa` → 等安装完成。
6. **续签**：到期前打开 SideStore 点刷新（配合它要求的 VPN/无线刷新设置），7 天一续。

## 路线 2（备选）：Sideloadly 直接 USB 签名安装

1. 到 https://sideloadly.io 装 Windows 版；
2. 手机连电脑，Sideloadly 里填 Apple ID，把 `.ipa` 拖进去点 Start；
3. 输密码/双重验证码，等进度完成；
4. 同样要做第 4 步「信任开发者」。7 天后重跑一次续期。

## 装好之后

- **数据在手机本地**（sql.js + IndexedDB），离线可用，不需要电脑开着服务。
- **GitHub 同步**：App 内 设置 → 同步，填 GitHub PAT 即可多端同步（见 SYNC_SETUP 文档）。
- **本地网络权限**：新包已声明 `NSLocalNetworkUsageDescription`；当前版本数据走手机本地库或
  GitHub 同步，一般用不到本地网络，系统也不会来要权限。若以后把数据地址指到局域网 http 服务，
  注意 `tauri://` 页面里 fetch 明文 http 会被 WebKit 拦（需改 https）。
- **不想装机也能看效果**：把 CI 的另一个产物 `tt-calendar-ios-sim.zip` 传到
  [Appetize.io](https://appetize.io)，浏览器里就能跑（Windows 上最省事的「iOS 模拟」方案）。

## 装不上 / 白屏排查
1. 装的是最新 run 的包吗？（旧包白屏报 localhost:5175，是 dev 模式 bug，已修复）
2. SideStore/Sideloadly 日志里常见：Apple ID 密码错、双重认证、未信任电脑、**3 App 上限已满**。
3. 首次打开闪退 → 多半是没做「信任开发者」。
4. 仍不行：把工具日志 + iPhone 型号/iOS 版本发出来。

## 主屏小组件（iOS 14+）

包内含一个 WidgetKit 小组件 **「今日概览」**（小/中两种尺寸）：显示今天的日程与待办。

**怎么添加**：装好 App 后，长按主屏幕空白处 → 左上角「+」→ 搜索「TT 日历」
（或翻到列表里的 TTCalendar）→ 选尺寸 → 添加。

**数据怎么来的**：App 在前台时会把「今日概览」快照写入 App Group 共享容器
（`group.com.tt.calendar.mobile`），小组件读同一份文件渲染；App 每次打开、
同步完成、以及每 15 分钟（前台时）会自动刷新一次。

**已知限制（如实说明）**：
- 小组件与 App 共享数据依赖 App Group capability。**免费 Apple ID 自签时，
  部分侧载工具不会注册 App Group**，此时小组件能装上、但只会显示
  「打开 App 同步数据」占位文案（日期仍正常显示），不会崩溃。
- 用 $99 开发者账号签名（或侧载工具支持 App Group 的场景）则数据共享正常。
- 小组件刷新时机由 iOS 系统调度（我们请求 30 分钟兜底），不是秒级实时。
