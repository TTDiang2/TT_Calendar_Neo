/**
 * 分析面板 —— 20260916 任务书重做：里程碑化 + 统计扩充 + UI 苹果化。
 *
 * 结构（自上而下）：
 *  1. 里程碑英雄卡（渐变玻璃 + 称号 + 距下一里程碑进度 + 连续打卡）——
 *     取代旧版「总完成数 + 97% 完成率」的简陋呈现（任务书点名没意义）；
 *  2. 贡献热力图（GitHub 绿块风格）：完成次数 / 充实度 双切换；
 *  3. 忙度预测条（未来 14 天，琥珀档位）；
 *  4. 每日完成柱状图（7/14/30 窗口翻页，保留）；
 *  5. 未完成分类环形图（保留）；6. 近期完成（保留）；7. 四象限散点（桌面）。
 *
 * 左侧边栏 = 统计范围（全部 / 某清单）+ 设置入口；右侧边栏 = 里程碑成就墙。
 * 两个抽屉 portal 到 body（待办页同理：手势容器内 fixed 会被 transform 圈住）。
 * 全部数据来自 StatsSummary（后端聚合），前端只做窗口切片 / 里程碑推演。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Inbox,
  ListTodo,
  Settings,
  Trophy,
} from 'lucide-react'
import clsx from 'clsx'
import { getStatsSummary, getTodoLists, getTodos } from '../adapt/api'
import { TODO_BUSY_PREDICT_COLORS, todayStr } from '../adapt/data'
import { layerLabel } from '../adapt/layerLabel'
import { useT, useTPlural, useLang, fmtDate, fmtNumber, fmtWeekday } from '../i18n'
import type { I18n, Lang, TxKey } from '../i18n'
import { animCountUp, animGrowBars, animDrawerIn, animRing, animStaggerChildren } from '../anim'

const SEGMENT_COLORS = [
  '#EC4899', '#F97316', '#10B981', '#3B82F6', '#8B5CF6',
  '#14B8A6', '#F59E0B', '#6366F1', '#EF4444', '#64748B',
]

// 英雄卡滚动数字的哨兵占位：译文里 {n} 标出数字位，组件取回译文后按哨兵拆成
// 前后两段，把滚动数字节点嵌回原位（整句一个 key，各语言词序可译；数字位不能
// 直接插值——animCountUp 会整节点覆写 textContent）
const COUNT_UP_SENTINEL = '\u0000'

// 贡献图配色：完成次数用 GitHub 绿系（20260917 起热力图只有这一个口径）
const DONE_HEAT_COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']

// 累计完成里程碑阶梯（门槛是数据口径留在代码；称号/达成描述在 stats 命名空间字典）
const MILESTONES: { titleKey: TxKey; descKey: TxKey; at: number }[] = [
  { titleKey: 'stats.milestone.first.title', descKey: 'stats.milestone.first.desc', at: 10 },
  { titleKey: 'stats.milestone.second.title', descKey: 'stats.milestone.second.desc', at: 50 },
  { titleKey: 'stats.milestone.hundred.title', descKey: 'stats.milestone.hundred.desc', at: 100 },
  { titleKey: 'stats.milestone.battleHardened.title', descKey: 'stats.milestone.battleHardened.desc', at: 250 },
  { titleKey: 'stats.milestone.thousand.title', descKey: 'stats.milestone.thousand.desc', at: 1000 },
  { titleKey: 'stats.milestone.twoThousand.title', descKey: 'stats.milestone.twoThousand.desc', at: 2000 },
  { titleKey: 'stats.milestone.legend.title', descKey: 'stats.milestone.legend.desc', at: 5000 },
]

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 清单显示名：内置图层走 layerLabel（内置 ID 显示译文，用户改名原样）；存储名缺失兜底「未命名清单」 */
function listLabel(t: I18n['t'], listId: string, name: string | undefined): string {
  return name != null ? layerLabel(t, listId, name) : t('stats.scope.unnamedList')
}

