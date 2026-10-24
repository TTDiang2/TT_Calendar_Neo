# App Store 上架材料 —— TT 日历（Neo）

> 2026-09-21 整理，**2026-10-07 ASO 优化改版**（依据：中国区竞品实抓 + iTunes Search API
> 实测排名调研，要点见 A 节末「ASO 调研要点」）。分三部分：**A. 商店文案（可直接粘贴）**、
> **B. 账密/证书现状**、**C. 上架流程状态**。
> 截图成品在 `artifacts/preview/frames2/`（8 张，1290×2796，6.7" 规格，真机截图重做版）。
>
> **当前状态：构建 69 已上传并通过 Apple 处理（VALID），TestFlight 内测就绪
> （READY_FOR_BETA_TESTING）。** 下一步：真机装 TestFlight 版验证小组件 →
> 提交审核。

---

## F. 1.1.0 提审记录（2026-10-24，全自动完成）

**已提交审核** · 提交 id `bc89352a-6be0-45e3-9571-bf4d14c9e0f7` · 版本 1.1.0 · 构建 98 ·
状态 `WAITING_FOR_REVIEW` · releaseType=AFTER_APPROVAL（过审自动发布，无需手动点）。

### 本次上线的内容
| 项 | 内容 |
|---|---|
| 版本号 | 1.0.0 → 1.1.0（tauri.conf.json），build 98 = CI run 编号 |
| 商店元数据 | **8 语言全量**（zh-Hans 用 20261007 ASO 优化版**首次落 ASC**——线上此前一直是旧文案：名称 5 字符/关键词 50 字符；zh-Hant/en/ja/ko/fr/es/ru 新译），母本 `scripts/appstore/v110/metadata.json` |
| App 名称/副标题 | 8 语言（zh-Hans 30 字符满编「TT日历·染色月历待办倒数日」；其他语言 TT Calendar/TTCalendar 品牌名 + 当地语言卖点） |
| 截图 | **8 语言 × 9 张**（新增第 9 屏「一键搬家」专屏，原隐私屏顺延；营销文案按语言重渲染，App 内文暂为中文——真机 UI 全语言截图留待 v1.2） |
| App 内活动 | 事件 id 6826484556（8 语言标题+描述+卡片图，图 `artifacts/asc/v110-event-card.png` 语言中立）；**注意：事件类型（Major Update）无 API 字段，需网页补选**，本次未挂入提审 |
| 年龄分级/审核信息 | 沿用 1.0.0 同款答案与联系方式（ASC 自动继承） |
| 预览视频 | **未随版本提交**（见下「预览视频踩坑」），文件留存 `artifacts/asc/v110-preview-{zh-Hans,en-US}.mp4` |

### 发版工具链（scripts/appstore/，全程 API 自动化，可复用）
- `release-v110.mjs create|screens|submit|status` —— 四阶段幂等发布：建版本+8语言元数据（appStoreVersionLocalizations + appInfoLocalizations）→ 批量传截图 → 挂构建+提审（reviewSubmissions 三步）。
- `v110/metadata.json` —— 8 语言文案母本（含字符数校验过的名称/副标题/关键词/宣传文本/描述/新功能）。
- `upload-v110-all.mjs` —— 截图批量上传驱动（每语言最多重试 4 次，网络抖动实测可靠）。
- `upload-event-assets.mjs` / `upload-preview-videos.mjs` —— App 内活动卡片与预览视频上传。
- `make-preview-video.py` —— ffmpeg 拼屏预览视频。
- 新坑实录：①**名称/副标题要改「草稿 appInfo」**——建新版本后 ASC 自动生成第二份 appInfo（PREPARE_FOR_SUBMISSION），改线上那份（READY_FOR_SALE）会 409 name 锁死；②年龄分级端点在 `appInfos/{id}/ageRatingDeclaration`（资源 id == appInfoId）；③审核信息端点是单数 `appStoreVersions/{id}/appStoreReviewDetail`；④appInfoLocalizations 新建时 ASC 会自动给草稿 appInfo 播种 8 语言占位。

### 预览视频踩坑（未随本次版本提交的原因）
- 886×1920 H.264 High@4.0 CFR + 静音 AAC 的**硬切拼接**配方**已实测通过转码**（zh-Hant 一度 COMPLETE）；zoompan/xfade 滤镜链版本稳定 FAILED（坏时间戳嫌疑）。
- 但 Apple 资产库在反复重验时状态随机翻转（COMPLETE→FAILED 无新上传也翻），提审校验会被瞬时 FAILED 卡住。本次决定不赌：删视频保提交。
- **过审后可随时补传**（预览视频属于元数据，不需要新构建）；`make-preview-video.py` 改 concat 硬切即可，Ken Burns 版留档 `make-preview-video.py` git 历史。

