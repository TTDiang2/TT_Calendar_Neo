# TT Calendar Neo

三端同构的本地优先日历：**Web / Windows 桌面 / iOS（Android 就绪）** 共享同一份界面与数据层，
数据存在你自己的设备与 GitHub 私有仓里，没有中心服务器。

## 特性

- 📅 月/周/日/年视图 + 农历（一等公民，支持农历纪念日重复）
- 🎨 图层体系：涂色图层（打卡/完成度）与点点图层（事件/日程）分离建模
- ✅ 待办：多清单、忙度预测（算法配置可调）、四象限看板
- ⏳ 倒数日：公历/农历重复、里程碑规则
- 🔄 多端同步：数据存你自己的 GitHub 私有仓，行级三方合并，无服务器
- 📱 iOS 离线可用：WebView 内嵌 WASM SQLite，数据全本地
- ☁️ 免费 CI：GitHub Actions macOS runner 云端出 iOS 安装包

## 架构一览

```
packages/contracts  ← zod 契约（视图/图层/同步协议），三端共享的类型事实
packages/domain     ← 纯函数领域层（视图聚合/三方合并/农历/忙度），零 IO，golden 测试冻结
packages/db         ← drizzle schema + SqliteBackend（数据门面）+ 同步引擎 + 本地 WASM 后端
packages/ui         ← 全部 React 界面（含移动端竖屏适配），数据来源由 setBackend() 注入

apps/web            ← Web 端 + Node 数据服务（8766）
apps/desktop        ← Tauri 桌面端（数据服务 8767）
apps/mobile         ← Tauri iOS/Android 端（数据全本地：Worker 内 sql.js WASM SQLite）
```

数据面统一为 `BackendAdapter` 接口（`packages/ui/src/adapt/api.ts`），三端各自注入实现：
HTTP（web/desktop）或 Worker 内本地库（mobile）。业务代码只有一份。

## 快速开始

```bash
pnpm install

# Web 端（含数据服务）
pnpm dev:web                 # http://localhost:5173

# 桌面端（Tauri 原生窗）
pnpm dev:desktop

# 全量门禁：lint + typecheck + test + build
pnpm verify
```

移动端开发：`pnpm --filter @tt-calendar/mobile dev`（vite 5175）。

## iOS 安装包（不需要 Mac）

仓库自带 GitHub Actions 工作流，push 即在云端 macOS runner 出包：

- **真机未签名 .ipa**（Sideloadly 免费自签，7 天续期）
- **模拟器 .app**（可上传 Appetize.io 浏览器试跑）

详见 [docs/ios-build-guide.md](docs/ios-build-guide.md)。

## 多端同步

数据通过你自己的 GitHub 私有仓在设备间同步（REST 协议，无 git 依赖）。
配置步骤见 [docs/SYNC_SETUP.md](docs/SYNC_SETUP.md)，协议细节见 [docs/SYNC_PROTOCOL.md](docs/SYNC_PROTOCOL.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 分层架构、图层模型、六条红线 |
| [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md) | 设计哲学：数据主权、双轨分离、订阅模型 |
| [docs/SYNC_PROTOCOL.md](docs/SYNC_PROTOCOL.md) | 同步协议：快照/墓碑/三方合并/冲突重试 |
| [docs/SYNC_SETUP.md](docs/SYNC_SETUP.md) | 同步配置图文步骤（PAT 申请等） |
| [docs/SUBSCRIPTION_SPEC.md](docs/SUBSCRIPTION_SPEC.md) | 订阅（外部数据源）契约与适配流程 |
| [docs/ios-build-guide.md](docs/ios-build-guide.md) | iOS 打包全记录（含踩坑根因） |