/** 连续完成天数（当前 streak 允许「今天还没完成」从昨天起算；longest 为历史最长） */
function computeStreaks(dates: string[]): { current: number; longest: number } {
  const set = new Set(dates)
  let current = 0
  const cursor = new Date()
  if (!set.has(fmt(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (set.has(fmt(cursor))) {
    current += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  const sorted = [...set].sort()
  let longest = 0
  let run = 0
  let prev: Date | null = null
  for (const s of sorted) {
    const d = new Date(s + 'T00:00:00')
    if (prev && (d.getTime() - prev.getTime()) / 86400000 === 1) run += 1
    else run = 1
    longest = Math.max(longest, run)
    prev = d
  }
  return { current, longest }
}

/** 柱状图窗口的日期区间标尺：MM/DD 由 Intl 产出（规范 §3，不手拼日期串） */
function fmtRangeLabel(dates: string[], lang: Lang): string {
  if (dates.length === 0) return ''
  const label = (s: string) => fmtDate(lang, new Date(s + 'T00:00:00'), { month: '2-digit', day: '2-digit' })
  return dates.length === 1 ? label(dates[0]!) : `${label(dates[0]!)} - ${label(dates[dates.length - 1]!)}`
}

export function StatsView({
  onGoTodo,
  scopeOpen,
  onScopeOpenChange,
  milestonesOpen,
  onMilestonesOpenChange,
  onOpenSettings,
}: {
  onGoTodo?: () => void
  scopeOpen: boolean
  onScopeOpenChange: (open: boolean) => void
  milestonesOpen: boolean
  onMilestonesOpenChange: (open: boolean) => void
  onOpenSettings?: () => void
}) {
  // i18n hooks 与其余 hook 一样必须挂在早退之前（本文件曾有 hooks 顺序事故，见文件头）
  const t = useT()
  const tPlural = useTPlural()
  const lang = useLang()
  // 统计范围（左侧边栏决定；持久化，桌面同一份逻辑）
  const [scopeList, setScopeList] = useState<string | null>(() => localStorage.getItem('stats_scope'))
  const setScope = (id: string | null) => {
    if (id) localStorage.setItem('stats_scope', id)
    else localStorage.removeItem('stats_scope')
    setScopeList(id)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'summary', scopeList],
    queryFn: () => getStatsSummary(scopeList ?? undefined),
    staleTime: 30_000,
  })
  const { data: lists = [] } = useQuery({ queryKey: ['todoLists'], queryFn: getTodoLists })
  const { data: recentDone } = useQuery({
    queryKey: ['todos', 'completed-recent'],
    queryFn: async () => {
      // 近期完成按「完成日」取最近 3 天（completed_on），避免按创建时间截断
      // 导致老任务今天完成时漏掉；按 completed_at 排序取前 8。
      const days: string[] = []
      for (let i = 0; i < 3; i += 1) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        days.push(fmt(d))
      }
      const batches = await Promise.all(
        days.map((day) => getTodos({ status: 'completed', completed_on: day })),
      )
      return batches.flat()
    },
    staleTime: 30_000,
  })

  // 每日完成柱状图：窗口大小 + 相对末端的偏移（< 向历史翻，> 向今天回）
  const [windowSize, setWindowSize] = useState<7 | 14 | 30>(30)
  const [windowOffset, setWindowOffset] = useState(0)

  const gridRef = useRef<HTMLDivElement | null>(null)
  const barsRef = useRef<HTMLDivElement[]>([])
  const doneNumRef = useRef<HTMLSpanElement | null>(null)
  const ringRef = useRef<SVGCircleElement | null>(null)
  const scopeDrawerRef = useRef<HTMLDivElement | null>(null)
  const milestonesDrawerRef = useRef<HTMLDivElement | null>(null)

  const daily = data?.daily_done ?? []
  const busyPredict = data?.busy_predict ?? []

  // 里程碑推演
  const milestones = useMemo(() => {
    if (!data) return []
    const completed = data.stats.completed
    return MILESTONES.map((m, i) => {
      const prevAt = i > 0 ? MILESTONES[i - 1]!.at : 0
      const reached = completed >= m.at
      const progress = reached ? 1 : Math.max(0, Math.min(1, (completed - prevAt) / (m.at - prevAt)))
      return { ...m, reached, progress }
    })
  }, [data])

  const currentMilestone = useMemo(() => {
    let cur: { titleKey: TxKey; at: number } = { titleKey: 'stats.milestone.rookie', at: 0 }
    for (const m of MILESTONES) if ((data?.stats.completed ?? 0) >= m.at) cur = m
    return cur
  }, [data])

  const nextMilestone = useMemo(() => MILESTONES.find((m) => (data?.stats.completed ?? 0) < m.at) ?? null, [data])
  // streak 用全量完成日期集（completion_dates 无窗口封顶），不用热力图的 190 天切片；
  // 老 server + 新 UI 时 completion_dates 缺失 → 回落窗口内近似值（20260916 审核记录项）
  const streaks = useMemo(
    () => {
      const full = data?.completion_dates ?? []
      if (full.length) return computeStreaks(full)
      return computeStreaks(daily.filter((d) => d.count > 0).map((d) => d.date))
    },
    [data],
  )
  // 20260917 任务书 1.2-4：充实度染色退场，分析页不再维护它的统计图
  // （充实度每日档位 / 高充实天数 chip / 热力图充实度切换均已移除）

  // 贡献热力图数据（近 26 周）：只保留「完成次数」一个口径
  const doneByDate = useMemo(() => new Map(daily.map((d) => [d.date, d.count])), [daily])

  useEffect(() => {
    if (!data) return
    animStaggerChildren(gridRef.current)
    animCountUp(doneNumRef.current, data.stats.completed)
  }, [data, windowSize, scopeList])

  useEffect(() => {
    // 只保留仍挂在 DOM 上的柱（窗口从 30 天缩到 7 天时旧 ref 不持有已卸载元素）
    barsRef.current = barsRef.current.filter((el) => el && el.isConnected)
    animGrowBars(barsRef.current)
  }, [windowSize, windowOffset])

  useEffect(() => {
    if (scopeOpen) animDrawerIn(scopeDrawerRef.current, -1)
    if (milestonesOpen) animDrawerIn(milestonesDrawerRef.current, 1)
  }, [scopeOpen, milestonesOpen])

  // 完成率环形（里程碑卡内的小环，替代旧版「总完成率大字」）
  const doneRate = data && data.stats.total > 0 ? data.stats.completed / data.stats.total : 0
  const RING_R = 26
  const CIRC = 2 * Math.PI * RING_R

  // 无一次性守卫：切换统计范围（scopeList）后 data/doneRate 变化时都要重绘到新值
  useEffect(() => {
    if (!data) return
    animRing(ringRef.current, CIRC * (1 - doneRate))
  }, [data, doneRate, CIRC, scopeList])

  const windowDates = useMemo(() => {
    if (!data) return []
    // daily_done 已扩到 190 天：柱状图窗口以今天为锚向历史切片
    const anchor = new Date()
    const doneBy = new Map(daily.map((d) => [d.date, d.count]))
    const out: { date: string; count: number }[] = []
    for (let i = windowSize - 1; i >= 0; i -= 1) {
      const d = new Date(anchor)
      d.setDate(d.getDate() - i - windowOffset)
      out.push({ date: fmt(d), count: doneBy.get(fmt(d)) ?? 0 })
    }
    return out
  }, [data, daily, windowSize, windowOffset])

  const maxCount = Math.max(1, ...windowDates.map((d) => d.count))
  const recent = useMemo(() => {
    const rows = [...(recentDone ?? [])]
    rows.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    return rows.slice(0, 8)
  }, [recentDone])

  // quadrant（未完成待办）按清单分布 → 环形图扇区
  const segments = useMemo(() => {
    if (!data) return []
    const counts = new Map<string, number>()
    for (const q of data.quadrant) counts.set(q.list_id, (counts.get(q.list_id) ?? 0) + 1)
    const total = data.quadrant.length
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([listId, count], i) => ({
        listId,
        name: listLabel(t, listId, data.list_names[listId]),
        count,
        pct: total > 0 ? count / total : 0,
        color: SEGMENT_COLORS[i % SEGMENT_COLORS.length]!,
      }))
  }, [data, t])

  // 洞察推演必须在 early-return 之前挂 hook（智者 P0：hooks 顺序恒定，
  // 否则 loading→data 切换时 React 抛「Rendered more hooks than during the previous render」）
  const bestDay = useMemo(() => {
    let best = { date: '', count: 0 }
    for (const d of daily) if (d.count > best.count) best = { date: d.date, count: d.count }
    return best
  }, [daily])
  const weekDone = useMemo(() => daily.slice(0, 7).reduce((s, d) => s + d.count, 0), [daily])

  if (isLoading || !data) {
    return <main className="flex-1 flex items-center justify-center text-gray-400">{t('common.loading')}</main>
  }

  const scopeName = scopeList ? listLabel(t, scopeList, data.list_names[scopeList]) : t('stats.scope.allLists')
  // 英雄卡副标题：完成数是滚动数字节点，按哨兵取译文前后段（见 COUNT_UP_SENTINEL 注释）
  const heroDoneParts = t('stats.milestone.heroDone', { n: COUNT_UP_SENTINEL }).split(COUNT_UP_SENTINEL)

  // 面板内容（桌面常驻栏 / 手机抽屉共用同一份 JSX）。
  // 20260917 智者 P2-17 按任务书 1.1-11 原意重构：清单范围降级为顶部一行 chips
  // （它本来就不该是左抽屉的主体），「洞察」升为主体内容。

  const scopePanel = (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 范围：一行可换行的 chips（降级为次要控件） */}
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-1 mb-1.5">{t('stats.scope.label')}</p>
      <div className="flex flex-wrap gap-1.5 mb-5">
        <button
          onClick={() => setScope(null)}
          className={clsx(
            'px-3 py-1.5 rounded-full text-xs font-medium border transition',
            scopeList === null ? 'bg-pink-500 border-pink-500 text-white shadow-sm' : 'bg-white/70 border-black/10 text-gray-600',
          )}
        >
          {t('common.all')}
        </button>
        {lists.map((l) => (
          <button
            key={l.id}
            onClick={() => setScope(l.id)}
            className={clsx(
              'max-w-[130px] truncate px-3 py-1.5 rounded-full text-xs font-medium border transition',
              scopeList === l.id ? 'bg-pink-500 border-pink-500 text-white shadow-sm' : 'bg-white/70 border-black/10 text-gray-600',
            )}
          >
            {/* 图层显示名走 layerLabel（内置 ID 显示译文，用户改名原样；规范 §5） */}
            {layerLabel(t, l.id, l.display_name)}
          </button>
        ))}
      </div>

      {/* 洞察（主体）：六张大数字卡 */}
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-1 mb-2">{t('stats.scope.insights')}</p>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-white/80 border border-black/5 px-3.5 py-3">
          <p className="text-[11px] text-gray-400 flex items-center gap-1"><CheckCircle2 size={12} /> {t('stats.insight.doneTotal')}</p>
          <p className="text-2xl font-bold text-gray-800 tabular-nums mt-1">{fmtNumber(lang, data.stats.completed)}</p>
        </div>
        <div className="rounded-2xl bg-white/80 border border-black/5 px-3.5 py-3">
          <p className="text-[11px] text-gray-400 flex items-center gap-1"><Flame size={12} /> {t('stats.insight.streak')}</p>
          <p className="text-2xl font-bold text-gray-800 tabular-nums mt-1">
            {fmtNumber(lang, streaks.current)}<span className="text-sm text-gray-400">{tPlural('stats.insight.streakDays', streaks.longest)}</span>
          </p>
        </div>
        <div className="rounded-2xl bg-white/80 border border-black/5 px-3.5 py-3">
          <p className="text-[11px] text-gray-400 flex items-center gap-1"><BarChart3 size={12} /> {t('stats.insight.dailyAvg')}</p>
          <p className="text-2xl font-bold text-gray-800 tabular-nums mt-1">
            {fmtNumber(lang, Math.round((daily.slice(0, 30).reduce((s, d) => s + d.count, 0) / 30) * 10) / 10)}
          </p>
        </div>
        <div className="rounded-2xl bg-white/80 border border-black/5 px-3.5 py-3">
          <p className="text-[11px] text-gray-400 flex items-center gap-1"><Trophy size={12} /> {t('stats.insight.doneRate')}</p>
          <p className="text-2xl font-bold text-gray-800 tabular-nums mt-1">{fmtNumber(lang, Math.round(doneRate * 100))}%</p>
        </div>
        <div className="rounded-2xl bg-white/80 border border-black/5 px-3.5 py-3">
          <p className="text-[11px] text-gray-400 flex items-center gap-1"><Flame size={12} /> {t('stats.insight.weekDone')}</p>
          <p className="text-2xl font-bold text-gray-800 tabular-nums mt-1">{fmtNumber(lang, weekDone)}</p>
        </div>
        <div className="rounded-2xl bg-white/80 border border-black/5 px-3.5 py-3">
          <p className="text-[11px] text-gray-400 flex items-center gap-1"><Inbox size={12} /> {t('stats.insight.bestDay')}</p>
          <p className="text-2xl font-bold text-gray-800 tabular-nums mt-1">
            {fmtNumber(lang, bestDay.count)}
            {bestDay.date && <span className="text-sm text-gray-400">{t('stats.insight.bestDayDate', { date: bestDay.date.slice(5) })}</span>}
          </p>
        </div>
      </div>

      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="mt-auto flex items-center gap-2 px-2 py-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-white/70 rounded-xl transition-colors"
        >
          <Settings size={16} className="text-gray-400" /> {t('common.settings')}
        </button>
      )}
    </div>
  )

  // 里程碑成就墙（20260917 任务书 1.1-11：更丰满的阶梯——勋章位阶、达成描述、
  // 进度数字、下一枚提示，铺满抽屉而不是一列干巴巴的标题）。
  // 位阶称号/达成描述在 stats.milestone.* 字典（MILESTONES 携带 key）。
  const milestonesPanel = (
    <div className="flex flex-col gap-2.5">
      {/* 当前位阶英雄条 */}
      <div className="rounded-2xl p-4 text-white bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 shadow-md shadow-orange-400/30">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/80">{t('stats.milestone.currentRank')}</p>
        <p className="text-xl font-bold mt-0.5">{t(currentMilestone.titleKey)}</p>
        <p className="text-xs text-white/85 mt-1">
          {t('stats.milestone.heroLine', { n: data.stats.completed, m: streaks.current })}
        </p>
      </div>

      {milestones.map((m, i) => {
        const medal = m.reached ? (i >= 6 ? '👑' : i >= 4 ? '🥇' : i >= 2 ? '🥈' : '🥉') : undefined
        const remain = Math.max(0, m.at - data.stats.completed)
        return (
          <div
            key={m.titleKey}
            className={clsx(
              'rounded-2xl border p-3.5 transition',
              m.reached
                ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm'
                : 'border-gray-100 bg-white/70',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={clsx('text-[15px] font-bold flex items-center gap-1.5', m.reached ? 'text-amber-700' : 'text-gray-500')}>
                <span className="text-base">{medal ?? '🔒'}</span>
                {t(m.titleKey)}
              </span>
              <span className={clsx('text-[11px] tabular-nums flex-shrink-0', m.reached ? 'text-amber-600 font-semibold' : 'text-gray-400')}>
                {m.reached ? t('stats.milestone.reached') : `${fmtNumber(lang, data.stats.completed)} / ${fmtNumber(lang, m.at)}`}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1 leading-snug">
              {m.reached ? t(m.descKey) : tPlural('stats.milestone.lockedDesc', remain, { desc: t(m.descKey) })}
            </p>
            <div className="h-2 rounded-full bg-black/5 overflow-hidden mt-2.5">
              <div
                className={clsx(
                  'h-full rounded-full transition-[width] duration-700',
                  m.reached ? 'bg-gradient-to-r from-amber-400 to-orange-400' : 'bg-gradient-to-r from-pink-400 to-rose-400',
                )}
                style={{ width: `${Math.max(4, Math.round(m.progress * 100))}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="flex-1 flex overflow-hidden min-w-0">
      {/* 桌面（md+）：常驻左栏 = 统计范围（与手机抽屉同一份内容，20260916 审核项 A） */}
      <aside className="hidden md:flex w-60 bg-white/55 border-r border-white/60 p-3 overflow-y-auto flex-col flex-shrink-0">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">{t('stats.scope.label')}</h2>
        {scopePanel}
      </aside>
      <main className="flex-1 flex flex-col overflow-y-auto min-w-0">
      <div ref={gridRef} className="p-3 md:p-5 grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 pb-24 md:pb-6 max-w-5xl w-full mx-auto">
        {/* ── 里程碑英雄卡（苹果化：品牌渐变 + 玻璃高光 + 大数字） ── */}
        <section className="lg:col-span-2 rounded-3xl p-5 md:p-6 relative overflow-hidden text-white bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400 shadow-xl shadow-rose-500/25">
          <div className="absolute inset-0 pointer-events-none opacity-30" style={{ background: 'radial-gradient(24rem 12rem at 85% -10%, rgba(255,255,255,0.85), transparent 60%)' }} />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-widest text-white/70 flex items-center gap-1.5">
                <Trophy size={13} /> {t('stats.milestone.heroScope', { name: scopeName })}
              </p>
              <h2 className="text-2xl md:text-3xl font-bold mt-1 drop-shadow-sm">{t(currentMilestone.titleKey)}</h2>
              <p className="text-sm text-white/85 mt-1">
                {heroDoneParts[0]}<span ref={doneNumRef} className="text-xl font-bold tabular-nums">0</span>{heroDoneParts[1]}
              </p>
            </div>
            <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90 flex-shrink-0 drop-shadow">
              <circle cx="32" cy="32" r={RING_R} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="6" />
              <circle
                ref={ringRef}
                cx="32" cy="32" r={RING_R} fill="none"
                stroke="#ffffff" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC}
              />
            </svg>
          </div>
          {nextMilestone ? (
            <div className="relative mt-4">
              <div className="flex items-center justify-between text-[11px] text-white/85 mb-1">
                <span>{t('stats.milestone.next', { name: t(nextMilestone.titleKey) })}</span>
                <span className="tabular-nums">{fmtNumber(lang, data.stats.completed)} / {fmtNumber(lang, nextMilestone.at)}</span>
              </div>
              {/* 进度条与右侧「已完成 / 下一枚阈值」同口径：总量占比。
                  此前用「阶段内占比」，115/250 的标注配 10% 的条，视觉自相矛盾
                  （20260921 商店截图视觉审核抓出） */}
              <div className="h-2 rounded-full bg-white/25 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white/90 transition-[width] duration-700"
                  style={{ width: `${Math.min(100, Math.round((data.stats.completed / nextMilestone.at) * 100))}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="relative mt-4 text-sm text-white/90">{t('stats.milestone.maxReached')}</p>
          )}
          <div className="relative mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur px-3 py-1.5 text-xs font-medium">
              <Flame size={13} /> {tPlural('stats.chip.streak', streaks.current)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur px-3 py-1.5 text-xs font-medium">
              <CheckCircle2 size={13} /> {tPlural('stats.chip.longest', streaks.longest)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur px-3 py-1.5 text-xs font-medium">
              <ListTodo size={13} /> {tPlural('stats.chip.pending', data.stats.incomplete)}
            </span>
          </div>
        </section>

        {/* ── 贡献热力图（GitHub 绿块风格，20260917 起只保留完成口径） ── */}
        <section className="glass-card rounded-3xl p-4 md:p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-sm font-semibold text-gray-700">{t('stats.heatmap.title')}</h3>
            <span className="text-[11px] text-gray-400">{t('stats.heatmap.subtitle')}</span>
          </div>
          <Heatmap done={doneByDate} />
          <div className="flex items-center justify-end gap-1.5 mt-2 text-[10px] text-gray-400">
            <span>{t('stats.heatmap.less')}</span>
            {DONE_HEAT_COLORS.map((c) => (
              <span key={c} className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: c }} />
            ))}
            <span>{t('stats.heatmap.more')}</span>
          </div>
        </section>

        {/* ── 忙度预测：未来 14 天 ── */}
        <section className="glass-card rounded-3xl p-4 md:p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('stats.busy.title')}</h3>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {busyPredict.map((b) => {
              const dt = new Date(b.date + 'T00:00:00')
              const today = todayStr()
              return (
                <div
                  key={b.date}
                  className="flex flex-col items-center gap-1 flex-shrink-0 w-9"
                  title={b.level != null ? t('stats.busy.dayTitle', { date: b.date, n: b.level + 1 }) : t('stats.busy.noTitle', { date: b.date })}
                >
                  <span className={clsx('text-[9px]', b.date === today ? 'text-pink-600 font-semibold' : 'text-gray-400')}>
                    {b.date === today ? t('common.today') : fmtWeekday(lang, dt, 'narrow')}
                  </span>
                  <span
                    className={clsx(
                      'w-8 h-8 rounded-xl border shadow-sm',
                      b.date === today ? 'border-pink-400' : 'border-white/60',
                    )}
                    style={{ backgroundColor: b.level != null && b.level >= 0 ? TODO_BUSY_PREDICT_COLORS[b.level] : '#f3f4f6' }}
                  />
                  <span className="text-[9px] text-gray-400 tabular-nums">{b.date.slice(8)}</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── 每日任务完成（保留） ── */}
        <section className="glass-card rounded-3xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-gray-700">{t('stats.daily.title')}</h3>
            <div className="inline-flex rounded-full border border-gray-200 p-0.5 bg-gray-50">
              {([7, 14, 30] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => { setWindowSize(n); setWindowOffset(0) }}
                  className={clsx(
                    'px-2.5 py-0.5 text-xs rounded-full transition',
                    windowSize === n ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {t('stats.daily.window', { n })}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-1 mb-2">
            <button
              onClick={() => setWindowOffset((o) => Math.min(o + windowSize, Math.max(0, 180 - windowSize)))}
              disabled={windowOffset + windowSize >= 180}
              className="p-1 rounded-md text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition"
              title={t('stats.daily.older')}
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-[11px] text-gray-400 tabular-nums w-24 text-center">{fmtRangeLabel(windowDates.map((d) => d.date), lang)}</span>
            <button
              onClick={() => setWindowOffset((o) => Math.max(0, o - windowSize))}
              disabled={windowOffset === 0}
              className="p-1 rounded-md text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition"
              title={t('stats.daily.newer')}
            >
              <ChevronRight size={15} />
            </button>
          </div>
          {windowDates.every((d) => d.count === 0) ? (
            <div className="h-40 flex flex-col items-center justify-center gap-1 text-gray-300">
              <BarChart3 size={22} strokeWidth={1.5} className="opacity-50" />
              <p className="text-xs">{t('stats.daily.empty')}</p>
              <p className="text-[11px]">{t('stats.daily.emptyHint')}</p>
            </div>
          ) : (
            <div className="flex items-stretch gap-1.5 h-40" aria-label={t('stats.daily.chartAria')}>
              {windowDates.map((d, i) => {
                const h = Math.max(4, (d.count / maxCount) * 100)
                const dt = new Date(d.date + 'T00:00:00')
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={tPlural('stats.doneOnDate', d.count, { date: d.date })}>
                    <div className="w-full flex-1 flex items-end justify-center min-h-0">
                      <div
                        ref={(el) => { if (el) barsRef.current[i] = el }}
                        className={clsx('w-full max-w-7 rounded-t-md origin-bottom', d.count > 0 ? 'bg-gradient-to-t from-pink-500 to-rose-400' : 'bg-pink-200/70')}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                    {windowSize <= 14 && <span className="text-[9px] text-gray-400 truncate max-w-full">{fmtWeekday(lang, dt, 'narrow')}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── 未完成任务分类（保留） ── */}
        <section className="glass-card rounded-3xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">{t('stats.breakdown.title')}</h3>
            <span className="text-[11px] text-gray-400">{tPlural('stats.breakdown.openCount', data.quadrant.length)}</span>
          </div>
          {segments.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">{t('stats.breakdown.empty')}</p>
          ) : (
            <div className="flex items-center gap-5">
              <svg width="110" height="110" viewBox="0 0 110 110" className="-rotate-90 flex-shrink-0">
                {(() => {
                  let acc = 0
                  return segments.map((s) => {
                    const dash = s.pct * CIRC
                    const el = (
                      <circle
                        key={s.listId}
                        cx="55" cy="55" r={RING_R} fill="none"
                        stroke={s.color} strokeWidth="14"
                        strokeDasharray={`${dash} ${CIRC - dash}`}
                        strokeDashoffset={-acc}
                      />
                    )
                    acc += dash
                    return el
                  })
                })()}
              </svg>
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                {segments.map((s) => (
                  <div key={s.listId} className="flex items-center gap-2 text-xs min-w-0">
                    <i className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-gray-600 truncate flex-1">{s.name}</span>
                    <span className="text-gray-400 tabular-nums">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── 近期完成（保留） ── */}
        <section className="glass-card rounded-3xl p-4 md:p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('stats.recent.title')}</h3>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">{t('stats.recent.empty')}</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {recent.map((item) => (
                <div key={item.id} className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0"
                    role="img"
                    aria-label={t('stats.recent.doneAria')}
                  >
                    <CheckCircle2 size={12} className="text-white" />
                  </span>
                  <span className="text-sm text-gray-700 truncate flex-1">{item.title}</span>
                  {item.due_date && <span className="text-[11px] text-gray-300 flex-shrink-0 hidden sm:inline">{t('stats.recent.due', { date: item.due_date.slice(5) })}</span>}
                  <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">
                    {(item.completed_at ?? '').slice(5, 16).replace('T', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
          {data.quadrant.length > 0 && onGoTodo && (
            <button
              onClick={onGoTodo}
              className="mt-3 text-xs text-pink-500 hover:text-pink-600 transition"
            >
              {tPlural('stats.recent.goTodo', data.quadrant.length)}
            </button>
          )}
        </section>

        {/* 待办四象限（桌面宽屏附加值） */}
        <section className="hidden lg:block glass-card rounded-3xl p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">{t('stats.quadrant.title')}</h3>
          <p className="text-[11px] text-gray-400 mb-2">{t('stats.quadrant.axes')}</p>
          <Quadrant data={data} />
        </section>
      </div>

      {/* ── 左侧边栏：统计与洞察（portal，理由同待办页抽屉） ── */}
      {scopeOpen && createPortal(
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={() => onScopeOpenChange(false)} />
          <div ref={scopeDrawerRef} className="glass-sheet absolute inset-y-0 left-0 w-[300px] max-w-[86vw] rounded-r-3xl p-3 pt-[max(0.75rem,env(safe-area-inset-top))] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between mb-2 pl-1">
              <h2 className="text-base font-bold text-gray-800">{t('stats.drawer.title')}</h2>
              <button onClick={() => onScopeOpenChange(false)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 rounded-full text-xl" aria-label={t('common.close')}>×</button>
            </div>
            {scopePanel}
            <div className="pt-2">
              <button
                onClick={() => onScopeOpenChange(false)}
                className="w-full flex items-center gap-2 px-2 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-white/70 rounded-xl mb-1 transition-colors"
              >
                <Check size={16} className="text-gray-400" /> {t('common.done')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── 右侧边栏：里程碑成就墙 ── */}
      {milestonesOpen && createPortal(
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={() => onMilestonesOpenChange(false)} />
          <aside ref={milestonesDrawerRef} className="glass-sheet absolute inset-y-0 right-0 w-[320px] max-w-[88vw] rounded-l-3xl p-4 pt-[max(0.75rem,env(safe-area-inset-top))] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-800 flex items-center gap-1.5">
                <Trophy size={16} className="text-amber-400" /> {t('stats.milestone.wallTitle')}
              </h2>
              <button onClick={() => onMilestonesOpenChange(false)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 rounded-full text-xl" aria-label={t('common.close')}>×</button>
            </div>
            {milestonesPanel}
          </aside>
        </div>,
        document.body,
      )}
      </main>

      {/* 桌面（lg+）：常驻右栏 = 里程碑成就墙（断点对齐 DetailPanel 的右栏 lg 惯例） */}
      <aside className="hidden lg:flex w-72 bg-white/55 border-l border-white/60 p-3 overflow-y-auto flex-col flex-shrink-0">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 px-1 flex items-center gap-1.5">
          <Trophy size={13} className="text-amber-400" /> {t('stats.milestone.wallTitle')}
        </h2>
        {milestonesPanel}
      </aside>
    </div>
  )
}

/**
 * GitHub 风格贡献热力图：近 26 周，每列周一开始。
 * 起点按周一回退 0-6 天，实际渲染 26-27 列（27 列 ~348px，手机 overflow-x-auto 兜底）；
 * 后端取数窗口 190 天 = 182 + 6，保证最左回退列也有数据（20260916 审核项 B）。
 */
function Heatmap({
  done,
  weeks = 26,
}: {
  done: Map<string, number>
  weeks?: number
}) {
  const tPlural = useTPlural()
  const cells = useMemo(() => {
    const today = new Date()
    // 末列 = 本周（以今天收尾），向历史取 weeks*7 天，并对齐到周一开头
    const end = new Date(today)
    const start = new Date(today)
    start.setDate(start.getDate() - (weeks * 7 - 1))
    const startDow = (start.getDay() + 6) % 7 // 周一=0
    start.setDate(start.getDate() - startDow)
    const out: { date: string; count: number }[] = []
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = fmt(d)
      out.push({ date: key, count: done.get(key) ?? 0 })
    }
    return out
  }, [done, weeks])

  const quantize = (n: number): number => (n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4)

  const columns: typeof cells[] = []
  for (let i = 0; i < cells.length; i += 7) columns.push(cells.slice(i, i + 7))

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-[3px] w-max">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }, (_, ri) => {
              const cell = col[ri]
              if (!cell) return <span key={ri} className="w-[10px] h-[10px]" />
              const color = DONE_HEAT_COLORS[quantize(cell.count)]!
              // date 为 YYYY-MM-DD 数据串原样插入（不含语言词，不译）
              const label = tPlural('stats.doneOnDate', cell.count, { date: cell.date })
              return (
                <span
                  key={ri}
                  title={label}
                  className="w-[10px] h-[10px] rounded-[2px] flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 四象限散点（桌面宽屏附加值，保留） */
function Quadrant({ data }: { data: Awaited<ReturnType<typeof getStatsSummary>> }) {
  const t = useT()
  const tPlural = useTPlural()
  const IMPORTANCE_COLOR: Record<string, string> = { high: '#ef4444', normal: '#eab308', low: '#22c55e' }
  const points = data.quadrant.map((q) => {
    const days = q.days_to_due ?? 365
    const urgency = days < 0 ? 0 : Math.min(days / 30, 1)
    const imp = q.importance === 'high' ? 0 : q.importance === 'low' ? 1 : 0.5
    return { ...q, x: urgency, y: imp }
  })
  return (
    <div>
      <div className="relative h-56 border border-gray-100 rounded-xl bg-gray-50/50">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-200" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-200" />
        <span className="absolute top-1.5 left-2 text-[10px] text-red-400">{t('stats.quadrant.doNow')}</span>
        <span className="absolute top-1.5 right-2 text-[10px] text-orange-400">{t('stats.quadrant.planIt')}</span>
        <span className="absolute bottom-1.5 left-2 text-[10px] text-yellow-500">{t('stats.quadrant.delegate')}</span>
        <span className="absolute bottom-1.5 right-2 text-[10px] text-gray-400">{t('stats.quadrant.drop')}</span>
        {points.map((p) => {
          // 到期子句三选一（全角括号随子句进字典，译文可用自己的括号风格；title 为用户数据原样）
          const due = p.days_to_due == null
            ? t('stats.quadrant.point.noDue')
            : p.days_to_due < 0
              ? tPlural('stats.quadrant.point.overdue', -p.days_to_due)
              : tPlural('stats.quadrant.point.dueIn', p.days_to_due)
          return (
            <div
              key={p.id}
              title={t('stats.quadrant.point.title', { title: p.title, due })}
              className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 border border-white shadow cursor-pointer"
              style={{
                left: `${(p.x * 85 + 7.5).toFixed(1)}%`,
                top: `${(p.y * 78 + 8).toFixed(1)}%`,
                backgroundColor: IMPORTANCE_COLOR[p.importance] ?? '#eab308',
              }}
            />
          )
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: '#ef4444' }} />{t('stats.quadrant.imp.high')}</span>
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: '#eab308' }} />{t('stats.quadrant.imp.normal')}</span>
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: '#22c55e' }} />{t('stats.quadrant.imp.low')}</span>
        <span className="ml-auto flex items-center gap-1"><ListTodo size={10} />{tPlural('stats.quadrant.openCount', points.length)}</span>
      </div>
    </div>
  )
}
