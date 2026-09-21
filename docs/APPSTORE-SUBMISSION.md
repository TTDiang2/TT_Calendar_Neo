# App Store 上架材料 —— TT 日历（Neo）

> 2026-09-21 整理。分三部分：**A. 商店文案（可直接粘贴）**、**B. 需要你提供的信息/密钥**、
> **C. 上架流程与 CI 签名改造方案**。
> 截图成品在 `artifacts/preview/frames/`（6 张，1290×2796，6.7" 规格）。

---

## A. App Store Connect 文案

### 应用名称（≤30 字符）
```
TT 日历 - 待办·倒数·染色月历
```
（备选短名：`TT 日历`；注意名称全网唯一，被占用时依次回退）

### 副标题（≤30 字符）
```
月历待办倒数日，坚持看得见
```

### 宣传文本（≤170 字符，可随时改不审核）
```
重复待办上线：每天/每工作日/每周，点完自动排下一期，拖延补卡不过期。
```

### 描述
```
TT 日历是一张「会记录你生活」的日历：月历上染色、待办里打勾、倒数日里期待——日子过成什么样，一眼看得见。

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
距离考试、上线、假期还有几天？卡片倒排，每年重复的日子自动推算下一期。

【数据洞察】
· 贡献热力图：近 26 周每日完成量，GitHub 风格
· 连续打卡纪录与里程碑徽章：初试身手 → 千锤百炼
· 忙度预测：未来 14 天负载提前看见，合理安排加与减

【你的数据，完全属于你】
· 数据本地存储，离线全功能可用
· 可选 GitHub 私有仓多端同步：桌面、手机双向合并，换机不丢数据
· 无广告、无内嵌追踪

【桌面小组件】
今日待办、日程、倒数日直接铺在主屏；本月完成热力一格一格长出来。

让每一天被看见，把坚持留下来。
```

### 关键词（≤100 字符，逗号分隔）
```
日历,待办,倒数日,日程,打卡,习惯,计划,热力图,提醒,时间管理,清单,纪念日,忙碌,月历,效率
```

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
- 6.7" 截图 ×6：`artifacts/preview/frames/01-month.png … 06-count.png`（1290×2796）
  顺序建议：01 月历（首图）→ 02 日视图 → 03 待办 → 04 统计 → 05 快速新增 → 06 倒数日
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

### 3. 给 GitHub 仓库配三个 Secrets（CI 签名 job 用）

仓库 Settings → Secrets and variables → Actions → New repository secret：

| Secret 名 | 值 |
|---|---|
| `APPSTORE_KEY_ID` | `PT4T88KGY3` |
| `APPSTORE_ISSUER_ID` | `2ae2a409-677f-4440-ba2d-04b1f2199d18` |
| `APPSTORE_P8` | `E:/AuthKey_PT4T88KGY3.p8` 的**完整文本内容**（-----BEGIN PRIVATE KEY----- 到 -----END PRIVATE KEY-----） |

配好后到 Actions → iOS build → Run workflow（勾选只在 dispatch 触发的 `appstore` job 会跑）：归档签名 → 导出 ipa → 自动传 TestFlight。

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

### 密钥到位后的改造（2026-09-21 已实施）

1. **签名 CI job 已加**：`.github/workflows/ios-build.yml` 新增 `appstore` job（workflow_dispatch 手动触发，不动现有两个 job）：
   - xcodebuild 自动签名（`DEVELOPMENT_TEAM=8RRWT62P25` + `-allowProvisioningUpdates` + `-authenticationKey*`），免手工证书/描述文件
   - 归档 → ExportOptions（app-store-connect + `manageAppVersionAndBuildNumber` 自动递增 build 号）→ `xcrun altool` 上传 TestFlight
   - 保留小组件硬门槛：`PlugIns/TTWidget.appex` 缺失直接失败
   - 触发条件：Secrets 三件套配好后，Actions 页手动 Run
2. **出口合规已声明**：`patch-ios-plist.mjs` 注入 `ITSAppUsesNonExemptEncryption=NO`
3. **App Group 注册**：公开 API 不支持 → 需开发者在后台网页注册（见 B 节步骤 1）；注册后可用 API 挂到两个 Bundle ID
4. **App 记录创建**：公开 API 不支持 CREATE → 需 ASC 网页新建（见 B 节步骤 2）
5. **审核注意**：Tauri/WKWebView 壳应用正常可过（4.2 最小功能）；首次提审建议备注「本地数据应用 + 可选 GitHub 同步」，附演示说明

### 小组件在真机上验证（拿到 TestFlight 包后）
1. TestFlight 装 App → 长按桌面 → 添加小组件 → 选 TT 日历
2. 打开 App 一次（触发 widget-bridge 写快照）→ 小组件 15 分钟内刷出今日待办/日程/倒数
3. 若显示占位文案 = App Group 未生效 → 检查两个 target 的描述文件是否都含 App Group

---

## 附：本地产物索引
| 文件 | 说明 |
|---|---|
| `artifacts/preview/frames/01..06-*.png` | 6.7" 商店截图成品（1290×2796） |
| `artifacts/preview/raw/*.png` | 原始应用截图（430×932） |
| `artifacts/preview/compose.html` + `stitch.mjs` + `serve.mjs` | 截图合成工具链（改文案后可一键重出图） |
| `apps/web/seed-demo.ts` | 演示数据种子（`node --import tsx apps/web/seed-demo.ts <db>`） |
