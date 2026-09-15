/**
 * 小组件页 —— 应用内的「桌面小组件」面板。
 *
 * 卡片 = components/widgets/cards.tsx 里的自包含组件；本页只负责：
 * - 注册表（id → 组件/标题/跨行）与网格排布（移动 2 列 / 平板 3 列 / 桌面 4 列）；
 * - 启用集持久化（localStorage 'widgets-enabled'，默认全量）；
 * - 编辑模式：删除 + 「添加小组件」选择器（弹层列出未启用项）。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutGrid, Plus, Sparkles, X } from 'lucide-react'
import clsx from 'clsx'
import {
  BusyWidget,
  ClockWidget,
  ColoringWidget,
  CountdownWidget,
  DotsWidget,
  MiniCalendarWidget,
  StatsWidget,
  TodoWidget,
} from './widgets/cards'
import { animSheetUp, animStaggerChildren } from '../anim'

interface WidgetMeta {
  id: string
  title: string
  desc: string
  /** 相对标准格子的跨行数（网格 auto-rows 定高，跨行 = 大号小组件） */
  rows: 1 | 2
  Comp: (p: { editing?: boolean; onRemove?: () => void }) => React.ReactNode
}

const REGISTRY: WidgetMeta[] = [
  { id: 'todo', title: '待办', desc: '今天与逾期的待办，可直接勾选完成', rows: 1, Comp: TodoWidget },
  { id: 'miniCalendar', title: '日历', desc: '迷你月历，今天高亮、事件打点', rows: 2, Comp: MiniCalendarWidget },
  { id: 'clock', title: '时钟', desc: '实时时钟与农历', rows: 1, Comp: ClockWidget },
  { id: 'countdown', title: '倒数日', desc: '最近的三个倒数日', rows: 1, Comp: CountdownWidget },
  { id: 'coloring', title: '涂色', desc: '本月充实度热力图，可翻月', rows: 2, Comp: ColoringWidget },
  { id: 'dots', title: '点点', desc: '今天的事件点点列表', rows: 1, Comp: DotsWidget },
  { id: 'busy', title: '忙度预报', desc: '未来 7 天忙度预测', rows: 1, Comp: BusyWidget },
  { id: 'stats', title: '完成概览', desc: '待办完成率一览', rows: 1, Comp: StatsWidget },
]

const LS_KEY = 'widgets-enabled'

function loadEnabled(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return REGISTRY.map((w) => w.id)
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return REGISTRY.map((w) => w.id)
    // 只保留注册表里存在的 id（防旧数据残留），保序
    return arr.filter((x): x is string => typeof x === 'string' && REGISTRY.some((w) => w.id === x))
  } catch {
    return REGISTRY.map((w) => w.id)
  }
}

export function WidgetsView() {
  const [enabled, setEnabled] = useState<string[]>(loadEnabled)
  const [editing, setEditing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const pickerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(enabled))
    } catch {
      /* localStorage 不可用时仅内存态 */
    }
  }, [enabled])

  useEffect(() => {
    animStaggerChildren(gridRef.current)
  }, [enabled])

  useEffect(() => {
    if (pickerOpen) animSheetUp(pickerRef.current)
  }, [pickerOpen])

  const metas = useMemo(
    () => enabled.map((id) => REGISTRY.find((w) => w.id === id)).filter((m): m is WidgetMeta => !!m),
    [enabled],
  )
  const available = REGISTRY.filter((w) => !enabled.includes(w.id))

  return (
    <main className="flex-1 flex flex-col overflow-y-auto min-w-0 bg-gray-50">
      {/* 页头 */}
      <div className="sticky top-0 z-10 bg-gray-50/90 backdrop-blur px-3 md:px-5 pt-3 pb-2 flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-1.5">
          <Sparkles size={16} className="text-pink-500" /> 小组件
        </h2>
        <span className="text-[11px] text-gray-400 hidden sm:inline">App 内的信息卡片</span>
        <div className="ml-auto flex items-center gap-2">
          {editing && (
            <button
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-pink-500 rounded-full hover:bg-pink-600 active:scale-95 transition"
            >
              <Plus size={13} /> 添加
            </button>
          )}
          <button
            onClick={() => setEditing((v) => !v)}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-full transition active:scale-95',
              editing ? 'text-white bg-gray-800 hover:bg-gray-700' : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-100',
            )}
          >
            {editing ? '完成' : '编辑'}
          </button>
        </div>
      </div>

      {/* 主屏小组件引导：此处是 App 内的卡片页；真正放主屏幕的小组件另有入口。
          上次的误解就发生在这里，故把两条路径写明。 */}
      <div className="px-3 md:px-5 pt-1 pb-2 max-w-6xl w-full mx-auto">
        <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 text-[12px] text-sky-900 leading-relaxed">
          <p className="font-medium mb-0.5">想放到手机主屏幕？那是系统的「小组件」</p>
          <p className="text-sky-800/80">
            本页是 <b>App 内的信息卡片</b>。要在 iPhone 主屏幕显示，请长按主屏幕空白处 →
            左上角「+」→ 搜索「TT 日历」→ 选尺寸添加（iOS 14+；小组件数据由 App 打开时同步写入）。
          </p>
        </div>
      </div>

      {/* 网格 */}
      <div
        ref={gridRef}
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 auto-rows-[168px] gap-3 p-3 md:p-5 pb-24 md:pb-6 max-w-6xl w-full mx-auto"
      >
        {metas.map(({ id, rows, Comp }) => (
          <div key={id} className={rows === 2 ? 'row-span-2' : ''}>
            <Comp
              editing={editing}
              onRemove={() => setEnabled((arr) => arr.filter((x) => x !== id))}
            />
            {/* Comp 返回 WidgetCard（h-full 由卡片自身撑满），这里占位 div 负责跨行 */}
          </div>
        ))}
        {metas.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center text-gray-400 gap-2 py-16">
            <LayoutGrid size={28} />
            <p className="text-sm">还没有小组件，点右上角「编辑」添加</p>
          </div>
        )}
      </div>

      {/* 添加小组件选择器（底部弹层，移动端友好） */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPickerOpen(false)} />
          <div
            ref={pickerRef}
            className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full sm:max-w-md max-h-[70vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-gray-800">添加小组件</h3>
              <button onClick={() => setPickerOpen(false)} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 transition">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto px-5 pb-5 flex flex-col gap-2">
              {available.length === 0 && <p className="text-sm text-gray-400 text-center py-6">全部小组件都已添加</p>}
              {available.map((w) => (
                <button
                  key={w.id}
                  onClick={() => {
                    setEnabled((arr) => [...arr, w.id])
                    setPickerOpen(false)
                  }}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-gray-100 hover:border-pink-200 hover:bg-pink-50/50 text-left transition"
                >
                  <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center flex-shrink-0">
                    <Plus size={16} className="text-pink-500" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-800">{w.title}</span>
                    <span className="block text-xs text-gray-400 truncate">{w.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
