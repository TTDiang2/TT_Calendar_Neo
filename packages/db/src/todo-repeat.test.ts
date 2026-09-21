/**
 * 重复待办完成转化 —— HANDOFF-repeat-to-neo §4 生成逻辑的端到端行为：
 * 本地完成生成下一期、字段继承/位移平移、同步导入不触发（防双生）、未知档位透传。
 */

import { describe, expect, it } from 'vitest'

import { isWorkday } from '@tt-calendar/domain'
import { openDb, SqliteBackend, SyncService } from './index'

function freshBackend() {
  const { db } = openDb({ path: ':memory:' })
  const backend = new SqliteBackend(db)
  const sync = new SyncService(db)
  return { backend, sync }
}

/** 相对今天的 YYYY-MM-DD（本地时区），delta 为负表过去 */
function addDaysStr(delta: number): string {
  const d = new Date()
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('重复待办：本地完成生成下一期', () => {
  it('daily：完成后克隆下一期，due/start 按相同位移平移，其余字段继承', () => {
    const { backend } = freshBackend()
    const list = backend.createTodoList('工作')
    const t = backend.createTodo({
      list_id: list.id,
      title: '站会',
      body: '同步进展',
      importance: 'high',
      due_date: addDaysStr(-4),
      planned_date: addDaysStr(-3), // 拖了 3 天才点完成
      start_date: addDaysStr(-10),
      tags: ['日常'],
      alarm_at: '2026-09-25T08:00',
      repeat: 'daily',
    })

    const done = backend.updateTodo(t.id, { status: 'completed' })
    expect(done?.status).toBe('completed')
    expect(done?.completed_at).toBeTruthy()

    const all = backend.getTodos({ status: 'all' })
    expect(all).toHaveLength(2)
    const next = all.find((x) => x.id !== t.id)!
    // 补卡语义：下一期严格晚于完成日（跳过错过的期），位移 = next - planned
    expect(next.planned_date).toBe(addDaysStr(1))
    expect(next.due_date).toBe(addDaysStr(0))
    expect(next.start_date).toBe(addDaysStr(-6))
    expect(next.status).toBe('notStarted')
    expect(next.completed_at).toBeNull()
    expect(next.title).toBe('站会')
    expect(next.body).toBe('同步进展')
    expect(next.list_id).toBe(list.id)
    expect(next.importance).toBe('high')
    expect(next.tags).toEqual(['日常'])
    expect(next.alarm_at).toBe('2026-09-25T08:00')
    expect(next.repeat).toBe('daily')
    expect(next.id).not.toBe(t.id)
  })

  it('weekly：保持星期几不变（+7 天）；weekdays：落在工作日', () => {
    const { backend } = freshBackend()
    const list = backend.createTodoList('生活')
    const w = backend.createTodo({ list_id: list.id, title: '周清理', planned_date: addDaysStr(0), repeat: 'weekly' })
    const wd = backend.createTodo({ list_id: list.id, title: '工作日打卡', planned_date: addDaysStr(0), repeat: 'weekdays' })

    backend.updateTodo(w.id, { status: 'completed' })
    backend.updateTodo(wd.id, { status: 'completed' })

    const all = backend.getTodos({ status: 'all', sort: 'created' })
    const wNext = all.find((x) => x.id !== w.id && x.title === '周清理')!
    const wdNext = all.find((x) => x.id !== wd.id && x.title === '工作日打卡')!
    // weekly 恒 +7；weekdays 的候选从明天起取第一个工作日（假期顺延语义已在
    // domain/todo-repeat.test.ts 用 4.4 向量 + 节假日数据单独对拍，这里只验接线）
    expect(wNext.planned_date).toBe(addDaysStr(7))
    expect(wdNext.planned_date! > addDaysStr(0)).toBe(true)
    expect(isWorkday(wdNext.planned_date!)).toBe(true)
  })

  it('非完成态更新 / 重复完成幂等 / 无 planned / 未知档位：都不生成', () => {
    const { backend } = freshBackend()
    const list = backend.createTodoList('工作')
    const mk = (repeat: string | null, planned: string | null = addDaysStr(0)) =>
      backend.createTodo({ list_id: list.id, title: `t-${repeat}-${planned}`, repeat, planned_date: planned })

    const a = mk('daily')
    backend.updateTodo(a.id, { title: '改名' })
    expect(backend.getTodos({ status: 'all' })).toHaveLength(1)

    const b = mk('daily')
    backend.updateTodo(b.id, { status: 'completed' })
    backend.updateTodo(b.id, { status: 'completed' }) // 再点一次：无状态迁移，不双生
    expect(backend.getTodos({ status: 'all' })).toHaveLength(3)

    const c = mk('daily', null) // 无 planned_date：算不出下一期，不生成
    backend.updateTodo(c.id, { status: 'completed' })
    expect(backend.getTodos({ status: 'all' })).toHaveLength(4)

    const d = mk('every-blue-moon') // 未知档位：原样透传、不生成
    const done = backend.updateTodo(d.id, { status: 'completed' })
    expect(done?.repeat).toBe('every-blue-moon')
    expect(backend.getTodos({ status: 'all' })).toHaveLength(5)

    // updateTodo 改档位 / 清除档位照常工作
    const e = mk('daily')
    backend.updateTodo(e.id, { repeat: 'weekly' })
    expect(backend.getTodos({ status: 'all' }).find((x) => x.id === e.id)?.repeat).toBe('weekly')
    backend.updateTodo(e.id, { repeat: null })
    expect(backend.getTodos({ status: 'all' }).find((x) => x.id === e.id)?.repeat).toBeNull()
  })

  it('同步导入的已完成重复行不触发生成（§4.1 防双生）', () => {
    const { backend, sync } = freshBackend()
    const remote = {
      todo: [
        {
          id: 'remote-repeat-1',
          list_id: 'L1',
          title: '老端建好的重复待办',
          status: 'completed',
          importance: 'normal',
          complexity: 'medium',
          planned_date: addDaysStr(-2),
          repeat: 'daily',
          completed_at: '2026-09-20 10:00:00',
          sort_order: 0,
        },
      ],
    }
    sync.syncWith(null, remote as never, { base: {}, remote: {}, local: {} }, 'merge')
    // 只有导入的那一行，没有端内生成的下一期
    const all = backend.getTodos({ status: 'all' })
    expect(all).toHaveLength(1)
    expect(all[0]?.status).toBe('completed')
    expect(all[0]?.repeat).toBe('daily')
  })
})