### 精选提名草稿（Featuring Nominations，网页操作：ASC → App → Featuring → Nominations，提前至少 2 周）
```
Title: TT Calendar 1.1 — a color-coded calendar that now speaks 8 languages
Type: Major App Update
Planned release: upon approval (late October 2026)

Story: TT Calendar makes effort visible — a month calendar colored by what
you actually got done, like a GitHub contribution graph for your life.
v1.1 is our biggest update since launch:
- Full UI localization into 8 languages (zh-Hans/zh-Hant/en/ja/ko/fr/es/ru)
  with localized plural rules, lunar calendar terms and date formatting
- One-tap migration from TickTick (CSV backup) and Todoist (API), including
  completion history that keeps the heatmap continuous
- A new 16-step guided onboarding tour, and interactive home-screen widgets
  including a one-tap check-in widget (iOS 17 App Intents)
Positioning: no ads, no IAP, no tracking; local-first data with optional
end-to-end GitHub private-repo sync. Great fit for "Productivity, small but
mighty" / back-to-school / New Year habit-tracking editorial moments.
Assets: 9 localized screenshots per language, app preview video (in
production), icon attached.
Contact: ttdiang@outlook.com
```

---

## A. App Store Connect 文案

### 应用名称（≤30 字符）
```
TT日历·染色月历待办倒数日
```
（20261007 ASO 优化：标题是权重最高的字段，原「TT 日历」仅用 5/30 字符；现覆盖
日历/月历/待办/倒数日 四个大词。备选 B：`TT日历-待办清单倒数日日程打卡`（六词全覆盖，
滴答清单式打法）；备选 C：`TT日历-日程打卡习惯倒数日`（抢习惯打卡流量取向）。
**注意：若启用备选 B/C，需同步复核关键词字段**——B 含「清单」、C 含「日程/打卡/习惯」，
与下方关键词字段重复的词要从关键词里删掉。
对外简称仍可用 `TT 日历`；名称全网唯一，被占用时依次回退）

### 副标题（≤30 字符）
```
日程打卡习惯计划，坚持看得见
```
（与标题配套不重复：新增 日程/打卡/习惯/计划 四词，保留品牌口号；
原「月历待办倒数日」已上提进标题，不再占副标题）

### 宣传文本（≤170 字符，可随时改不审核）
```
新：支持滴答清单 CSV 与 Todoist API 导入，老数据一键搬家。染色月历记录每天充实度，待办/日程/倒数日一体，小组件把坚持贴在首屏。无广告无内购，本地数据可选 GitHub 私有仓同步。
```
（备选情绪版：「你的日历会记住每一个坚持的日子：染色月历像 GitHub 热力图，越自律越好看。
待办四象限、倒数日自动逐年推算、桌面小组件。无广告无内购，5 分钟从滴答清单/Todoist 搬完家。」
考试季/新年计划季可轮换开头）

### 描述
```
坚持，看得见。TT 日历用一块「染色月历」记录你每天的充实度——像 GitHub 贡献热力图，越努力，你的月历越好看，连续打卡纪录一目了然。

【染色月历】
每天一格，用颜色记录充实度与完成度：忙是暖黄，沉淀是绿，纪念是紫。一个月过得如何，开屏即见。

【待办管理】
· 截止日 + 计划日 + 重要性三轴排序，先做真正要紧的事
· 列表 / 四象限矩阵 / 甘特 / 便签多种视图，手机桌面一眼定位
· 重复待办：每日、每工作日、每周，完成后自动生成下一期，拖延补卡也不产生过期待办
· 闹钟提醒：到点弹系统通知，重要事项不错过

【日程与重要日期】
· 日程条目带起止时间，按「工作 / 课程 / 运动 / 玩耍」分色
· 重要日期单层标注，生日、纪念日、考试一页打尽

【倒数日】
距离考试、上线、假期还有几天？卡片倒排，生日、纪念日每年自动推算下一期。

【数据洞察】
· 贡献热力图：近 26 周每日完成量，GitHub 风格
· 连续打卡纪录与里程碑徽章：初试身手 → 千锤百炼
· 忙度预测：未来 14 天负载提前看见，合理安排加与减

【桌面小组件】
今日待办、日程、倒数日直接铺在主屏；本月完成热力一格一格长出来，把坚持贴在首屏。

【一键搬家】
刚从滴答清单 / TickTick 或 Todoist 过来？支持滴答备份 CSV 一键导入与 Todoist API 导入，历史数据几分钟搬完，迁移无痛。

【你的数据，完全属于你】
· 数据本地存储，离线全功能可用
· 可选 GitHub 私有仓多端同步：桌面、手机双向合并，换机不丢数据
· 无广告、无内购、无内嵌追踪

让每一天被看见，把坚持留下来。
```

