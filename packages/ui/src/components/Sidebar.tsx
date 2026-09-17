import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronDown, ChevronRight, Plus, Search, Settings } from 'lucide-react'
import type { Layer } from '../adapt/types'
import { createLayer, getSubscriptions } from '../adapt/api'
import { COLOR_PRESETS, GRADED_PALETTES } from '../adapt/data'
import { subscriptionLayerFilter } from '../adapt/subscription'
import { animDrawerIn } from '../anim'
import { Modal, Field } from './ui/Modal'

interface Props {
  layers: Layer[]
  onToggle: (layerId: string) => void
  countdown: string
}

/* 桌面：固定左侧栏（md+ 才显示，手机上由 App 渲染 MobileLayersDrawer） */
export function Sidebar({ layers, onToggle, countdown }: Props) {
  return (
    <aside className="hidden md:flex w-60 bg-white/55 border-r border-white/60 flex-shrink-0 p-4 overflow-y-auto flex-col">
      <LayerTree layers={layers} onToggle={onToggle} countdown={countdown} />
    </aside>
  )
}

/* 手机：左侧滑出抽屉（dock 左按钮唤出），液态玻璃材质 + 弹簧滑入。
   20260916 任务书：设置不再占 Top Bar，收进本抽屉底部的「设置」入口；
   20260917 任务书：综合搜索入口也收进本抽屉（Top Bar 移除后搜索的新家），
   行高/开关放大到手机触控标准（1.1-5 抽屉手机化） */
export function MobileLayersDrawer({
  open,
  onClose,
  layers,
  onToggle,
  countdown,
  onOpenSettings,
  onOpenSearch,
}: Props & { open: boolean; onClose: () => void; onOpenSettings?: () => void; onOpenSearch?: () => void }) {
  const panelRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open) animDrawerIn(panelRef.current, -1)
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <aside ref={panelRef} className="glass-sheet absolute inset-y-0 left-0 w-[300px] max-w-[86vw] rounded-r-3xl p-4 pt-3 overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">图层</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 rounded-full text-xl"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* 综合搜索入口（1.1-1）：事件 + 待办一把搜 */}
        {onOpenSearch && (
          <button
            onClick={onOpenSearch}
            className="mb-3 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/80 border border-black/5 shadow-sm text-sm text-gray-400 active:bg-pink-50 active:text-pink-600 transition-colors"
          >
            <Search size={15} className="text-pink-500" />
            搜索事件、待办…
          </button>
        )}

        <LayerTree layers={layers} onToggle={onToggle} countdown={countdown} showSubscriptions={false} roomy />
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="mt-auto flex items-center gap-2 px-2 py-3 text-[15px] text-gray-600 hover:text-gray-900 hover:bg-white/70 rounded-xl mb-2 transition-colors"
          >
            <Settings size={17} className="text-gray-400" /> 设置
          </button>
        )}
      </aside>
    </div>
  )
}

