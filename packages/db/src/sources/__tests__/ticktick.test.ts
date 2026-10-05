/**
 * 滴答清单 CSV 备份导入测试（双驱动：node better-sqlite3 / sql.js wasm 同套件）。
 *
 * 覆盖智者验收清单：
 *  - 批量导入 importTodosBatch：created_at/completed_at/sort_order 真落库（断言 DB 值）
 *  - 忙度重算调用次数 = 1（计数包装）
 *  - 时区换算收口 tsToLocalDate：「UTC 串日期≠本地日期」（T16:00:00+0000 + Asia/Shanghai → 次日）
 *  - 表头扫描不硬编码行数（前 ~10 行找 taskId+parentId）
 *  - RRULE 全形态矩阵（DAILY / weekdays / weekly / INTERVAL≠1 / COUNT / BYSETPOS /
 *    多天 BYDAY / 周末 RRULE 一票否决）
 *  - \uFFFD 编码拒绝；errors 定位 CSV 物理行号；taskId 折叠；Folder 聚合 warning
 *  - 性能：5000 行合成 CSV ≤2s（node 驱动）
 *
 * fixture 见 ./ticktick-fixtures.ts（重建样例，非真实导出，待用户真实文件复核）。
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

import { openDb, SqliteBackend } from '../../index'
import { openLocalDb } from '../../local/backend'
import { importTodosCsvOnBackend, parseCsv } from '../csv-todos'
import { tsToLocalDate, tsToLocalStamp } from '../shared'
import { detectTickTickCsv, importTickTickCsvOnBackend } from '../ticktick'
import {
  buildPerfCsv,
  fixtureLineOf,
  FIXTURE_HEADER_LINE,
  GARBLED_ENCODING_SAMPLE,
  TICKTICK_FIXTURE,
  TICKTICK_HEADER,
} from './ticktick-fixtures'

const require = createRequire(import.meta.url)

interface Ctx {
  backend: SqliteBackend
  close(): void
  /** 原样 SQL 直查（绕过 backend 门面，断言字面 DB 行值用） */
  rawAll(q: string): Record<string, unknown>[]
}

async function openNode(): Promise<Ctx> {
  const { db, sqlite } = openDb({ path: ':memory:' })
  return {
    backend: new SqliteBackend(db),
    close: () => sqlite.close(),
    rawAll: (q) => sqlite.prepare(q).all() as Record<string, unknown>[],
  }
}

async function openSqlJs(): Promise<Ctx> {
  const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
  const h = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
  return { backend: h.backend, close: () => h.sqlite.close(), rawAll: (q) => h.sqlite.prepare(q).all() }
}

const drivers: Array<{ name: string; open: () => Promise<Ctx> }> = [
  { name: 'node better-sqlite3', open: openNode },
  { name: 'sql.js wasm', open: openSqlJs },
]

/** 忙度重算计数包装（recomputeBusyForDates 是私有方法，运行时可替换） */
function countBusyRecompute(ctx: Ctx): { calls: () => number } {
  let n = 0
  const slot = ctx.backend as unknown as { recomputeBusyForDates: (dates: string[]) => void }
  const orig = slot.recomputeBusyForDates.bind(ctx.backend)
  slot.recomputeBusyForDates = (dates: string[]) => {
    n += 1
    orig(dates)
  }
  return { calls: () => n }
}

function byTitle(todos: ReturnType<SqliteBackend['getTodos']>, title: string) {
  const hit = todos.find((t) => t.title === title)
  expect(hit, `找不到待办「${title}」`).toBeTruthy()
  return hit!
}

// ---------- 纯函数：表头识别 ----------

describe('detectTickTickCsv（表头扫描不硬编码行数）', () => {
  const header = TICKTICK_HEADER.join(',')

  it('滴答 fixture（6 行 preamble）识别为真', () => {
    expect(detectTickTickCsv(parseCsv(TICKTICK_FIXTURE))).toBe(true)
  })

  it('preamble 9 行（表头在第 10 行，扫描窗内）→ 真；11 行（窗外）→ 假', () => {
    const junk9 = Array.from({ length: 9 }, (_, i) => `元数据第${i}行,x`).concat(header).join('\n')
    expect(detectTickTickCsv(parseCsv(junk9))).toBe(true)
    const junk11 = Array.from({ length: 11 }, (_, i) => `元数据第${i}行,x`).concat(header).join('\n')
    expect(detectTickTickCsv(parseCsv(junk11))).toBe(false)
  })

  it('generic CSV → 假；只有 taskId 没有 parentId → 假', () => {
    expect(detectTickTickCsv(parseCsv('标题,清单\n买牛奶,生活\n'))).toBe(false)
    const noParent = [...TICKTICK_HEADER.slice(0, -1), 'id'].join(',')
    expect(detectTickTickCsv(parseCsv(noParent))).toBe(false)
  })
})

