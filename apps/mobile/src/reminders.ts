/**
 * iOS 本地提醒调度（20260917 任务书 1.2-6）——把「要到期的待办 / 重要日期」
 * 挂到系统通知上，App 不在前台也会由 iOS 弹出提醒。
 *
 * v1 口径（真机验收后可在设置里加自定义提前量）：
 *  - 未完成待办：due_date 落在 未来 7 天内 → 截止当天 09:00 提醒；
 *  - 已过期未完成待办：立即补一条「已过期」提醒（每天至多一条，去重靠 cancelAll 重排）；
 *  - important 图层事件（重要日期）：前一天 09:00 提醒「明天就是…」。
 *
 * 实现要点：
 *  - tauri-plugin-notification 的 schedule（Schedule.at）在 iOS 走 UNUserNotificationCenter；
 *  - 全量「取消重排」策略：每次刷新 cancelAll 后按最新数据重排（数据量 ≤ 50 条，
 *    iOS 单 App 待决通知上限 64，留余量）；避免维护 id ↔ 业务 key 的映射；
 *  - 非 Tauri 环境（vite dev / http 后端）静默跳过，插件缺失也不抛错。
 */

import { getView, getTodos } from '@tt-calendar/ui/adapt/api'
import type { CalEvent, Day, MonthData, Todo } from '@tt-calendar/contracts'
import { todayStr } from '@tt-calendar/ui/adapt/data'

const ALARM_HOUR = 9
const MAX_SCHEDULED = 48
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null
let refreshing = false
/** 首次用户点按后置真：权限请求只在真实交互之后发生（智者 P1-8） */
let userInteracted = false

function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 当天 09:00（已过 09:00 则顺延到明天——排过去的闹钟 iOS 会立即弹，打扰用户） */
function alarmAt(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const at = new Date(y!, m! - 1, d!, ALARM_HOUR, 0, 0, 0)
  if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1)
  return at
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + n)
  return d
}

interface DesiredReminder {
  key: string
  at: Date
  title: string
  body: string
}

/** 从当月+下月视图里收集 important 图层事件（未来 7 天内） */
async function collectImportantEvents(today: string): Promise<CalEvent[]> {
  const now = new Date()
  const monthKeys = [`${now.getFullYear()}-${now.getMonth() + 1}`, ...(() => {
    const n = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return [`${n.getFullYear()}-${n.getMonth() + 1}`]
  })()]
  const horizon = fmt(addDays(new Date(), 7))
  const out: CalEvent[] = []
  const seen = new Set<string>()
  for (const mk of monthKeys) {
    try {
      const data = await getView('month', mk)
      if (!data || !('days' in data)) continue
      for (const day of (data as MonthData).days as Day[]) {
        if (day.date < today || day.date > horizon) continue
        for (const ev of Object.values(day.events_by_layer ?? {}).flat()) {
          if (ev.layer_id !== 'important') continue
          if (seen.has(`${ev.date}:${ev.title}`)) continue
          seen.add(`${ev.date}:${ev.title}`)
          out.push(ev)
        }
      }
    } catch {
      /* 单月取数失败跳过 */
    }
  }
  return out
}

