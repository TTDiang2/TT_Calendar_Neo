# 同步协议（GitHub 数据仓）

> 实现位置：`packages/db/src/sync-service.ts`（纯数据面）、`packages/db/src/sync/`（REST 远端 + 编排）。
> 配置步骤见 [SYNC_SETUP.md](SYNC_SETUP.md)。

## 拓扑

```
设备 A（本地 SQLite）──┐
设备 B（本地 SQLite）──┤   REST（git data API）   ┌────────────────┐
设备 C …             ─┴──────────────────────────▶  GitHub 私有仓   │
                                                  │ data/snapshot.json    │
                                                  │ data/tombstones.json  │
                                                  └────────────────┘
```

无服务器、无中转。每台设备持有独立「基线」（上次同步结果），远端仓只存
最新合并结果 + 墓碑。

### 与旧版 TT_Calendar（Python 时代）的互通

旧版数据仓是 **每表一文件**（`manifest.json` + `data/{table}.json`，内容
`{"rows":[...]}`），Neo 是单文件 `data/snapshot.json`。两版的表名、行身份
（`sync_uid`）、墓碑格式完全一致，差别只在文件布局，因此 Neo 做双向兼容。

**实测的用户仓形态（2026-09-15，`TTDiang2/tt-calendar-data`）**：

```
data/snapshot.json        319 B   ← 老 Neo 那次失败初始化写的空快照
data/todo.json           671 KB   ← 电脑端的真实待办，被上面的空快照遮蔽
data/schedule_items.json  64 KB /  data/coloring.json 33 KB / marks 15 KB ...
manifest.json             93 B   ← 旧版标记
```

**病灶**：`data/snapshot.json` 与旧版各表**并存**。老 Neo 认不出旧版格式，
把仓当空仓并"初始化"上传了一份空快照——而 `commitFiles` 用 `base_tree` 只覆盖
列出的路径，旧版各表原样保留。此后任何"见快照就用快照"的读法都会读到那份空
快照（0 行），合并结果恒为空 → 用户看到的「拉取0、推送0、冲突0、删除0」。

**修复后的读法**：快照与旧版各表**取行级并集**（`unionSnapshot`）——旧版
`data/{table}.json` 逐表合成为快照形态后与 `data/snapshot.json` 按行身份
合并，同行冲突按 `updated_at` LWW 取新。我们自己的双写产物两边内容一致，
并集天然幂等。

**写回**：仅在「检测到旧版布局」时额外写每表一文件（`dualWrite` 由
`readData` 的 `legacy` 结果显式传给 `writeData`），旧版客户端继续可读；
纯 Neo 仓只写两个文件，仓库体积与流量不翻倍。空表也写 `{"rows":[]}`，
防旧版客户端看到已清空表的残影（删除仍由 `tombstones` 传播）。

**恢复步骤（已在单测里端到端验证）**：手机升级到含本兼容的版本后，
**直接点「设置 → 数据同步 → 立即同步」即可**——基线虽为空，但读到的远端有
真实行数，三方合并会把它们作为"远端新增"拉下来。**不需要**重装 App 或清库；
清库反而会丢掉手机上已有的数据（清库后本地无行，远端仍会被并集读到，但手机
那份就没了）。

⚠️ 已知数据完整性缺口：老 Neo 那次初始化把同路径的 `data/tombstones.json`
覆盖成了空对象，旧版此前的**删除历史**已丢失。并集恢复时，被旧版删过而记录
只存在墓碑里的行可能"复活"。无法从现有数据反推，如实记录在此。

## 快照

- `SYNC_TABLE_NAMES`（contracts/sync.ts）定义 11 张同步表，导出顺序即导入
  顺序（外键父表在前：todo_list → todo）
- 线上行格式为 **snake_case**（与 Python 时代协议一致）；drizzle 导出后经
  `rowToWire` 转换
- 行身份（`SYNC_TABLES` 三元组 `[主键列, 身份列, 是否自增整型主键]`）：
  - 自增表 `events / schedule_items / countdown / marks`（AUTO_INT_TABLES）：
    身份 = `sync_uid`（UUID，创建时生成；导出前对 NULL 回填，见下）
  - 其余表：身份 = 自然主键（id / layer_id / date / key）
- `meta` 表里 `sync.` 前缀的键是**本机私有键**（PAT、基线、上次同步状态）：
  永不导出、永不产生墓碑

## 墓碑

- 删除行写 `sync_tombstones`：`"<table>|<rowKey>" → deleted_at`
- 守卫规则（`tombstoneGuard`，对齐 Python `_triggers`）：
  - `meta`：`sync.%` 键不产生墓碑
  - `events`：`source != 'manual'` 不产生墓碑（订阅/导入是派生缓存，
    启动时删旧插新，同步它们会灌假删除）

## 三方合并

`domain/merge.ts`（纯函数，golden 测试冻结）：

```
merge(base, remote, local, baseTombs, remoteTombs, localTombs) →
  { upsert, deletes, tombstones, data(合并后快照), report }
```

- 每行按身份取 (base, remote, local) 三元组：
  - remote == local → 不变
  - base == remote（本地改了）→ **推**（pushed）
  - base == local（远端改了）→ **拉**（pulled）
  - 三方互异 → LWW 裁决（`updated_at` 晚者胜，conflicts 计数）
  - 仅 base 与 local 有（远端无 + 墓碑）→ 删除；墓碑 vs 新行 → 复活（revived）
- 首绑（本地无基线）：`firstBindMerge`，两种模式
  - `merge_push`：两边并集（推荐）
  - `pull_overwrite`：远端整表覆盖本地（含墓碑清点）

## 编排（SyncFacade）

- 本地基线存 `meta` 键 `sync.base`（JSON：快照 + 墓碑 + commitSha）
- `syncNow()`：读基线 → 拉远端 → 三方合并 → 写回本地 → 推远端 → 更新基线
- 远端无分支：视为空仓，走「初始化上传」（result = `initialized`）
- 本地无基线且远端有数据：返回 `needs_decision`，由用户在设置面板裁决，
  **绝不自动覆盖**
- 并发提交：PATCH ref 收到 422（非快进）→ 重拉重并重试，最多 3 次
- 传输：GitHub git data API（blobs/trees/commits/refs），纯 REST——
  iOS WebView 里没有 git 二进制也能跑

## 演进规则

- 新增同步表：改 `contracts/sync.ts` 的 `SYNC_TABLES` + `sync-service.ts`
  的 `exportTableRaw` / `upsertRow`，并补 golden 向量
- 改行结构：先改 contracts zod，快照行加列（旧行缺列视为 NULL），禁止改列语义
