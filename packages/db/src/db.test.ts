import { describe, expect, it } from 'vitest'

import type { MonthData } from '@tt-calendar/contracts'
import { merge, tombKey } from '@tt-calendar/domain'
import { openDb, SqliteBackend, SyncService } from './index'

function freshBackend() {
  const { db } = openDb({ path: ':memory:' })
  const backend = new SqliteBackend(db)
  const sync = new SyncService(db)
  return { backend, sync }
}

describe('SqliteBackend 基本读写（内存库）', () => {
  it('待办：建清单 → 增改查 → 统计', () => {
    const { backend } = freshBackend()
    const list = backend.createTodoList('工作')
    expect(backend.getTodoLists().map((l) => l.display_name)).toEqual(['工作'])

    const t = backend.createTodo({
      list_id: list.id,
      title: '写周报',
      importance: 'high',
      due_date: '2026-09-04',
      tags: ['周更'],
    })
    expect(t.id).toBeTruthy()
    expect(t.tags).toEqual(['周更'])
    expect(backend.getTodoStats().total).toBe(1)

    const done = backend.updateTodo(t.id, { status: 'completed' })
    expect(done?.status).toBe('completed')
    expect(done?.completed_at).toBeTruthy()
    expect(backend.getTodoStats().completed).toBe(1)
    expect(backend.getTodos({ status: 'notStarted' })).toEqual([])

    expect(backend.deleteTodo(t.id).ok).toBe(true)
    expect(backend.getTodoStats().total).toBe(0)
  })

  it('事件与视图聚合：月视图返回 42 天', () => {
    const { backend } = freshBackend()
    backend.createLayer({ display_name: '重要', kind: 'dot', config: {} })
    backend.createEvent({
      layer_id: 'important',
      source: 'manual',
      date: '2026-09-10',
      title: '发布会',
      description: null,
      color: null,
      extra: {},
      source_ref: null,
      sort_key: 0,
    } as never)
    const view = backend.getView('month', '2026-9') as MonthData
    expect(view.days).toHaveLength(42)
    const day = view.days.find((d) => d.date === '2026-09-10')
    expect(day?.events_by_layer['important']).toHaveLength(1)
    expect(day?.events_by_layer['important']![0]!.title).toBe('发布会')
  })

  it('日/周视图与搜索', () => {
    const { backend } = freshBackend()
    backend.createEvent({
      layer_id: 'important',
      source: 'manual',
      date: '2026-09-02',
      title: '特殊事件 XYZ',
      description: null,
      color: null,
      extra: {},
      source_ref: null,
      sort_key: 0,
    } as never)
    const day = backend.getView('day', '2026-09-02') as MonthData
    expect(day.days).toHaveLength(1)
    const week = backend.getView('week', '2026-09-02') as MonthData
    expect(week.days).toHaveLength(7)
    expect(backend.searchEvents('XYZ')).toHaveLength(1)
    expect(backend.searchEvents('不存在')).toEqual([])
  })

  it('忙度重算写入 day_busy', () => {
    const { backend } = freshBackend()
    const list = backend.createTodoList('默认')
    backend.createTodo({ list_id: list.id, title: '重活', importance: 'high', due_date: '2026-09-04', complexity: 'hard' })
    const r = backend.recomputeTodoBusy()
    expect(r.days_written).toBe(181) // -60 .. +120
  })

  it('统计面板：四象限 + 逐日完成', () => {
    const { backend } = freshBackend()
    const list = backend.createTodoList('默认')
    backend.createTodo({ list_id: list.id, title: '未完成', importance: 'high', due_date: '2026-09-10' })
    const t2 = backend.createTodo({ list_id: list.id, title: '已完成' })
    backend.updateTodo(t2.id, { status: 'completed' })
    const s = backend.getStatsSummary()
    expect(s.quadrant).toHaveLength(1)
    expect(s.quadrant[0]!.days_to_due).not.toBeNull()
    expect(s.stats).toEqual({ total: 2, incomplete: 1, completed: 1 })
    expect(s.daily_done.length).toBeGreaterThanOrEqual(0)
    expect(s.list_names && Object.values(s.list_names)).toContain('默认')
  })

  it('倒数日 CRUD + 文本', () => {
    const { backend } = freshBackend()
    const c = backend.createCountdown({
      name: '生日',
      category: '生日',
      base_date: '2020-01-01',
      repeat_yearly: true,
      repeat_type: 'solar',
      milestone_rule: null,
      never_expire: false,
      notes: null,
      color: null,
      sort_order: 0,
    })
    expect(backend.getCountdownList()).toHaveLength(1)
    backend.updateCountdown(c.id, { name: '我生日' })
    expect(backend.getCountdownList()[0]!.name).toBe('我生日')
    expect(typeof backend.getCountdownText().text).toBe('string')
    expect(backend.deleteCountdown(c.id).ok).toBe(true)
  })

  it('涂色与充实度', () => {
    const { backend } = freshBackend()
    const layer = backend.createLayer({ display_name: '健身', kind: 'color', config: { mode: 'solid', color: '#ff8800' } })
    backend.upsertMark(layer.layer_id, '2026-09-02', 2, '练背')
    backend.upsertMark(layer.layer_id, '2026-09-02', 3, null) // 二次写覆盖
    backend.upsertColoring('2026-09-02', 4)
    const view = backend.getView('day', '2026-09-02') as MonthData
    expect(view.days[0]!.coloring_level).toBe(4)
    expect(view.days[0]!.marks).toHaveLength(1)
    expect(backend.deleteColoring('2026-09-02').ok).toBe(true)
  })
})