// ---------- 纯函数：时区换算收口 ----------

describe('tsToLocalDate / tsToLocalStamp（时区换算收口）', () => {
  it('UTC 串日期≠本地日期：T16:00:00+0000 + Asia/Shanghai → 次日', () => {
    expect(tsToLocalDate('2025-01-15T16:00:00+0000', 'Asia/Shanghai', false)).toBe('2025-01-16')
  })

  it('全天任务：同样按时区换算（真实导出实证：本地午夜=UTC 前日 16:00）', () => {
    // 本地 2025-01-15 00:00 = UTC 2025-01-14T16:00:00+0000（滴答全天任务的导出形态）
    expect(tsToLocalDate('2025-01-14T16:00:00+0000', 'Asia/Shanghai', false)).toBe('2025-01-15')
    expect(tsToLocalDate('2025-01-15T00:00:00+0000', 'Asia/Shanghai', false)).toBe('2025-01-15')
    expect(tsToLocalDate('2025-01-15T23:00:00+0000', 'Asia/Shanghai', false)).toBe('2025-01-16')
  })

  it('浮动任务（isFloating）：纯日期意图，取串的日期部分不换算', () => {
    expect(tsToLocalDate('2025-02-01T23:00:00+0000', 'Asia/Shanghai', true)).toBe('2025-02-01')
    expect(tsToLocalDate('2025-02-01', 'Asia/Shanghai', true)).toBe('2025-02-01')
  })

  it('UTC 时区取 UTC 日期；Z 后缀与 ±HHMM 偏移形态均可解析', () => {
    expect(tsToLocalDate('2025-01-15T22:00:00+0000', 'UTC', false)).toBe('2025-01-15')
    expect(tsToLocalDate('2025-01-15T03:00:00Z', 'America/New_York', false)).toBe('2025-01-14')
    expect(tsToLocalDate('2025-01-15T02:30:00+0800', 'Asia/Shanghai', false)).toBe('2025-01-15')
  })

  it('date-only 原样返回；空/坏值返回 null；非法时区退回本地时区（只验形态）', () => {
    expect(tsToLocalDate('2025-01-15', 'Asia/Shanghai', false)).toBe('2025-01-15')
    expect(tsToLocalDate('', 'Asia/Shanghai', false)).toBeNull()
    expect(tsToLocalDate('not-a-date', 'Asia/Shanghai', false)).toBeNull()
    expect(tsToLocalDate('2025-01-15T10:00:00+0000', 'Mars/Phobos', false)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('tsToLocalStamp：带偏移的本地时刻串（对齐 backend now() 形态）', () => {
    expect(tsToLocalStamp('2025-01-13T06:30:00+0000', 'Asia/Shanghai')).toBe('2025-01-13 14:30:00+08:00')
    expect(tsToLocalStamp('2025-01-13T06:30:00+0000', 'UTC')).toBe('2025-01-13 06:30:00+00:00')
    expect(tsToLocalStamp('2025-01-13', 'UTC')).toBe('2025-01-13 00:00:00')
    expect(tsToLocalStamp('2025-01-13T06:30:00+0000', undefined)).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
    )
    expect(tsToLocalStamp('garbage', 'UTC')).toBeNull()
  })
})

// ---------- 双驱动：端到端导入 ----------

for (const d of drivers) {
  describe(`滴答清单 CSV 导入 [${d.name}]`, () => {
    it('全形态 fixture：路由、计数、字段透传、时区、RRULE 矩阵、折叠、行号、警告', async () => {
      const ctx = await d.open()
      try {
        const counter = countBusyRecompute(ctx)
        const r = importTodosCsvOnBackend(ctx.backend, TICKTICK_FIXTURE)

        // 路由与计数：20 数据行 − 重复折叠 1 − 缺标题 1 = 18；清单 3（工作/收件箱/个人）
        expect(r.source).toBe('ticktick')
        expect(r.inserted).toBe(18)
        expect(r.lists_created).toBe(3)
        expect(r.errors).toHaveLength(2)
        expect(r.warnings).toHaveLength(13)

        // 忙度重算：全部插入完成后一次（逐行 createTodo 会是 18 次）
        expect(counter.calls()).toBe(1)

        const todos = ctx.backend.getTodos({ status: 'all' })
        expect(todos).toHaveLength(18)

        // Status -1 / 未知状态：按未开始导入 + warning（智者终审 C3，与未知优先级对称）
        const abandoned = todos.find((x) => x.title === '已放弃事项')
        expect(abandoned?.status).toBe('notStarted')
        expect(r.warnings.some((w) => w.includes('已放弃') && w.includes('按未开始'))).toBe(true)
        const unknownStatus = todos.find((x) => x.title === '未知状态事项')
        expect(unknownStatus?.status).toBe('notStarted')
        expect(r.warnings.some((w) => w.includes('未知状态「x」'))).toBe(true)

        // created_at / completed_at / sort_order 透传真落库（时区换算到 Asia/Shanghai）
        const weekly = byTitle(todos, '写周报')
        expect(weekly.status).toBe('completed')
        expect(weekly.importance).toBe('high')
        expect(weekly.repeat).toBe('weekdays')
        expect(weekly.due_date).toBe('2025-01-12') // 全天 00:00 UTC +08 → 同日 08:00 本地
        expect(weekly.tags).toEqual(['重点'])
        expect(weekly.body).toBe('▫ 起草大纲\n▪ 定稿发送') // 多行 Content 原样并入
        expect(weekly.created_at).toBe('2024-12-30 10:00:00+08:00')
        expect(weekly.completed_at).toBe('2025-01-13 14:30:00+08:00')
        expect(weekly.sort_order).toBe(-1099511627776)

        // 直查 todo 表字面行：三样透传字段确实落库（不经过 backend 门面映射）
        const rawRow = ctx.rawAll(
          "SELECT created_at, completed_at, sort_order FROM todo WHERE title = '写周报'",
        )[0]!
        expect(rawRow).toMatchObject({
          created_at: '2024-12-30 10:00:00+08:00',
          completed_at: '2025-01-13 14:30:00+08:00',
          sort_order: -1099511627776,
        })

        // 时区换算：非全天 UTC 串 + Asia/Shanghai → 次日
        const crossDay = byTitle(todos, '跨日核对')
        expect(crossDay.start_date).toBe('2025-01-16')
        expect(crossDay.due_date).toBe('2025-01-16')
        expect(crossDay.created_at).toBe('2025-01-02 11:00:00+08:00')

        // 子任务：独立 todo + 「↳ 」前缀，无系统标签
        const sub = byTitle(todos, '↳ 确认结论')
        expect(sub.tags).toBeNull()
        expect(sub.list_id).toBe(weekly.list_id)

        // 孤儿 parentId 照常导入；空 List Name → 收件箱
        const orphan = byTitle(todos, '↳ 孤儿跟进')
        const lists = ctx.backend.getTodoLists().map((l) => l.display_name)
        expect(lists).toContain('收件箱')
        expect(ctx.backend.getTodos({ list_id: orphan.list_id })[0]!.title).toBe('↳ 孤儿跟进')

        // Status 2 → 已完成 + warning；DAILY;INTERVAL=1 → daily
        const archived = byTitle(todos, '旧习惯')
        expect(archived.status).toBe('completed')
        expect(archived.repeat).toBe('daily')
        expect(archived.completed_at).toBe('2024-11-02 18:00:00+08:00')

        // Priority：1→low、0→normal（不映 low）、3→normal、5→high（写周报已验）
        expect(byTitle(todos, '每周例会').importance).toBe('low')
        expect(byTitle(todos, '浮动事项').importance).toBe('normal')
        expect(byTitle(todos, '跨日核对').importance).toBe('normal')

        // RRULE 矩阵：未迁移 → repeat=null + 备注行；周末 RRULE 绝不映成 weekdays
        expect(byTitle(todos, '周末巡查').repeat).toBeNull()
        expect(byTitle(todos, '三天周期').repeat).toBeNull()
        expect(byTitle(todos, '每周例会').repeat).toBe('weekly')
        for (const title of ['月度整理', '隔日打卡', '月末检查', '十次训练', '三天周期', '周末巡查', '间隔双周']) {
          const t = byTitle(todos, title)
          expect(t.repeat, title).toBeNull()
          expect(t.body ?? '', title).toContain('重复（未迁移）：RRULE:')
        }
        expect(byTitle(todos, '月度整理').body).toBe('重复（未迁移）：RRULE:FREQ=MONTHLY')

        // 浮动：只取日期部分
        expect(byTitle(todos, '浮动事项').due_date).toBe('2025-02-01')

        // 坏日期行仍导入（无截止日）
        expect(byTitle(todos, '坏日期').due_date).toBeNull()

        // errors 定位到 CSV 物理行号（含 preamble 与多行字段的位移）
        expect(fixtureLineOf['写周报']).toBe(FIXTURE_HEADER_LINE + 1) // 首个数据行
        expect(r.errors.some((e) => e.includes(`第${fixtureLineOf['坏日期']}行`))).toBe(true)
        expect(r.errors.some((e) => e.includes(`第${fixtureLineOf['缺标题']}行`) && e.includes('缺少标题'))).toBe(true)

        // warnings：文件夹聚合一条 + 归档 + 未知优先级 + taskId 折叠 + 7 条 RRULE
        expect(r.warnings).toContain('2 个文件夹分组未迁移')
        expect(r.warnings.some((w) => w.includes(`第${fixtureLineOf['重复行']}行`) && w.includes('task-2'))).toBe(true)
        expect(r.warnings.some((w) => w.includes(`第${fixtureLineOf['旧习惯']}行`) && w.includes('已归档'))).toBe(true)
        expect(r.warnings.some((w) => w.includes('未知优先级「2」'))).toBe(true)
      } finally {
        ctx.close()
      }
    }, 15_000)

    it('\\uFFFD 替换符 → 整体拒绝导入并报「文件编码需为 UTF-8，请重新导出」', async () => {
      const ctx = await d.open()
      try {
        const r = importTickTickCsvOnBackend(ctx.backend, GARBLED_ENCODING_SAMPLE)
        expect(r.inserted).toBe(0)
        expect(r.source).toBe('ticktick')
        expect(r.errors).toEqual(['文件编码需为 UTF-8，请重新导出'])
        expect(r.warnings).toEqual([])
        expect(ctx.backend.getTodos({ status: 'all' })).toHaveLength(0)
      } finally {
        ctx.close()
      }
    }, 15_000)

    it('generic 路径行为不变：source=generic、warnings 恒空', async () => {
      const ctx = await d.open()
      try {
        const r = importTodosCsvOnBackend(ctx.backend, '标题,清单,截止\n买牛奶,生活,2026-09-10\n')
        expect(r.source).toBe('generic')
        expect(r.inserted).toBe(1)
        expect(r.lists_created).toBe(1)
        expect(r.warnings).toEqual([])
        expect(r.errors).toEqual([])
      } finally {
        ctx.close()
      }
    }, 15_000)
  })
}

// ---------- 性能验收（node 驱动；sql.js WASM 不承担 2s 指标） ----------

describe('滴答清单导入性能 [node better-sqlite3]', () => {
  it('5000 行合成 CSV 导入 ≤2s，忙度重算调用次数=1', async () => {
    const ctx = await openNode()
    try {
      const counter = countBusyRecompute(ctx)
      const csv = buildPerfCsv(5000)
      const t0 = performance.now()
      const r = importTodosCsvOnBackend(ctx.backend, csv)
      const ms = performance.now() - t0
      console.info(`[perf] 滴答清单 5000 行合成 CSV 导入耗时：${ms.toFixed(1)}ms（验收上限 2000ms）`)
      expect(r.source).toBe('ticktick')
      expect(r.inserted).toBe(5000)
      expect(r.lists_created).toBe(10)
      expect(counter.calls()).toBe(1)
      expect(ms).toBeLessThan(2000)
    } finally {
      ctx.close()
    }
  }, 30_000)
})
