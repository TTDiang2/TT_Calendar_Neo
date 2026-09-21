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

## B. 需要你提供的东西（按优先级）

### 1. App Store Connect API 密钥（最推荐，自动化全靠它）
生成路径：[appstoreconnect.apple.com](https://appstoreconnect.apple.com) → 用户和访问 → 集成 → App Store Connect API → 生成（角色选 **App Manager** 或 **Developer**）
需要三样：
- **Issuer ID**（页面顶部一串 UUID）
- **Key ID**（10 位字符）
- **.p8 私钥文件**（只能下载一次，`AuthKey_<KeyID>.p8`）

用途：自动创建 App 记录、上传构建、管理 TestFlight、写元数据；也能自动签发发布证书与描述文件（配合 fastlane match/cert）。

### 2. 你的 Team ID（10 位）
路径：[developer.apple.com/account](https://developer.apple.com/account) → Membership details → Team ID。
（若给了 API 密钥，也可用脚本自动查到，但直接给我最快。）

### 3. 两个决策（一句话回复即可）
- **Bundle ID**：沿用 `com.tt.calendar.mobile`，还是换成新的？（换新则现在改，App Group 同步换成 `group.<新ID>`，改动点我已梳理好）
- **首发范围**：全区域 or 仅中国区？

### 4. 隐私政策
给一个你能长期托管的位置：GitHub 仓库内 `PRIVACY.md`（用 github.io 或仓库直链）即可。**文案我可以起草好你来挂。**

### 5. （可选，若不想用 API 密钥的替代路径）
- Apple ID 的 **App 专用密码**（appleid.apple.com → 登录和安全 → App 专用密码）——仅用于上传构建
- 手动创建的 **Apple Distribution 证书 .p12 + 密码**——仅用于签名
用 API 密钥的话这两样都不需要。

### 隐私营养标签（App Store Connect 里勾选，提交前我来核对）
预计申报：不收集任何数据（数据全本地 + 用户自己的 GitHub 仓）→ 这是本应用的最大卖点之一，如实填「不收集数据」。

---

## C. 上架流程与 CI 改造方案

### 现状
- `.github/workflows/ios-build.yml` 在 GitHub Actions macos-15 上 `tauri ios init` + 直接 xcodebuild，产出：模拟器包 + **未签名**真机 ipa（iLoader/SideStore/Sideloadly 自签，7 天有效）
- 小组件代码已全部就位（`apps/mobile/widget/TTCalendarWidget.swift` + Rust App Group 桥 + entitlements）；**免费账号签不出 App Group 权限**，这就是小组件此前"搁置"的唯一原因——付费账号直接解锁
- 正式签名构建需要 Apple 开发者账号凭据 → CI Secrets

### 密钥到位后的改造清单（我可以直接实施）
1. **签名 CI job**（新增 `device-signed` job，不动现有两个 job）：
   - Secrets：`APPSTORE_ISSUER_ID` / `APPSTORE_KEY_ID` / `APPSTORE_P8`（API 密钥三件套）
   - `fastlane match appstore`（或 xcodebuild + 手动 profile）签出：主 App `com.tt.calendar.mobile` + 小组件 extension `com.tt.calendar.mobile.widget` 两个 target 的 App Store 描述文件，且都要勾上 App Group `group.com.tt.calendar.mobile`
   - `xcodebuild archive` + `xcodebuild -exportArchive`（App Store 方法）→ 产出签名 ipa
2. **上传 TestFlight**：`xcrun altool --upload-app` 或 fastlane pilot（用同一把 API 密钥）
3. **App Group 注册**：开发者portal 注册 `group.com.tt.calendar.mobile` + 两个 App ID（带 App Group capability）——有 API 密钥可脚本化，没有就你在网页点两下（我来写步骤）
4. **Info.plist**：加 `ITSAppUsesNonExemptEncryption=NO`
5. **App Store Connect 记录**：建 App → 填 A 部分文案 → 传 6 张截图 → 提交审核
6. **审核注意**：Tauri/WKWebView 壳应用正常可过（4.2 最小功能）；首次提审建议备注「本地数据应用 + 可选 GitHub 同步」，附演示说明

### 小组件在真机上验证（拿到签名包后）
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
