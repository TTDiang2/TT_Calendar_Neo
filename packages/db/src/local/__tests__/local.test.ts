/**
 * 本地（sql.js WASM）后端测试 —— 在 Node 里跑，验证三件事：
 *  1. shim 与 better-sqlite3 行为等价（run/all/get/raw/transaction）
 *  2. SqliteBackend 业务代码在 shim 上原样工作（CRUD + 视图聚合）
 *  3. 快照持久化回路：导出 → 重新打开 → 数据还在
 */

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { openLocalDb, type LocalDbHandle, type SnapshotStorage } from '../backend'
import { SqlJsSqlite } from '../sqlite-shim'

const require = createRequire(import.meta.url)

async function openInMemory(): Promise<LocalDbHandle> {
  const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
  return openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
}

/** 内存快照存储，模拟 IndexedDB */
function memoryStorage(): SnapshotStorage & { bytes: Uint8Array | null } {
  const box: { bytes: Uint8Array | null } = { bytes: null }
  return {
    get bytes() {
      return box.bytes
    },
    async get() {
      return box.bytes
    },
    async put(b: Uint8Array) {
      box.bytes = b
    },
  }
}

describe('sql.js shim 基础行为', () => {
  it('run 返回 changes/lastInsertRowid；all/get/raw 与 better-sqlite3 语义一致', async () => {
    const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
    const s = await SqlJsSqlite.open({ wasmBinary })
    s.exec(`
      CREATE TABLE t(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, n INTEGER);
    `)
    const st = s.prepare('INSERT INTO t(name, n) VALUES (?, ?)')
    const r1 = st.run('a', 1)
    expect(r1.changes).toBe(1)
    expect(Number(r1.lastInsertRowid)).toBe(1)
    const r2 = st.run('b', 2)
    expect(Number(r2.lastInsertRowid)).toBe(2)

    const q = s.prepare('SELECT id, name, n FROM t WHERE n > ? ORDER BY id')
    expect(q.all(0)).toEqual([
      { id: 1, name: 'a', n: 1 },
      { id: 2, name: 'b', n: 2 },
    ])
    expect(q.all(1)).toEqual([{ id: 2, name: 'b', n: 2 }])
    expect(q.get(0)).toEqual({ id: 1, name: 'a', n: 1 })
    expect(q.get(99)).toBeUndefined()

    // 重复使用同一 prepared statement（drizzle 复用查询对象）
    expect(q.all(0).length).toBe(2)

    const raw = q.raw()
    expect(raw.all(0)).toEqual([[1, 'a', 1], [2, 'b', 2]])
    expect(raw.get(0)).toEqual([1, 'a', 1])

    // undefined 参数归一化为 null
    const ins = s.prepare('INSERT INTO t(name, n) VALUES (?, ?)')
    expect(() => ins.run('c', undefined as unknown as number)).not.toThrow()
    expect(s.prepare('SELECT n FROM t WHERE name = ?').get('c')).toEqual({ n: null })
  })

  it('transaction 包装函数：成功提交 / 异常回滚', async () => {
    const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
    const s = await SqlJsSqlite.open({ wasmBinary })
    s.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT)')
    const tx = s.transaction((a: string, b: string) => {
      s.prepare('INSERT INTO t VALUES (1, ?)').run(a)
      s.prepare('INSERT INTO t VALUES (2, ?)').run(b)
      return 'ok'
    })
    expect(tx('x', 'y')).toBe('ok')
    expect(s.prepare('SELECT count(*) AS c FROM t').get()).toEqual({ c: 2 })

    const bad = s.transaction(() => {
      s.prepare('INSERT INTO t VALUES (3, ?)').run('z')
      throw new Error('boom')
    })
    expect(() => bad()).toThrow('boom')
    expect(s.prepare('SELECT count(*) AS c FROM t').get()).toEqual({ c: 2 })
  })
})

describe('openLocalDb + SqliteBackend 端到端', () => {
  it('图层/事件 CRUD + 月视图聚合在 shim 上工作', async () => {
    const h = await openInMemory()
    const be = h.backend

    const layer = be.createLayer({ display_name: '测试图层', color: '#ff0000' })
    expect(layer.display_name).toBe('测试图层')

    const ev = be.createEvent({
      layer_id: layer.layer_id,
      source: 'manual',
      date: '2026-09-10',
      title: '测试事件',
      color: null,
      description: null,
      source_ref: null,
      sort_key: 0,
      extra: {},
    })
    expect(ev.id).toBeGreaterThan(0)

    const month = be.getView('month', '2026-9') as {
      days: { date: string; events_by_layer: Record<string, { title: string }[]> }[]
    }
    const day = month.days.find((d) => d.date === '2026-09-10')
    expect(day).toBeDefined()
    const evs = Object.values(day!.events_by_layer).flat()
    expect(evs.some((e) => e.title === '测试事件')).toBe(true)

    // 待办
    const list = be.createTodoList('清单A')
    const todo = be.createTodo({ list_id: list.id, title: '买牛奶', importance: 'high' })
    expect(todo.id).toBeTruthy()
    const todos = be.getTodos({ list_id: list.id })
    expect(todos).toHaveLength(1)
    be.updateTodo(todo.id, { status: 'completed' })
    expect(be.getTodoStats(list.id)).toEqual({ total: 1, incomplete: 0, completed: 1 })

    // 日程 + 涂色标记 + moveDay
    be.createScheduleItem({ date: '2026-09-10', title: '开会', start_time: '10:00', end_time: null, color: null, sort_order: 0, category: 'work' })
    expect(be.getScheduleItems('2026-09-10')).toHaveLength(1)
    be.upsertMark(layer.layer_id, '2026-09-11', 3, '备注')
    const moved = be.moveDay('2026-09-10', '2026-09-12')
    expect(moved.moved_events).toBe(1)
    expect(be.getView('month', '2026-9') as unknown).toBeDefined()

    h.sqlite.close()
  })

  it('快照持久化回路：flush → 重新打开 → 数据完整', async () => {
    const storage = memoryStorage()
    const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))

    const h1 = await openLocalDb({ wasmBinary, autosaveMs: 0, storage })
    const layer = h1.backend.createLayer({ display_name: '持久化图层' })
    h1.backend.createEvent({
      layer_id: layer.layer_id,
      source: 'manual',
      date: '2026-01-02',
      title: '跨会话事件',
      color: null,
      description: null,
      source_ref: null,
      sort_key: 0,
      extra: {},
    })
    h1.backend.setMeta('hello', 'world')
    await h1.flush()
    expect(storage.bytes).toBeInstanceOf(Uint8Array)
    expect(storage.bytes!.byteLength).toBeGreaterThan(0)
    h1.sqlite.close()

    const h2 = await openLocalDb({ wasmBinary, autosaveMs: 0, storage })
    const layers = h2.backend.getLayers()
    expect(layers.some((l) => l.display_name === '持久化图层')).toBe(true)
    expect(h2.backend.getMeta('hello')).toBe('world')
    const month = h2.backend.getView('month', '2026-1') as {
      days: { date: string; events_by_layer: Record<string, { title: string }[]> }[]
    }
    const day = month.days.find((d) => d.date === '2026-01-02')
    expect(Object.values(day!.events_by_layer).flat().some((e) => e.title === '跨会话事件')).toBe(true)
    h2.sqlite.close()
  })
})