describe('SyncService（纯数据面三方合并落库）', () => {
  it('LWW 合并：远端新 → 拉取覆盖本地', () => {
    const { backend, sync } = freshBackend()
    const list = backend.createTodoList('L')
    const t = backend.createTodo({ list_id: list.id, title: '旧' })
    const localSnap = sync.exportSnapshot()

    // 模拟远端修改了 title 且 updated_at 更晚
    const remoteSnap = structuredClone(localSnap)
    const remoteTodo = (remoteSnap.todo as Record<string, unknown>[]).find((r) => r.id === t.id)!
    remoteTodo['title'] = '新'
    remoteTodo['updated_at'] = '2099-01-01 00:00:00'

    const r = sync.syncWith(localSnap, remoteSnap, { base: {}, remote: {}, local: {} }, 'merge')
    expect(r.report.pulled).toBe(1)
    const after = backend.getTodos({ status: 'all' })
    expect(after.find((x) => x.id === t.id)?.title).toBe('新')
  })

  it('本地删除 → 墓碑传播：行消失 + 墓碑写回', () => {
    const { backend, sync } = freshBackend()
    const list = backend.createTodoList('L')
    const t = backend.createTodo({ list_id: list.id, title: '要删的' })
    const baseSnap = sync.exportSnapshot()

    // 本地删除（backend 写墓碑）
    backend.deleteTodo(t.id)
    const localTombs = sync.exportTombstones()
    expect(Object.keys(localTombs)).toContain(tombKey('todo', t.id))

    const r = sync.syncWith(baseSnap, baseSnap, { base: {}, remote: {}, local: localTombs }, 'merge')
    // 行在 base+remote 都存在而本地没有 → 以「本地无此行」推送（墓碑裁决交给 tombstones）
    expect((r.merged.todo as unknown[]).find((x) => (x as Record<string, unknown>).id === t.id)).toBeUndefined()
    expect(Object.keys(r.tombstones)).toContain(tombKey('todo', t.id))
  })

  it('pull_overwrite 首绑：远端是唯一事实（协议冻结语义）', () => {
    const { backend, sync } = freshBackend()
    const list = backend.createTodoList('L')
    backend.createTodo({ list_id: list.id, title: '本地独有' })
    const remote: Record<string, unknown[]> = {
      todo: [{ id: 'r1', list_id: 'x', title: '远端', status: 'notStarted', importance: 'normal', sort_order: 0, complexity: 'medium' }],
      todo_list: [],
      layer_config: [],
      meta: [],
      schedule: [],
      coloring: [],
      events: [],
      schedule_items: [],
      countdown: [],
      marks: [],
      subscriptions: [],
    }
    const r = sync.syncWith(null, remote as never, { base: {}, remote: {}, local: {} }, 'pull_overwrite')
    expect(r.report.pulled).toBe(1)
    // 本地独有的 todo 行 + todo_list 行都按协议被删（远端整表为空也照删）
    expect(r.report.deleted).toBe(2)
    expect(backend.getTodos({ status: 'all' }).map((t) => t.title)).toEqual(['远端'])
  })

  it('与 domain.merge 直接对拍一致（本地快照对齐）', () => {
    const { backend, sync } = freshBackend()
    const list = backend.createTodoList('L')
    backend.createTodo({ list_id: list.id, title: 'x', due_date: null })
    const localSnap = sync.exportSnapshot()
    const baseSnap = structuredClone(localSnap)
    const remoteSnap = structuredClone(localSnap)
    const row = (remoteSnap.todo as Record<string, unknown>[])[0]!
    row['title'] = 'y'
    row['updated_at'] = '2099-01-01 00:00:00'

    const direct = merge(baseSnap, remoteSnap, localSnap)
    const r = sync.syncWith(baseSnap, remoteSnap, { base: {}, remote: {}, local: {} }, 'merge')
    expect(r.report).toEqual(direct.report)
  })
})