### 关键词（≤100 字符，逗号分隔）
```
提醒,清单,纪念日,生日,倒计时,时间管理,效率,热力图,小组件,便签,备忘录,四象限,甘特图,自律,目标,重要日子,节假日,考试,计划表,闹钟,记录,事项,恋爱,正数日,每日,工作,生活,笔记,学习
```
（恰好 100 字符。原则：不与标题/副标题重复（日历/月历/待办/倒数日/日程/打卡/习惯/计划
已在标题副标题，重复即浪费）；删「忙碌」（无人搜索）；新增竞品验证词（生日/倒计时/小组件/
便签/备忘录/自律）与零竞争独家词（热力图/四象限/甘特图）。超限时按 生活→笔记→学习→工作 顺序删）

### ASO 调研要点（20261007，详见调研报告）
- 标题塞词是中国区头部标配（滴答清单 24 字、极简待办 27 字），但只用真实功能词，规避 2.3.7 堆砌风险。
- 「打卡日历」「习惯日历」短语榜只剩微型应用——标题「打卡」×关键词「日历」组词即可覆盖。
- 万年历/黄历/农历/番茄钟/记账/天气 不碰（无此功能，竞品统治且有审核风险）。
- 关键词字段不加空格、半角逗号、不堆竞品品牌词（滴答清单/Todoist 只出现在描述与宣传文本，不进关键词）。
- 迭代：关键词随版本提交，每次发版后用七麦「关键词覆盖」公开页对比增减。

### App 信息
| 项 | 值 |
|---|---|
| Bundle ID | `com.tt.calendar.mobile`（沿用现有标识；如需换名现在是最便宜时机） |
| SKU | `tt-calendar-2026` |
| 主语言 | 简体中文 |
| 类别 | 效率（主）+ 生活（副） |
| 价格 | 免费（无内购） |
| 分发范围 | 全部地区（或先仅中国区，可后扩） |
| 年龄分级问卷 | 无暴力/赌博/医疗等内容 → 预计 4+；「不受限网页访问」答否（无内置浏览器） |
| 版权 | TTDiang2, 2026 |
| 出口合规 | 仅用系统 HTTPS（豁免加密合规）→ France 等问卷选「仅使用豁免加密」，Info.plist 加 `ITSAppUsesNonExemptEncryption=NO` 免每次作答 |

### 截图与图形资产
- 6.7" 截图 ×8（20261007 真机截图重做版，旧 frames/ 因非苹果状态栏被苹果拒收已弃用）：
  `artifacts/preview/frames2/slide-01.png … slide-08.png`（1290×2796，RGB 无 alpha）
  **上传顺序建议**（ASO：染色月历与小组件占前二）：
  01 月历首图 → 07 桌面小组件专图 → 02 染色月历 → 03 待办 → 04/05 倒数日跨图双联（相邻）→ 06 数据洞察 → 08 隐私与同步
- App 图标 1024×1024：`apps/mobile/icon-source-1024.png`
- 6.5"/iPad 截图：App Store Connect 现已允许仅提供 6.7"/6.9" 一档（其余尺寸可复用同档），先只交 6.7" 一套
- 上架后补：App 预览视频（可选，非必须）

### 必备外部链接
- **隐私政策 URL（审核硬性要求）**：见 C-4，需要你定托管位置
- 支持 URL：建议用 GitHub 仓库页 `https://github.com/TTDiang2/TT_Calendar_Neo`（含 README 说明）
- 审核备注：应用无账号体系、无内购，无需演示账号

---

## B. 密钥与信息（2026-09-21 已全部到位）

