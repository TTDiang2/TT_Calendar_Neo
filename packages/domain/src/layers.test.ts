import { describe, expect, it } from 'vitest'

import type { CalEvent, JsonRecord } from '@tt-calendar/contracts'
import {
  AUTO_COLOR_LAYER_IDS,
  canManuallyColor,
  isScheduleLayer,
} from '@tt-calendar/contracts'
import {
  applySubscriptionSwitch,
  buildDayMarks,
  colorLayersOf,
  customLayerColor,
  eventPassesLayerFilter,
  groupEventsByLayer,
  manuallyColorableLayers,
} from './layers'
import type { LayerLike } from './layers'
import type { Mark, Todo } from '@tt-calendar/contracts'

describe('isScheduleLayer（红线 4：依据 config.category，而非 layer_id 前缀）', () => {
  it('dot + 日程类目 → 日程', () => {
    expect(isScheduleLayer({ kind: 'dot', config: { category: 'work' } })).toBe(true)
    expect(isScheduleLayer({ kind: 'dot', config: { category: 'course' } })).toBe(true)
  })

  it('dot + 未知类目 → 不是日程', () => {
    expect(isScheduleLayer({ kind: 'dot', config: { category: 'birthday' } })).toBe(false)
    expect(isScheduleLayer({ kind: 'dot', config: {} })).toBe(false)
  })

  it('非 dot kind 一律不是日程', () => {
    expect(isScheduleLayer({ kind: 'color', config: { category: 'work' } })).toBe(false)
    expect(isScheduleLayer({ kind: null, config: { category: 'work' } })).toBe(false)
  })
})

describe('自动涂色图层红线（红线 2）', () => {
  it('AUTO_COLOR_LAYER_IDS 覆盖 holiday/important/todo/todo_done', () => {
    expect(AUTO_COLOR_LAYER_IDS).toEqual(['holiday', 'important', 'todo', 'todo_done'])
  })

  it('自动图层不可手动涂色，自定义图层可以', () => {
    expect(canManuallyColor('holiday')).toBe(false)
    expect(canManuallyColor('todo')).toBe(false)
    expect(canManuallyColor('habit_gym')).toBe(true)
  })

  it('manuallyColorableLayers 过滤自动图层与禁用图层', () => {
    const layers: LayerLike[] = [
      { layer_id: 'todo', display_name: 'todo', enabled: true },
      { layer_id: 'habit_gym', display_name: '健身', enabled: true },
      { layer_id: 'habit_read', display_name: '读书', enabled: false },
    ]
    expect(manuallyColorableLayers(layers).map((l) => l.layer_id)).toEqual(['habit_gym'])
  })

  it('colorLayersOf 只要启用且 kind=color/缺省', () => {
    const layers: LayerLike[] = [
      { layer_id: 'a', display_name: 'a', enabled: true, kind: 'color', config: { color: '#ff0000' } },
      { layer_id: 'b', display_name: 'b', enabled: true, config: { color: '#00ff00' } },
      { layer_id: 'c', display_name: 'c', enabled: false, kind: 'color' },
      { layer_id: 'd', display_name: 'd', enabled: true, kind: 'dot' },
    ]
    expect(colorLayersOf(layers).map((l) => l.layer_id)).toEqual(['a', 'b'])
  })
})

describe('applySubscriptionSwitch', () => {
  const layers: LayerLike[] = [
    { layer_id: 'jisilu_a', display_name: 'A', enabled: true, group: '集思录' },
    { layer_id: 'jisilu_b', display_name: 'B', enabled: true, group: '集思录' },
    { layer_id: 'other', display_name: 'C', enabled: true, group: '个人' },
  ]

  it('关闭订阅 → 名下整组图层退出', () => {
    const [filtered, removed] = applySubscriptionSwitch(layers, [
      { display_name: '集思录', enabled: false },
    ])
    expect(filtered.map((l) => l.layer_id)).toEqual(['other'])
    expect(removed).toEqual(new Set(['jisilu_a', 'jisilu_b']))
  })

  it('全部开启 → 原样返回', () => {
    const [filtered, removed] = applySubscriptionSwitch(layers, [
      { display_name: '集思录', enabled: true },
      { display_name: '个人', enabled: true },
    ])
    expect(filtered).toHaveLength(3)
    expect(removed.size).toBe(0)
  })
})

describe('eventPassesLayerFilter（sub_qtypes 过滤，与 Python 逐字一致）', () => {
  const ev = (title: string, qtype?: string): CalEvent =>
    ({
      date: '2026-09-02',
      layer_id: 'jisilu',
      title,
      extra: qtype ? { qtype } : {},
    }) as CalEvent

  it('config 无 sub_qtypes 键 → 全通过', () => {
    expect(eventPassesLayerFilter(ev('任意', 'x'), {})).toBe(true)
    expect(eventPassesLayerFilter(ev('任意', 'x'), undefined)).toBe(true)
  })

  it('sub_qtypes 空数组 → 不过滤', () => {
    expect(eventPassesLayerFilter(ev('任意', 'x'), { sub_qtypes: [] })).toBe(true)
  })

  it('事件无 qtype → 不归集思录层控制，直接通过', () => {
    expect(eventPassesLayerFilter(ev('手工事件'), { sub_qtypes: [{ qtype: 'new' }] })).toBe(true)
  })

  it('sub_action 空 → 该 qtype 全通过', () => {
    const cfg: JsonRecord = { sub_qtypes: [{ qtype: 'new', sub_action: null }] }
    expect(eventPassesLayerFilter(ev('【申购】X', 'new'), cfg)).toBe(true)
  })

  it('sub_action 精确匹配标题的【子动作】', () => {
    const cfg: JsonRecord = { sub_qtypes: [{ qtype: 'new', sub_action: '申购日' }] }
    expect(eventPassesLayerFilter(ev('【申购日】天脉转债', 'new'), cfg)).toBe(true)
    expect(eventPassesLayerFilter(ev('【上市日】天脉转债', 'new'), cfg)).toBe(false)
  })

  it('qtype 不在清单 → 不通过', () => {
    const cfg: JsonRecord = { sub_qtypes: [{ qtype: 'new', sub_action: '申购日' }] }
    expect(eventPassesLayerFilter(ev('【申购日】天脉转债', 'redeem'), cfg)).toBe(false)
  })
})

