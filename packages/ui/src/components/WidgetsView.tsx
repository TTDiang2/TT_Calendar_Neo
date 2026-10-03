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
import { useT } from '../i18n'
import type { TxKey } from '../i18n'
import { animSheetUp, animStaggerChildren } from '../anim'

interface WidgetMeta {
  id: string
  /** 标题/说明存 i18n key，渲染时经 t() 解析（注册表是模块级常量，不能直接调 hook） */
  titleKey: TxKey
  descKey: TxKey
  /** 相对标准格子的跨行数（网格 auto-rows 定高，跨行 = 大号小组件） */
  rows: 1 | 2
  Comp: (p: { editing?: boolean; onRemove?: () => void }) => React.ReactNode
}

const REGISTRY: WidgetMeta[] = [
  { id: 'todo', titleKey: 'terms.todo', descKey: 'widgetsView.todoDesc', rows: 1, Comp: TodoWidget },
  { id: 'miniCalendar', titleKey: 'terms.calendar', descKey: 'widgetsView.miniCalendarDesc', rows: 2, Comp: MiniCalendarWidget },
  { id: 'clock', titleKey: 'widgetsView.clockTitle', descKey: 'widgetsView.clockDesc', rows: 1, Comp: ClockWidget },
  { id: 'countdown', titleKey: 'terms.countdown', descKey: 'widgetsView.countdownDesc', rows: 1, Comp: CountdownWidget },
  { id: 'coloring', titleKey: 'widgetsView.coloringTitle', descKey: 'widgetsView.coloringDesc', rows: 2, Comp: ColoringWidget },
  { id: 'dots', titleKey: 'widgetsView.dotsTitle', descKey: 'widgetsView.dotsDesc', rows: 1, Comp: DotsWidget },
  { id: 'busy', titleKey: 'widgetsView.busyTitle', descKey: 'widgetsView.busyDesc', rows: 1, Comp: BusyWidget },
  { id: 'stats', titleKey: 'widgetsView.statsTitle', descKey: 'widgetsView.statsDesc', rows: 1, Comp: StatsWidget },
]

/** 是否运行在 iOS（Tauri 容器内 + UA 为 iPhone/iPad/iPod）。
 *  主屏小组件说明只在 iOS 有意义；桌面/网页端显示通用文案，避免跨端串味。 */
function isIOS(): boolean {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

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
  const t = useT()
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
      <div className="sticky top-0 z-10 bg-white/45 backdrop-blur-xl px-3 md:px-5 pt-3 pb-2 flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-1.5">
          <Sparkles size={16} className="text-pink-500" /> {t('terms.widgets')}
        </h2>
        <span className="text-[11px] text-gray-400 hidden sm:inline">{t('widgetsView.subtitle')}</span>
        <div className="ml-auto flex items-center gap-2">
          {editing && (
            <button
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-pink-500 rounded-full hover:bg-pink-600 active:scale-95 transition"
            >
              <Plus size={13} /> {t('common.add')}
            </button>
          )}
          <button
            onClick={() => setEditing((v) => !v)}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-full transition active:scale-95',
              editing ? 'text-white bg-gray-800 hover:bg-gray-700' : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-100',
            )}
          >
            {editing ? t('common.done') : t('common.edit')}
          </button>
        </div>
      </div>

      {/* 主屏小组件引导：此处是 App 内的卡片页；真正放主屏幕的小组件另有入口。
          上次的误解就发生在这里，故把两条路径写明。 */}
      <div className="px-3 md:px-5 pt-1 pb-2 max-w-6xl w-full mx-auto">
        <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 text-[12px] text-sky-900 leading-relaxed">
          <p className="font-medium mb-0.5">{t('widgetsView.guideTitle')}</p>
          <p className="text-sky-800/80">
            {isIOS() ? (
              <>
                {t('widgetsView.guideIosSteps')}
                {t('widgetsView.guideIosData')}
              </>
            ) : (
              <>
                {t('widgetsView.guideOtherSteps')}
                {t('widgetsView.guideOtherCards')}
              </>
            )}
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
            <p className="text-sm">{t('widgetsView.emptyHint')}</p>
          </div>
        )}
      </div>

      {/* 添加小组件选择器（底部弹层，移动端友好） */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={() => setPickerOpen(false)} />
          <div
            ref={pickerRef}
            className="relative glass-sheet rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[70vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-gray-800">{t('widgetsView.pickerTitle')}</h3>
              <button onClick={() => setPickerOpen(false)} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 transition">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto px-5 pb-5 flex flex-col gap-2">
              {available.length === 0 && <p className="text-sm text-gray-400 text-center py-6">{t('widgetsView.pickerEmpty')}</p>}
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
                    <span className="block text-sm font-medium text-gray-800">{t(w.titleKey)}</span>
                    <span className="block text-xs text-gray-400 truncate">{t(w.descKey)}</span>
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
