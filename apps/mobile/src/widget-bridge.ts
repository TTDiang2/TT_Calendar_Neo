/**
 * 主屏小组件数据桥：把「今日概览」推给 iOS WidgetKit extension。
 *
 * 链路：这里组装快照 JSON → Tauri command（export_widget_snapshot）→
 * Rust 写 App Group 容器 → extension 读文件渲染（见 apps/mobile/widget/）。
 * 非 Tauri 环境（web/dev server）自动跳过。
 *
 * 回传链路（一键打卡，20260921）：小组件上的打卡按钮（iOS 17 AppIntent）把
 * 动作写进 App Group 的 widget-actions.json；本桥在每次推快照前消费该队列，
 * 把动作落到真库（updateTodo），再重建快照——小组件的乐观更新于是变成真数据。
 *
 * 类型全部取自 @tt-calendar/contracts：曾因手写内联类型把 ScheduleItem 的
 * start_time 写成 time，字段错位静默了近一年（20260915 智者复审抓出）——
 * 这条链路禁止再用自造类型。
 */

import { invoke } from '@tauri-apps/api/core'
import type { CountdownItem, MonthData } from '@tt-calendar/contracts'
import { getBackend } from '@tt-calendar/ui'
import { todayStr } from '@tt-calendar/ui/adapt/data'
import { addDays } from '@tt-calendar/domain'

const REFRESH_INTERVAL_MS = 15 * 60 * 1000
let timer: ReturnType<typeof setInterval> | null = null

interface WidgetSnapshot {
  generatedAt: string
  today: string
  todos: { title: string; overdue: boolean }[]
  events: { title: string; time: string }[]
  /** 最近 3 个倒数日（next_date 距今天数） */
  countdowns: { name: string; daysLeft: number; date: string }[]
  /** 本月涂色热力：有涂色的日子（level 0-4），供主屏「本月完成」小组件渲染 */
  coloring: { date: string; level: number }[]
  /** 待办完成概览 */
  stats: { total: number; completed: number; incomplete: number }
  /** 今日打卡：重复待办（每日/工作日/每周），done = 该期已完成 */
  habits: { id: string; title: string; done: boolean }[]
  /** 连续打卡天数（按每日完成日期集） */
  streak: number
  /** 近 91 天每日完成数（大号热力图小组件） */
  heatmap: { date: string; count: number }[]
  /** 近 7 天每日完成数（统计小组件小柱图） */
  week: { date: string; count: number }[]
}

async function buildSnapshot(): Promise<WidgetSnapshot> {
  const be = getBackend()
  const today = todayStr()
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`
  const [todos, monthView, countdownList, stats] = await Promise.all([
    be.getTodos({ status: 'all', sort: 'due_importance' }),
    be.getView('month', monthKey) as Promise<MonthData>,
    be.getCountdownList().catch(() => [] as CountdownItem[]),
    be.getStatsSummary(undefined).catch(() => null),
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

  // 本月完成热力：待办已完成档位（20260917 任务书 1.2-4/1.2-5——充实度退出默认后，
  // 小组件的热力口径切换到「待办完成」并沿用其 GitHub 绿色阶；day.done_level 由
  // 后端 day_busy 派生，1-4 档直接可用）
  const coloring = monthView.days
    .filter((d) => d.done_level != null)
    .map((d) => ({ date: d.date, level: d.done_level as number }))

  // 今日打卡：重复待办（老端 todo.repeat 枚举），未完成在前
  const habits = todos
    .filter((t) => t.repeat && (t.status !== 'completed' || (t.completed_at ?? '').slice(0, 10) === today))
    .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'))
    .slice(0, 6)
    .map((t) => ({ id: t.id, title: t.title, done: t.status === 'completed' }))

  // 连续天数：completion_dates 从今天（或昨天）往回数连续有完成的天数
  const doneDates = new Set(stats?.completion_dates ?? [])
  let streak = 0
  let offset = doneDates.has(today) ? 0 : 1
  while (doneDates.has(addDays(today, -offset))) {
    streak += 1
    offset += 1
  }

  // 近 91 天 / 近 7 天每日完成数
  const daily = stats?.daily_done ?? []
  const since = (n: number) => addDays(today, -(n - 1))
  const heatmap = daily.filter((d) => d.date >= since(91)).map((d) => ({ date: d.date, count: d.count }))
  const week = daily.filter((d) => d.date >= since(7)).map((d) => ({ date: d.date, count: d.count }))

  return {
    generatedAt: new Date().toISOString(),
    today,
    todos: todos
      .filter((t) => t.status !== 'completed')
      .slice(0, 5)
      .map((t) => ({
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
      total: stats?.stats.total ?? 0,
      completed: stats?.stats.completed ?? 0,
      incomplete: stats?.stats.incomplete ?? 0,
    },
    habits,
    streak,
    heatmap,
    week,
  }
}

/**
 * 消费小组件回传的动作队列并落到真库（幂等：重复消费无害）。
 * 只认 completeTodo；动作文件由 Rust 侧读走即删，这里拿到的每条只处理一次。
 */
async function consumeWidgetActions(): Promise<void> {
  try {
    const raw = await invoke<string>('consume_widget_actions')
    const actions = JSON.parse(raw) as { kind: string; id?: string }[]
    if (!Array.isArray(actions)) return
    const be = getBackend()
    for (const a of actions) {
      if (a.kind === 'completeTodo' && a.id) {
        try {
          const cur = await be.updateTodo(a.id, { status: 'completed' })
          if (!cur) console.warn('[widget] 动作目标不存在（可能已滚动到下一期）:', a.id)
        } catch (e) {
          console.warn('[widget] 动作落库失败:', a.id, e)
        }
      }
    }
  } catch {
    // 非 Tauri 环境 / App Group 不可用：静默跳过
  }
}

/** 推送一次小组件快照（尽力而为：非 Tauri/异常静默跳过） */
export async function refreshWidgetSnapshot(): Promise<void> {
  try {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
    await consumeWidgetActions()
    const payload = JSON.stringify(await buildSnapshot())
    await invoke('export_widget_snapshot', { payload })
  } catch {
    // App Group 不可用（免费自签受限）等场景：小组件显示占位文案，不惊扰用户
  }
}

/** 启动周期刷新（前台时每 15 分钟 + 回前台立即刷一次）。
 *  注意：这里只更新 App Group 里的快照文件；小组件界面的重载由 iOS 调度
 *  （打卡按钮的 AppIntent 会主动 reload，其余场景最坏滞后到下次时间线刷新）。 */
export function startWidgetRefresh(): void {
  if (timer !== null || typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshWidgetSnapshot()
  }, REFRESH_INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshWidgetSnapshot()
  })
}