async function computeDesired(): Promise<DesiredReminder[]> {
  const today = todayStr()
  const horizon = fmt(addDays(new Date(), 7))
  const [open, importantEvents] = await Promise.all([
    getTodos({ status: 'notStarted', sort: 'due_importance', limit: 500 }),
    collectImportantEvents(today),
  ])

  const out: DesiredReminder[] = []
  // 到期待办：截止当天 09:00（含已过期补一条立即提醒；当天只补报一次——
  // cancelAll 全量重排每 6 小时跑一轮，不去重的话过期提醒会反复弹，智者 P2-16）
  const overdue = open.filter((t: Todo) => t.due_date != null && t.due_date < today)
  let overdueFired = false
  try { overdueFired = localStorage.getItem('reminders.overdue.fired') === today } catch { /* 隐私模式 */ }
  if (overdue.length > 0 && !overdueFired) {
    // 落键动作延后到 refreshReminders 调度成功之时（避免当天白耗一次补报）
    out.push({
      key: `overdue-${today}`,
      at: new Date(Date.now() + 5_000),
      title: `有 ${overdue.length} 项待办已过期`,
      body: overdue.slice(0, 3).map((t) => t.title).join('、') + (overdue.length > 3 ? ' …' : ''),
    })
  }
  for (const t of open) {
    if (!t.due_date || t.due_date < today || t.due_date > horizon) continue
    if (out.length >= MAX_SCHEDULED) break
    out.push({
      key: `todo-${t.id}`,
      at: alarmAt(t.due_date),
      title: t.due_date === today ? '待办今天截止' : `待办截止 · ${t.due_date.slice(5)}`,
      body: t.title,
    })
  }
  // 重要日期：前一天 09:00
  for (const ev of importantEvents) {
    if (out.length >= MAX_SCHEDULED) break
    const [y, m, d] = ev.date.split('-').map(Number)
    const eve = new Date(y!, m! - 1, d!, ALARM_HOUR)
    eve.setDate(eve.getDate() - 1)
    if (eve.getTime() <= Date.now()) continue
    out.push({
      key: `evt-${ev.id ?? ev.title}`,
      at: eve,
      title: '重要日期提醒',
      body: `明天（${ev.date.slice(5)}）：${ev.title}`,
    })
  }
  return out
}

/** 取消全部旧提醒并按最新数据重排（全量重排策略，见文件头说明） */
export async function refreshReminders(): Promise<{ scheduled: number } | null> {
  if (!inTauri()) return null
  if (refreshing) return null
  refreshing = true
  try {
    const plugin = await import('@tauri-apps/plugin-notification')
    let granted = await plugin.isPermissionGranted()
    if (!granted) {
      // 权限请求加交互门控（智者 P1-8）：冷启动 8 秒无预告弹系统权限框观感差，
      // iOS 一次拒绝永久拒绝——首次用户点按之后才请求；已拒绝则静默放弃
      if (!userInteracted) return null
      try {
        granted = (await plugin.requestPermission()) === 'granted'
      } catch {
        granted = false
      }
    }
    if (!granted) return null

    // 先算后清（智者 P1-8）：computeDesired 失败时不能把旧提醒清掉
    const desired = await computeDesired()
    await plugin.cancelAll()
    let scheduled = 0
    let overdueScheduled = false
    for (const r of desired) {
      try {
        plugin.sendNotification({
          title: r.title,
          body: r.body,
          schedule: plugin.Schedule.at(r.at),
        })
        scheduled += 1
        if (r.key.startsWith('overdue-')) overdueScheduled = true
      } catch {
        /* 单条失败继续 */
      }
    }
    if (overdueScheduled) {
      try { localStorage.setItem('reminders.overdue.fired', todayStr()) } catch { /* 隐私模式 */ }
    }
    return { scheduled }
  } catch {
    // 插件未注册（旧 Rust 侧）或非移动环境：静默跳过
    return null
  } finally {
    refreshing = false
  }
}

/** 启动周期刷新：启动后 8 秒首排（等数据就绪），此后每 6 小时一次 */
export function startReminders(): void {
  if (!inTauri() || timer) return
  const markInteracted = () => {
    userInteracted = true
    window.removeEventListener('pointerdown', markInteracted)
    window.removeEventListener('keydown', markInteracted)
  }
  window.addEventListener('pointerdown', markInteracted, { once: true })
  window.addEventListener('keydown', markInteracted, { once: true })
  setTimeout(() => void refreshReminders(), 8_000)
  timer = setInterval(() => void refreshReminders(), REFRESH_INTERVAL_MS)
}

/** 数据同步完成后的节流触发（避免每次 invalidate 都全量重排） */
let lastRun = 0
export function nudgeReminders(): void {
  if (!inTauri()) return
  const now = Date.now()
  if (now - lastRun < 60_000) return
  lastRun = now
  setTimeout(() => void refreshReminders(), 3_000)
}
