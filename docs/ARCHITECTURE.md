# 架构

> 代码里的注释多处引用本文的「红线」编号 —— 改这些行为前先读这里。

## 分层

```
┌────────────────────────────────────────────────────────┐
│ packages/ui         React 界面（唯一的一份 UI）          │
│   adapt/           BackendAdapter 接口 + HTTP 实现      │
├────────────────────────────────────────────────────────┤
│ packages/db         数据门面 SqliteBackend（同步代码）   │
│   sync/            GitHub REST 同步（远端 + 编排）       │
│   local/           sql.js(WASM) shim + IndexedDB 持久化  │
├────────────────────────────────────────────────────────┤
│ packages/domain     纯函数领域层（零 IO）                │
│ packages/contracts  zod 契约 = 三端共享的类型事实        │
└────────────────────────────────────────────────────────┘
        ▲ setBackend() 注入                ▲ 只依赖向下
apps/web        HttpBackendAdapter → Node 数据服务(8766)
apps/desktop    HttpBackendAdapter → Node 数据服务(8767)
apps/mobile     Worker 本地库（sql.js WASM + IndexedDB 快照）
```

铁律：**domain 与 contracts 绝不 import 向上（db/ui/apps）**，也不碰 IO。
这保证视图聚合、三方合并这些核心逻辑能在 vitest 里对拍冻结。

## 数据流

1. 组件 → `adapt/api.ts` 的同名函数 → `getBackend().xxx()`（`BackendAdapter` 接口，全异步）
2. web/desktop：HTTP → Node 数据服务 → `SqliteBackend`
3. mobile：RPC → Web Worker 内的 `sql.js(WASM) + drizzle + SqliteBackend`（业务代码同一份）
4. `SqliteBackend` → drizzle → SQLite（better-sqlite3 或 WASM shim，取决于宿主）

## 图层模型（核心抽象）

- `kind='color'` 涂色图层：**背景染色**，数据走 `marks` 表
- `kind='dot'` 点点图层：左上角色点，数据走 `events` 表（事件类）或
  `schedule_items` 表（日程类，由 `config.category` 判定）
- 内置自动图层 `AUTO_COLOR_LAYER_IDS = ['holiday','important','todo','todo_done']`：
  颜色由系统按数据自动渲染
- `group` 是独立维度，**不是** layer_id 前缀

## 六条红线

| # | 红线 | 原因 |
|---|---|---|
| 1 | 涂色标记**绝不**进 `events` 表，走 `marks` | events 是「点点」语义，混入会污染视图/同步 |
| 2 | 自动涂色图层不出现在「新增涂色」下拉里 | 它们的颜色由数据派生，手动涂色会被覆盖 |
| 3 | 图层颜色锁定：自动图层不可手动改色 | 同上 |
| 4 | 是否产出「日程」看 `config.category`，**不是** layer_id 前缀 | 前缀约定在改名/订阅场景必然失效 |
| 5 | marks 按 `(layer_id, date)` 唯一 | 同一打卡图层同一天只能有一条 |
| 6 | 自增表（events/schedule_items/countdown/marks）的同步身份是 `sync_uid`，**不是**自增 id | 本地自增 id 在不同设备上无对应关系 |

## 同步（简述）

快照 + 墓碑 → GitHub 数据仓（REST）→ 三方合并 → 写回 + 推回。
协议与冲突处理见 [SYNC_PROTOCOL.md](SYNC_PROTOCOL.md)。

## 移动端本地化

`packages/db/local` 提供 better-sqlite3 兼容 shim（over sql.js WASM），
让 `SqliteBackend` 原样跑在 WebView Worker 里；持久化 = 全库二进制快照 →
IndexedDB（写后防抖 300ms + 页面隐藏强制 flush）。

## 测试策略

- domain：golden 对拍（merge 向量由 `scripts/gen-merge-vectors.py` 生成）
- db：better-sqlite3（Node）与 sql.js shim（同一套用例双跑）
- sync：假远端端到端（初始化/首绑/双向合并/冲突重试/墓碑删除）
- 门禁：`pnpm verify`（lint + typecheck + test + build）
