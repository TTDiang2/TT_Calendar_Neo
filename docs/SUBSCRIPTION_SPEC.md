# 订阅（外部数据源）规格

> 哲学背景见 [PHILOSOPHY.md](PHILOSOPHY.md) §3：一切外部数据源都是订阅。
> 契约：`packages/contracts/src/subscription.ts`。

## 数据模型

`subscriptions` 表一行 = 一个数据源登记：

| 字段 | 含义 |
|---|---|
| `id` | UUID（同步身份，主键） |
| `display_name` | UI 显示名 |
| `source_key` | **分发键**：决定用哪个适配器抓取（如 `jisilu`） |
| `url` | 数据源地址（可选，视源而定） |
| `rules_text` | 自然语言抓取规则（可选；供 agent 写适配时参考） |
| `enabled` | 是否启用 |
| `auto_update` | 是否参与「到期自动刷新」 |
| `status` | `active`（已实装并正常）/ `pending`（已登记，等适配）/ `error`（上次刷新失败） |
| `last_synced_at` | 上次成功刷新时间 |

## 生命周期

```
用户登记（url + rules_text）──▶ status = pending
        │
        ▼
agent 读登记信息，现场写 Source 适配器（TS），接进刷新分发
        │
        ▼
status = active ──刷新──▶ 成功：写 events，更新 last_synced_at
        │                  失败：status = error + last_error
        └─（源不可用/未实装）▶ 刷新时返回 pending_adaptation
```

## 刷新语义

- `POST /subscriptions/{id}/refresh`：按 `source_key` 分发刷新单个订阅；
  未实装的 source_key 返回 `{ ok: false, error: 'pending_adaptation' }`
- `POST /subscriptions/refresh-due`：枚举 `enabled && auto_update` 的订阅
  逐个刷新，返回 `{ refreshed: [{ id, ok, inserted?, error? }] }`
- 抓取产物写入 `events` 表，`source = source_key`（**不是** `'manual'`）；
  按 `tombstoneGuard` 规则它们不产生墓碑——派生缓存删旧插新即可

## source_key 注册表现状

| source_key | 状态 | 说明 |
|---|---|---|
| `jisilu` | legacy 已实装（Python），Neo 未实装 | 集思录转债打新/上市/强赎；需要登录凭据与反爬处理 |
| 其他 | `pending_adaptation` | 按 agent 适配流程现场新增 |

## 新增一个源的步骤

1. 在 `packages/db` 写一个抓取函数：`fetch(url|规则) → CalEvent[]`
   （`source = source_key`，`sync_uid` 自动生成，删除/重跑安全）
2. 接入刷新分发（web/desktop 数据服务与 mobile Worker 共用）
3. 无需改 UI：设置面板的订阅区块与刷新语义是通用的
