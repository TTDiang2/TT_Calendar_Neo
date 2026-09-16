/**
 * 主屏小组件数据桥：把「今日概览」推给 iOS WidgetKit extension。
 *
 * 链路：这里组装快照 JSON → Tauri command（export_widget_snapshot）→
 * Rust 写 App Group 容器 → extension 读文件渲染（见 apps/mobile/widget/）。
 * 非 Tauri 环境（web/dev server）自动跳过。
 *
 * 类型全部取自 @tt-calendar/contracts：曾因手写内联类型把 ScheduleItem 的
 * start_time 写成 time，字段错位静默了近一年（20260915 智者复审抓出）——
 * 这条链路禁止再用自造类型。
 */

import { invoke } from '@tauri-apps/api/core'
import type { CountdownItem, MonthData } from '@tt-calendar/contracts'
import { getBackend } from '@tt-calendar/ui'
import { todayStr } from '@tt-calendar/ui/adapt/data'

const REFRESH_INTERVAL_MS = 15 * 60 * 1000
let timer: ReturnType<typeof setInterval> | null = null

interface WidgetSnapshot {
  generatedAt: string
  today: string
  todos: { title: string; overdue: boolean }[]
  events: { title: string; time: string }[]
  /** 最近 3 个倒数日（next_date 距今天数） */
  countdowns: { name: string; daysLeft: number; date: string }[]
  /** 本月涂色热力：有涂色的日子（level 0-4），供主屏「本月涂色」小组件渲染 */
  coloring: { date: string; level: number }[]
  /** 待办完成概览 */
  stats: { total: number; completed: number; incomplete: number }
}

async function buildSnapshot(): Promise<WidgetSnapshot> {
  const be = getBackend()
  const today = todayStr()
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`
  const [todos, monthView, countdownList, stats] = await Promise.all([
    be.getTodos({ status: 'notStarted', sort: 'due_importance' }),
    be.getView('month', monthKey) as Promise<MonthData>,
    be.getCountdownList().catch(() => [] as CountdownItem[]),
    be.getTodoStats(undefined).catch(() => ({ total: 0, completed: 0, incomplete: 0 })),
  ])
  const day = monthView.days.find((d) => d.date === today)

  const events: { title: string; time: string }[] = []
  if (day) {
    for (const evs of Object.values(day.events_by_layer ?? {})) {
      for (const ev of evs ?? []) {
        events.push({ title: ev.title, time: '' })
      }
    }
    for (const item of day.schedule_items ?? []) {
      events.push({ title: item.title, time: item.start_time ?? '' })
    }
  }

  // 本月涂色：取涂色图层（coloring_level）非空的日子
  const coloring = monthView.days
    .filter((d) => d.coloring_level != null)
    .map((d) => ({ date: d.date, level: d.coloring_level as number }))

  return {
    generatedAt: new Date().toISOString(),
    today,
    todos: todos.slice(0, 5).map((t) => ({
      title: t.title,
      overdue: !!(t.due_date && t.due_date < today),
    })),
    events: events.slice(0, 5),
    countdowns: countdownList
      .slice()
      .sort((a, b) => a.days_left - b.days_left)
      .slice(0, 3)
      .map((c) => ({ name: c.name, daysLeft: c.days_left, date: c.next_date })),
    coloring,
    stats: {
      total: stats.total,
      completed: stats.completed,
      incomplete: stats.incomplete,
    },
  }
}

/** 推送一次小组件快照（尽力而为：非 Tauri/异常静默跳过） */
export async function refreshWidgetSnapshot(): Promise<void> {
  try {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
    const payload = JSON.stringify(await buildSnapshot())
    await invoke('export_widget_snapshot', { payload })
  } catch {
    // App Group 不可用（免费自签受限）等场景：小组件显示占位文案，不惊扰用户
  }
}

/** 启动周期刷新（前台时每 15 分钟 + 回前台立即刷一次）。
 *  注意：这里只更新 App Group 里的快照文件；小组件界面的重载由 iOS 调度
 *  （我们未调用 WidgetCenter.reloadAllTimelines），最坏可能滞后到下次时间线刷新。 */
export function startWidgetRefresh(): void {
  if (timer !== null || typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshWidgetSnapshot()
  }, REFRESH_INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshWidgetSnapshot()
  })
}