function LayerTree({ layers, onToggle, countdown, showSubscriptions = true, roomy = false }: Props & { showSubscriptions?: boolean; roomy?: boolean }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sidebar_collapsed')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const toggleGroup = (id: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try { localStorage.setItem('sidebar_collapsed', JSON.stringify(next)) } catch {}
      return next
    })
  }

  // 订阅超级组：组名与订阅 display_name 相同的图层组（集思录等）挂在「订阅」下
  const { data: subs = [] } = useQuery({ queryKey: ['subscriptions'], queryFn: getSubscriptions })
  const subNames = useMemo(() => new Set(subs.map((s) => s.display_name)), [subs])

  // 第一级：涂色 / 点点（基于 layer.kind）；第二级：group（layer.group）；第三级：图层本身。
  // 手机端（showSubscriptions=false）：订阅来源图层整组排除——统一判别式见 adapt/subscription.ts
  // （智者 P0-1：不能再单用 sort_order≥10，会漏掉组名约定的订阅、误判场景交由并集兜底）
  const tree = useMemo(() => {
    const byKind: Record<string, Record<string, Layer[]>> = { color: {}, dot: {} }
    for (const l of layers) {
      if (!showSubscriptions && subscriptionLayerFilter(subNames)(l)) continue
      const kind = l.kind === 'dot' ? 'dot' : 'color'
      const grp = l.group ?? ''
      ;(byKind[kind][grp] ??= []).push(l)
    }
    for (const k of Object.keys(byKind)) {
      for (const g of Object.keys(byKind[k])) {
        byKind[k][g].sort((a, b) => a.sort_order - b.sort_order)
      }
    }
    return byKind
  }, [layers, showSubscriptions, subNames])

  const kindMeta: Record<string, { title: string }> = {
    color: { title: '涂色' },
    dot: { title: '点点' },
  }

  const onCreated = () => {
    setShowCreate(false)
    qc.invalidateQueries({ queryKey: ['layers'] })
    qc.invalidateQueries({ queryKey: ['view'] })
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">导航</h2>

      <div className="flex flex-col gap-2 mb-4">
        {(['color', 'dot'] as const).map((kind) => {
          const groups = tree[kind]
          const groupKeys = Object.keys(groups)
          if (groupKeys.length === 0) return null
          const kindId = `kind:${kind}`
          return (
            <div key={kind}>
              <button
                onClick={() => toggleGroup(kindId)}
                className="w-full flex items-center gap-1 px-1 py-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700"
              >
                {collapsed[kindId] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                {kindMeta[kind].title}
              </button>
              {!collapsed[kindId] && (
                <div className="flex flex-col gap-1 ml-1">
          {(() => {
            const sorted = [...groupKeys].sort()
            const normalGroups = sorted.filter((g) => !subNames.has(g))
            const subGroupKeys = sorted.filter((g) => subNames.has(g))
            return (
              <>
          {normalGroups.map((grp) => {
            const members = groups[grp]
            const hasGroup = grp !== ''
            const grpId = `group:${kind}:${grp}`
            const grpTitle = hasGroup ? grp : '其他'
            return (
              <div key={grp}>
                {hasGroup && (
                  <button
                    onClick={() => toggleGroup(grpId)}
                    className="w-full flex items-center gap-1 px-1 py-0.5 text-[11px] text-gray-400 hover:text-gray-600"
                  >
                    {collapsed[grpId] ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                    {grpTitle}
                    <span className="text-[10px] text-gray-300">{members.length}</span>
                  </button>
                )}
                {(!hasGroup || !collapsed[grpId]) && (
                  <div className={`flex flex-col gap-0.5 ${hasGroup ? 'ml-2' : ''}`}>
                    {members.map((l) => (
                      <LayerRow key={l.layer_id} layer={l} onToggle={onToggle} roomy={roomy} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {subGroupKeys.length > 0 && (
            <div>
              <button
                onClick={() => toggleGroup(`subs:${kind}`)}
                className="w-full flex items-center gap-1 px-1 py-0.5 text-[11px] text-gray-400 hover:text-gray-600"
              >
                {collapsed[`subs:${kind}`] ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                订阅
                <span className="text-[10px] text-gray-300">{subGroupKeys.reduce((n, g) => n + groups[g].length, 0)}</span>
              </button>
              {!collapsed[`subs:${kind}`] && (
                <div className="ml-1">
                  {subGroupKeys.sort().map((grp) => {
                    const members = groups[grp]
                    const grpId = `group:${kind}:${grp}`
                    return (
                      <div key={grp} className="mb-0.5">
                        <button
                          onClick={() => toggleGroup(grpId)}
                          className="w-full flex items-center gap-1 py-0.5 text-[11px] text-gray-400 hover:text-gray-600 ml-1"
                        >
                          {collapsed[grpId] ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                          {grp}
                          <span className="text-[10px] text-gray-300">{members.length}</span>
                        </button>
                        {!collapsed[grpId] && (
                          <div className="flex flex-col gap-0.5 ml-3">
                            {members.map((l) => (
                              <LayerRow key={l.layer_id} layer={l} onToggle={onToggle} roomy={roomy} />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                 </div>
               )}
             </div>
           )}
              </>
            )
          })()}
                </div>
              )}
            </div>
          )
        })}
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-2 py-2.5 text-sm text-gray-400 hover:text-pink-600 hover:bg-pink-50 rounded-xl mt-0.5"
        >
          <Plus size={15} /> 新建图层
        </button>
      </div>

      <div className="mt-auto">
        <div className={clsx('rounded-2xl p-3', roomy ? 'bg-white/70 border border-black/5' : 'bg-gray-100')}>
          <p className="text-[11px] text-gray-400 mb-1">倒计时</p>
          <p className="text-sm text-gray-600 font-medium select-text">{countdown}</p>
        </div>
      </div>

      {showCreate && <CreateLayerDialog onClose={() => setShowCreate(false)} onCreated={onCreated} />}
    </div>
  )
}

function LayerRow({ layer, onToggle, roomy = false }: { layer: Layer; onToggle: (id: string) => void; roomy?: boolean }) {
  return (
    <div className={clsx('flex items-center gap-2 px-1 rounded-xl hover:bg-black/[0.03]', roomy ? 'py-2.5' : 'py-1.5')}>
      <span
        className={clsx('rounded-full flex-shrink-0', roomy ? 'w-3 h-3' : 'w-2.5 h-2.5')}
        style={{ backgroundColor: layer.color ?? '#9ca3af' }}
      />
      <span className={clsx('flex-1 truncate', roomy ? 'text-[15px] text-gray-700' : 'text-sm text-gray-700')}>{layer.display_name}</span>
      <button
        onClick={() => onToggle(layer.layer_id)}
        aria-pressed={layer.enabled}
        className={clsx(
          'relative inline-flex items-center rounded-full transition-colors flex-shrink-0',
          roomy ? 'w-[46px] h-7' : 'w-8 h-[18px]',
          layer.enabled ? 'bg-emerald-500' : 'bg-gray-300',
        )}
      >
        <span
          className={clsx(
            'inline-block rounded-full bg-white shadow transition-transform duration-200',
            roomy ? 'w-[22px] h-[22px]' : 'w-3.5 h-3.5',
            layer.enabled ? (roomy ? 'translate-x-[21px]' : 'translate-x-[16px]') : roomy ? 'translate-x-[3px]' : 'translate-x-[2px]',
          )}
        />
      </button>
    </div>
  )
}

function CreateLayerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const qc = useQueryClient()
  const [kind, setKind] = useState<'color' | 'dot'>('color')
  const [mode, setMode] = useState<'solid' | 'graded' | 'tag'>('solid')
  const [name, setName] = useState('')
  const [color, setColor] = useState<string | null>(COLOR_PRESETS[0])
  const [paletteName, setPaletteName] = useState<keyof typeof GRADED_PALETTES>('绿')
  const [tag, setTag] = useState('')
  const [group, setGroup] = useState('')

  const mut = useMutation({
    mutationFn: async () => {
      const config: Record<string, unknown> = {}
      if (kind === 'color') {
        config.mode = mode
        if (mode === 'solid') config.color = color
        if (mode === 'graded') config.palette = GRADED_PALETTES[paletteName]
        if (mode === 'tag') {
          config.color = color
          const t = tag.trim()
          if (!t) throw new Error('请输入标签名')
          config.tag = t
        }
      }
      const defaultName = kind === 'color'
        ? (mode === 'solid' ? '自定义涂色' : mode === 'graded' ? '分级涂色' : '标签涂色')
        : '自定义图层'
      await createLayer({
        display_name: name.trim() || defaultName,
        color: kind === 'color' && mode === 'graded' ? null : color,
        kind,
        group: group.trim() || null,
        config,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['layers'] })
      onCreated()
    },
  })

  return (
    <Modal title="新建图层" onClose={onClose} width={440}>
      <div className="flex flex-col gap-4">
        <Field label="图层类型">
          <div className="grid grid-cols-2 gap-2">
            {([
              { k: 'color', label: '涂色图层', desc: '给日期格子涂色' },
              { k: 'dot', label: '点点图层', desc: '显示色点+信息' },
            ] as const).map((t) => (
              <button
                key={t.k}
                onClick={() => setKind(t.k)}
                className={clsx(
                  'flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg border text-sm transition',
                  kind === t.k ? 'border-pink-400 bg-pink-50 text-pink-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                )}
              >
                <span className="font-medium">{t.label}</span>
                <span className="text-[10px] text-gray-400">{t.desc}</span>
              </button>
            ))}
          </div>
        </Field>

        <Field label="图层名称">
          <input
            className="tt-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'dot' ? '如：朋友A约饭' : mode === 'solid' ? '如：早起打卡' : mode === 'graded' ? '如：项目进度' : '如：重要客户跟进'}
          />
        </Field>

        <Field label="归类分组（可选）">
          <input
            className="tt-input"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder={kind === 'dot' ? '如：约饭（留空则不分组）' : '如：打卡（留空则不分组）'}
          />
          <p className="text-[11px] text-gray-400 mt-1">填相同的分组名会收纳到一起（如多个"约饭"图层都填"约饭"）。</p>
        </Field>

        {kind === 'color' && (
          <>
            <Field label="涂色模板">
              <div className="grid grid-cols-3 gap-2">
                {([
                  { k: 'solid', label: '习惯打卡', desc: '单色涂满' },
                  { k: 'graded', label: '工作完成度', desc: '五档颜色' },
                  { k: 'tag', label: '关联涂色', desc: '按待办标签' },
                ] as const).map((t) => (
                  <button
                    key={t.k}
                    onClick={() => setMode(t.k)}
                    className={clsx(
                      'flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg border text-sm transition',
                      mode === t.k ? 'border-pink-400 bg-pink-50 text-pink-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    <span className="font-medium">{t.label}</span>
                    <span className="text-[10px] text-gray-400">{t.desc}</span>
                  </button>
                ))}
              </div>
            </Field>

            {mode === 'graded' ? (
              <Field label="五档颜色预设">
                <div className="flex gap-2">
                  {(Object.keys(GRADED_PALETTES) as (keyof typeof GRADED_PALETTES)[]).map((pk) => (
                    <button
                      key={pk}
                      onClick={() => setPaletteName(pk)}
                      className={clsx(
                        'flex items-center gap-1 px-2 py-1.5 rounded-lg border text-sm',
                        paletteName === pk ? 'border-pink-400 bg-pink-50 text-pink-700' : 'border-gray-200 text-gray-600',
                      )}
                    >
                      {pk}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 mt-2">
                  {GRADED_PALETTES[paletteName].map((c, i) => (
                    <span key={i} className="flex-1 h-6 rounded" style={{ backgroundColor: c }} />
                  ))}
                </div>
              </Field>
            ) : (
              <Field label="颜色">
                <div className="flex gap-1.5 flex-wrap">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={clsx(
                        'w-7 h-7 rounded-full transition',
                        color === c && 'ring-2 ring-pink-400 ring-offset-2',
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </Field>
            )}

            {mode === 'tag' && (
              <Field label="关联待办标签">
                <input
                  className="tt-input"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="输入标签名（如：客户）"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  所有带该标签的待办，其计划日期 / 截止日期会自动染上图层颜色。
                </p>
              </Field>
            )}
          </>
        )}

        <p className="text-[11px] text-gray-400">
          ⚠️ 删除图层只能在「设置」页面进行，删除后该图层的标记数据不会保留。
        </p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">取消</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="px-4 py-1.5 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-40"
          >
            {mut.isPending ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