describe('groupEventsByLayer', () => {
  const ev = (date: string, layer_id: string, title = 't'): CalEvent =>
    ({ date, layer_id, title, extra: {} }) as CalEvent

  it('按 date 再按 layer 分组', () => {
    const out = groupEventsByLayer([ev('2026-09-02', 'a'), ev('2026-09-02', 'b'), ev('2026-09-03', 'a')], [])
    expect(Object.keys(out).sort()).toEqual(['2026-09-02', '2026-09-03'])
    expect(Object.keys(out['2026-09-02']!).sort()).toEqual(['a', 'b'])
  })

  it('被剔除的订阅图层不出现', () => {
    const removed = new Set(['a'])
    const out = groupEventsByLayer([ev('2026-09-02', 'a'), ev('2026-09-02', 'b')], [], removed)
    expect(out['2026-09-02']).toEqual({ b: [ev('2026-09-02', 'b')] })
  })

  it('sub_qtypes 不过关的事件被丢掉', () => {
    const layers: LayerLike[] = [
      { layer_id: 'a', display_name: 'A', enabled: true, config: { sub_qtypes: [{ qtype: 'new' }] } },
    ]
    const ok = ev('2026-09-02', 'a')
    ok.extra = { qtype: 'new' }
    const bad = ev('2026-09-02', 'a')
    bad.extra = { qtype: 'redeem' }
    const out = groupEventsByLayer([ok, bad], layers)
    expect(out['2026-09-02']!['a']).toEqual([ok])
  })
})

describe('customLayerColor（mark > 旧 events > tag 关联）', () => {
  const layer = (cfg: JsonRecord): { layer_id: string; config: JsonRecord } => ({
    layer_id: 'habit',
    config: cfg,
  })
  const date = '2026-09-02' as never as import('@tt-calendar/contracts').DateStr

  it('graded mark 用 palette 档位色', () => {
    const res = customLayerColor(
      date,
      {},
      [],
      [layer({ mode: 'graded', palette: ['#111111', '#222222'], label: '健身' })],
      { '2026-09-02': [{ layer_id: 'habit', level: 1 } as unknown as Mark] },
    )
    expect(res).toEqual({ color: '#222222', label: '健身' })
  })

  it('solid mark 用 config.color', () => {
    const res = customLayerColor(
      date,
      {},
      [],
      [layer({ mode: 'solid', color: '#336699', label: '打卡' })],
      { '2026-09-02': [{ layer_id: 'habit' } as unknown as Mark] },
    )
    expect(res).toEqual({ color: '#336699', label: '打卡' })
  })

  it('无 mark 时旧版 events 兜底（含 graded level）', () => {
    const ev = { extra: { level: 2 } } as unknown as CalEvent
    const res = customLayerColor(
      date,
      { habit: [ev] },
      [],
      [layer({ mode: 'graded', palette: ['#1', '#2', '#3'] })],
    )
    expect(res?.color).toBe('#3')
  })

  it('tag 模式：todo 命中 tag 才染色', () => {
    const todo = { tags: ['gym'] } as Todo
    const hit = customLayerColor(date, {}, [todo], [layer({ mode: 'tag', tag: 'gym', color: '#abc' })])
    expect(hit?.color).toBe('#abc')
    const miss = customLayerColor(date, {}, [todo], [layer({ mode: 'tag', tag: 'run', color: '#abc' })])
    expect(miss).toBeNull()
  })

  it('无命中 → null', () => {
    expect(customLayerColor(date, {}, [], [layer({ mode: 'solid', color: '#fff' })])).toBeNull()
  })
})

describe('buildDayMarks', () => {
  it('graded 取 palette 档位，solid 取单色', () => {
    const layers = [
      { layer_id: 'g', config: { mode: 'graded', palette: ['#a1', '#a2'], label: 'graded' } },
      { layer_id: 's', config: { mode: 'solid', color: '#b1' } },
    ]
    const marks = [
      { layer_id: 'g', level: 1 },
      { layer_id: 's', level: null },
    ] as unknown as Mark[]
    const out = buildDayMarks('2026-09-02' as never, marks, layers)
    expect(out).toEqual([
      { layer_id: 'g', display_name: 'graded', level: 1, color: '#a2', mode: 'graded' },
      { layer_id: 's', display_name: 's', level: null, color: '#b1', mode: 'solid' },
    ])
  })
})