| 项 | 值 | 状态 |
|---|---|---|
| Key ID | `PT4T88KGY3`（Agent-key，App Manager） | ✅ 已提供，密钥文件 `E:/AuthKey_PT4T88KGY3.p8` 已验证可用 |
| Issuer ID | `2ae2a409-677f-4440-ba2d-04b1f2199d18` | ✅ 已提供 |
| Team ID | `8RRWT62P25` | ✅ 已提供 |
| Bundle ID | 沿用 `com.tt.calendar.mobile` | ✅ **已在 ASC 注册**（id `2S9UMW77LJ`）；小组件 `com.tt.calendar.mobile.widget`（id `3GLBW9U4N5`） |
| 首发范围 | 仅中国区 | ✅ 决策完成 |
| 隐私政策 | `docs/PRIVACY.md`（GitHub 公开链接）+ 应用内设置页展示 | ✅ 已落地 |

### 还剩两步只能网页手动点（公开 API 不开放这两个操作）

1. **注册 App Group**（签名构建的硬前置）：
   [developer.apple.com/account/resources/identifiers/list/appGroup](https://developer.apple.com/account/resources/identifiers/list/appGroup) → 「+」→ App Groups → Description 填 `TT Calendar Shared` → Identifier 填 **`group.com.tt.calendar.mobile`** → Register。
   注册完告诉我，我用 API 把它挂到两个 Bundle ID 上（bundleIdCapabilities）。

2. **创建 App 记录**（App Store Connect）：
   [appstoreconnect.apple.com/apps](https://appstoreconnect.apple.com/apps) → 「+」新建 App：
   - 名称：`TT 日历`（若提示重名，按 A 节备选名依次试）
   - 主要语言：简体中文；Bundle ID：`com.tt.calendar.mobile`；SKU：`tt-calendar-2026`
   - 用户访问：完全访问

### 3. GitHub 仓库 Secrets（已由 agent 用 `gh secret set` 写入，共 7 项）

| Secret 名 | 内容 | 用途 |
|---|---|---|
| `APPSTORE_KEY_ID` | `PT4T88KGY3` | API 鉴权 / 上传 TestFlight |
| `APPSTORE_ISSUER_ID` | `2ae2a409-677f-4440-ba2d-04b1f2199d18` | 同上 |
| `APPSTORE_P8` | .p8 私钥全文 | 同上 |
| `APPSTORE_P12` | 发布证书 p12 的 base64 | 手动签名（装进 CI 临时 keychain） |
| `APPSTORE_P12_PASSWORD` | 上述 p12 的密码 | 同上 |
| `APPSTORE_PROFILE_MAIN` | 主 App 描述文件 base64（含 App Group） | 手动签名 |
| `APPSTORE_PROFILE_WIDGET` | 小组件描述文件 base64（含 App Group） | 手动签名 |

签名链路（**为什么不用云签**）：`xcodebuild -exportArchive` 的自动签名走 Apple 云签，
需要云签替我们创建 App Store 描述文件，而 API Key 没有该权限（报
`Cloud signing permission error`，Apple 未开放）。因此改为：
归档用自动签名（dev 描述文件云签可创建）→ 导出用**手动签名** +
`provisioningProfiles` 映射（主 App / 小组件各指定一份自建描述文件）。
发布证书与两份描述文件均由 ASC API 创建（证书私钥仅存于本机与 Secrets）。

发布证书/描述文件有效期至 **2027-09-21**；到期前用
`artifacts/asc/` 流程重新签发（脚本与命令见该目录）。

### API 调用工具

`artifacts/asc/asc.mjs`（本地零依赖 JWT + curl 封装），用法：
```bash
export ASC_KEY_PATH="E:/AuthKey_PT4T88KGY3.p8" ASC_KEY_ID="PT4T88KGY3" ASC_ISSUER_ID="2ae2a409-677f-4440-ba2d-04b1f2199d18"
node asc.mjs token   # 输出 JWT
curl -H "Authorization: Bearer $TOKEN" https://api.appstoreconnect.apple.com/v1/apps
```

---

## C. 上架流程与 CI 改造方案

### 现状
- `.github/workflows/ios-build.yml` 在 GitHub Actions macos-15 上 `tauri ios init` + 直接 xcodebuild，产出：模拟器包 + **未签名**真机 ipa（iLoader/SideStore/Sideloadly 自签，7 天有效）
- 小组件代码已全部就位（`apps/mobile/widget/TTCalendarWidget.swift` + Rust App Group 桥 + entitlements）；**免费账号签不出 App Group 权限**，这就是小组件此前"搁置"的唯一原因——付费账号直接解锁
- 正式签名构建需要 Apple 开发者账号凭据 → CI Secrets

### 密钥到位后的改造（2026-09-21 已实施并跑通）

1. **签名 CI job 已落地**：`.github/workflows/ios-build.yml` 的 `appstore` job（手动触发，
   不影响另外两个 job）：
   - **归档**：自动签名（`DEVELOPMENT_TEAM=8RRWT62P25` + `-allowProvisioningUpdates` + API Key）
   - **注入 build 号**：`scripts/patch-ios-version.mjs`（ASC 要求 build 号唯一；tauri 生成的
     工程里主 App 是字面量、小组件走 `$(CURRENT_PROJECT_VERSION)`，统一改成 run 编号）
   - **导出**：`signingStyle=manual` + `provisioningProfiles` 显式映射两份自建描述文件
     （**关键**：自动签名导出走云签，API Key 无创建发布描述文件的权限，报
     `Cloud signing permission error`；手动签名彻底绕开）
   - **上传**：`xcrun altool --upload-app`，上传前硬校验 ipa 内含 `PlugIns/TTWidget.appex`
   - **运行环境**：`runs-on: macos-26`（**Apple 2026 起拒收 iOS 18.5 SDK 构建**，
     必须 iOS 26 SDK；macos-15 镜像带的是 Xcode 16.4）
2. **出口合规**：`patch-ios-plist.mjs` 注入 `ITSAppUsesNonExemptEncryption=NO`（已验证生效：
   ASC 上 `usesNonExemptEncryption: false`，提审不再需要每次作答）
3. **App Group / 描述文件**：App Group 由开发者在后台注册（API 不开放创建）；
   发布证书与两份 App Store 描述文件（均含 App Group）由 ASC API 创建，
   证书私钥与描述文件内容存 Secrets
4. **App 记录**：`6814356398`（TT 日历 / com.tt.calendar.mobile / SKU tt-calendar-2026）
5. **审核注意**：Tauri/WKWebView 壳应用正常可过；首次提审建议备注「本地数据应用 +
   可选 GitHub 同步（用户自己的私有仓库）」，无需演示账号

**当前版本号**：预发布版本 `0.1.0`（= `apps/mobile/src-tauri/tauri.conf.json` 的 version）。
若希望商店显示 `1.0` 而非 `0.1.0`，改 tauri.conf.json 的 version 后重跑一次 appstore job
（第一次提审前改，已上传的 TestFlight 构建不受影响）。

### 小组件在真机上验证（TestFlight 装好后）
1. iPhone 装 TestFlight → 安装 TT 日历（构建 69+）
2. 打开 App 一次（触发 widget-bridge 写快照到 App Group）
3. 长按桌面 → 添加小组件 → 选 TT 日历 → 15 分钟内刷出今日待办/日程/倒数/本月完成热力
4. 若显示占位文案 = App Group 未生效：检查两个 target 装入的描述文件是否含
   `group.com.tt.calendar.mobile`（构建日志「已安装描述文件」一节可见）

### 提交审核前的剩余事项
1. TestFlight 真机走查（小组件 + 主流程）
2. ASC 填写：描述/关键词/截图（A 节文案）、隐私营养标签「不收集数据」、
   年龄分级问卷、版权、审核备注
3. 添加 TestFlight 内测人员（如需给他人试装）
4. 提交审核（App 版本 0.1.0 或改号后的 1.0 + 构建 69+）

---

## 附：本地产物索引
| 文件 | 说明 |
|---|---|
| `artifacts/preview/frames/01..06-*.png` | 6.7" 商店截图成品（1290×2796） |
| `artifacts/preview/raw/*.png` | 原始应用截图（430×932） |
| `artifacts/preview/compose.html` + `stitch.mjs` + `serve.mjs` | 截图合成工具链（改文案后可一键重出图） |
| `apps/web/seed-demo.ts` | 演示数据种子（`node --import tsx apps/web/seed-demo.ts <db>`） |

---

## D. 提审进度（2026-09-21 晚）

### 已完成（全部经 ASC API 落地，可复核）
| 项 | 内容 |
|---|---|
| App 记录 | `6814356398` · TT 日历 · com.tt.calendar.mobile |
| 版本记录 | **1.0.0**（PREPARE_FOR_SUBMISSION）· 已挂构建 **71**（CFBundleShortVersionString 1.0.0，VALID） |
| 名称/副标题 | TT 日历 / 月历待办倒数日，坚持看得见 |
| 描述 / 关键词 / 宣传文本 | 全套中文文案（见 A 节，已写入 ASC） |
| 支持链接 / 营销链接 | https://github.com/TTDiang2/TT_Calendar_Neo |
| 隐私政策 URL | docs/PRIVACY.md 的 GitHub 链接 |
| 分类 | 主：效率（PRODUCTIVITY）· 副：生活（LIFESTYLE） |
| 年龄分级 | 24 项全部按「无」填报 → 预期 4+ |
| 版权 | TTDiang2 |
| 截图 | 6 张 6.7"（1290×2796，**已去 alpha 通道**）→ 全部 COMPLETE |
| TestFlight | 内测组「内部测试」+ 测试员 ttdiang@outlook.com + 测试信息（zh-Hans） |
| 出口合规 | ITSAppUsesNonExemptEncryption=NO → ASC 显示 false |

### 提审前还差
1. **审核联系电话**（`contactPhone` 为 ASC 必填，我没有你的号码）——你在 ASC「App 审核信息」里填一下，或告诉我号码我来填。
2. **中国大陆 App 备案号**：中国大陆区上架硬性要求（工信部备案，号段带 `-A` 后缀；Apple 会校验号段与工信部记录一致）。办理需要域名 + 国内服务器，首次通常 1 个月以上。**TestFlight 阶段不需要它**；只在正式上架中国区时必需。
   - 变通：先把销售范围设为「除中国大陆外」可以立即上架全球其它地区；等备案下来再放开中国区。
3. **真机走查**：TestFlight 装 71 版 → 验证小组件（App Group 链路）。

### 本仓库的发布工具（scripts/appstore/，可复用）
| 脚本 | 用途 |
|---|---|
| `asc.mjs` | 生成 ASC API 的 JWT（`node asc.mjs token`），配合 curl 调用 |
| `upload-screenshots.mjs` | 批量上传截图（自动建集合、分片 PUT、commit） |
| `to-rgb.mjs` | 去 PNG alpha 通道（ASC 拒收带 alpha 的截图：`IMAGE_ALPHA_NOT_ALLOWED`） |
| `stitch.mjs` / `compose.html` | 截图合成（双瓦片拼接绕开浏览器 fullPage 截图 bug） |
| `fill-version-meta.mjs` | 写入版本页文案（描述/关键词/支持链接） |

用法示例（环境变量：`ASC_KEY_PATH` / `ASC_KEY_ID` / `ASC_ISSUER_ID`）：
```bash
node scripts/appstore/upload-screenshots.mjs <版本本地化id> APP_IPHONE_67 图1.png 图2.png …
```

---

## E. 提审完成（2026-09-21 22:11 北京时间）

**已提交审核** · 提交 id `b2e3812b-e6e9-4110-a944-71a328afbdee` · 状态 `WAITING_FOR_REVIEW`

| 项 | 值 |
|---|---|
| 版本 | 1.0.0（发布方式 MANUAL：过审后手动点发布） |
| 构建 | 83（iPhone 专用，手动签名） |
| 提交时间 | 2026-09-21T14:11:19Z |

### 提审过程中解决的阻塞（复盘）
1. **缺少 iPad 截图** → 工程默认声明 iPad（`TARGETED_DEVICE_FAMILY="1,2"`），Apple 强制要 12.9" 截图且会在 iPad 实测。v1.0 收敛为 iPhone 专用（`scripts/patch-ios-device-family.mjs`）。
2. **价格未设置** → ASC API 设免费（`POST /v1/appPriceSchedules`，美国基准 0.00 自动均衡全球）。
3. **内容权属未声明** → `PATCH /v1/apps/{id}` 设 `DOES_NOT_USE_THIRD_PARTY_CONTENT`。
4. **App 隐私声明** → **无公开 API**（试遍 `/v1/appDataUsages` 等 6 种形态均 404），只能网页填：ASC → App 隐私 → 不收集数据 → 发布。
5. **证书配额耗尽（构建连续失败）** → 云签在每台全新 CI 机器上都会新建开发证书，3 张配额吃满后全部构建失败。根治：归档改**手动签名**（自建发布证书 + 描述文件，`scripts/patch-ios-signing.mjs`），零云签依赖。

### 提审辅助工具（scripts/appstore/）
提审校验错误的排查方式值得复用：`POST /v1/reviewSubmissionItems` 失败时，响应里的
`errors[0].meta.associatedErrors` 会**逐项列出**缺失内容（截图类型、必填属性、隐私声明等），
比在网页上逐页找快得多。

### 审核结果出来之后
- 过审 → ASC 里点「发布」（MANUAL 模式）→ 上架；中国大陆区若被要求备案号，走豁免说明（纯本地应用）
- 被拒 → 读 Resolution Center 的拒审理由，改完重新提审（构建流程已全部自动化，一轮约 10 分钟）
