import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Trash2 } from 'lucide-react'
import { Modal, Field } from './ui/Modal'
import {
  toggleLayer, updateLayerConfig, deleteLayer,
  getTodoBusyConfig, setTodoBusyConfig, recomputeTodoBusy, type TodoBusyConfig,
  getTodoReminderConfig, setTodoReminderConfig, type TodoReminderConfig,
  getSyncConfig, getSyncStatus, saveSyncConfig, testSync, syncNow, resolveSync,
  type SyncResult,
} from '../adapt/api'
import type { Layer } from '../adapt/types'
import { LANGS, LANG_META, chooseLang, useLang, useT, useTPlural, type I18n, type Lang } from '../i18n'

interface Props {
  layers: Layer[]
  onToggleLayer: (layerId: string) => void
  onClose: () => void
}

/** 语言设置行（20260930 本地化任务书 P2）：endonym 显示 + 即时切换 */
function LanguageSection() {
  const t = useT()
  const current = useLang()
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('language.settingsLabel')}</h3>
      <div className="flex flex-wrap gap-2">
        {LANGS.map((lang: Lang) => (
          <button
            key={lang}
            onClick={() => chooseLang(lang)}
            aria-pressed={current === lang}
            className={clsx(
              'px-3 py-1.5 rounded-lg border text-sm transition',
              current === lang
                ? 'border-pink-400 bg-pink-50 text-pink-700 font-medium'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50',
            )}
          >
            {LANG_META[lang].endonym}
          </button>
        ))}
      </div>
    </section>
  )
}

export function SettingsDialog({ layers, onToggleLayer, onClose }: Props) {
  const t = useT()
  const customLayers = layers.filter((l) => l.layer_id.startsWith('custom_'))

  return (
    <Modal title={t('common.settings')} onClose={onClose} width={720}>
      <div className="flex flex-col gap-5">
        <LanguageSection />
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('settings.layers.sectionTitle')}</h3>
          {customLayers.length === 0 ? (
            <p className="text-sm text-gray-400">{t('settings.layers.empty')}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {customLayers.map((l) => (
                <CustomLayerRow key={l.layer_id} layer={l} onToggle={onToggleLayer} />
              ))}
            </div>
          )}
        </section>

        <BusyConfigSection />
        <ReminderConfigSection />
        <SyncConfigSection />
        <PrivacySection />
      </div>
      <p className="mt-5 pt-3 border-t border-gray-100 text-center text-[11px] text-gray-400 select-none">
        TT Calendar <span className="font-medium">v2.2.0</span>
      </p>
    </Modal>
  )
}

function PrivacySection() {
  const t = useT()
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('settings.privacy.sectionTitle')}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">
        {t('settings.privacy.intro')} {t('settings.privacy.introSync')}
      </p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-pink-600 select-none hover:text-pink-700">{t('settings.privacy.showFull')}</summary>
        <div className="mt-2 space-y-2 text-xs text-gray-500 leading-relaxed border border-gray-100 rounded-md p-3 bg-gray-50/60">
          <p><b className="text-gray-600">{t('settings.privacy.rule1Title')}</b>{t('settings.privacy.rule1Body')}</p>
          <p><b className="text-gray-600">{t('settings.privacy.rule2Title')}</b>{t('settings.privacy.rule2Body')}</p>
          <p><b className="text-gray-600">{t('settings.privacy.rule3Title')}</b>{t('settings.privacy.rule3Body')}</p>
          <p><b className="text-gray-600">{t('settings.privacy.rule4Title')}</b>{t('settings.privacy.rule4Body')}</p>
          <p><b className="text-gray-600">{t('settings.privacy.rule5Title')}</b>{t('settings.privacy.rule5Body')}</p>
          <p>
            {t('settings.privacy.fullPolicyLine')}
            <a
              href="https://github.com/TTDiang2/TT_Calendar_Neo/blob/main/docs/PRIVACY.md"
              target="_blank"
              rel="noreferrer"
              className="text-pink-600 hover:underline break-all"
            >
              github.com/TTDiang2/TT_Calendar_Neo/blob/main/docs/PRIVACY.md
            </a>
          </p>
        </div>
      </details>
    </section>
  )
}

function BusyConfigSection() {
  const qc = useQueryClient()
  const t = useT()
  const tPlural = useTPlural()
  const { data: cfg } = useQuery({ queryKey: ['todoBusyConfig'], queryFn: getTodoBusyConfig, staleTime: 60_000 })
  const [local, setLocal] = useState<TodoBusyConfig | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (cfg && !local) setLocal(cfg)
  }, [cfg, local])

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!local) return
      await setTodoBusyConfig(local)
      const res = await recomputeTodoBusy()
      return res.days_written
    },
    onSuccess: (days) => {
      qc.invalidateQueries({ queryKey: ['todoBusyConfig'] })
      qc.invalidateQueries({ queryKey: ['view'] })
      setMsg(tPlural('settings.busy.savedDays', days ?? 0))
    },
  })

  const setNum = (path: (string | number)[], v: string) => {
    if (!local) return
    const n = Number(v)
    if (Number.isNaN(n)) return
    setLocal((prev) => {
      const next = structuredClone(prev)
      const root = next as unknown as Record<string, unknown>
      let cur: Record<string, unknown> = root
      for (let i = 0; i < path.length - 1; i++) {
        cur = cur[path[i]] as Record<string, unknown>
      }
      cur[path[path.length - 1]] = n
      return next
    })
  }

  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('settings.busy.sectionTitle')}</h3>
      <p className="text-xs text-gray-400 mb-2">
        {t('settings.busy.desc')}
      </p>
      {!local ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Field label={t('settings.busy.fieldDue')}>
              <input type="number" step="0.5" className="tt-input w-full" value={local.weights.due_date}
                onChange={(e) => setNum(['weights', 'due_date'], e.target.value)} />
            </Field>
            <Field label={t('settings.busy.fieldPlanned')}>
              <input type="number" step="0.5" className="tt-input w-full" value={local.weights.planned_date}
                onChange={(e) => setNum(['weights', 'planned_date'], e.target.value)} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Field label={t('settings.busy.fieldImportance')}>
              <div className="flex gap-1">
                {(['high', 'medium', 'low'] as const).map((k) => (
                  <input key={k} type="number" step="0.5" className="tt-input w-14" value={local.weights.importance[k]}
                    onChange={(e) => setNum(['weights', 'importance', k], e.target.value)} />
                ))}
              </div>
            </Field>
            <Field label={t('settings.busy.fieldComplexity')}>
              <div className="flex gap-1">
                {(['high', 'medium', 'low'] as const).map((k) => (
                  <input key={k} type="number" step="0.5" className="tt-input w-14" value={local.weights.complexity[k]}
                    onChange={(e) => setNum(['weights', 'complexity', k], e.target.value)} />
                ))}
              </div>
            </Field>
          </div>
          <Field label={t('settings.busy.fieldThresholds')}>
            <div className="flex gap-1">
              {local.thresholds.map((th, i) => (
                <input key={i} type="number" className="tt-input w-12" value={th}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isNaN(n)) return
                    const next = structuredClone(local)
                    next.thresholds[i] = n
                    setLocal(next)
                  }} />
              ))}
            </div>
          </Field>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-500 flex-shrink-0">{t('settings.busy.predictLayer')}</span>
            <div className="flex gap-1">
              {local.predict_colors.map((c, i) => (
                <input key={i} type="color" value={c} title={t('settings.busy.levelTitle', { n: i + 1 })}
                  onChange={(e) => {
                    const next = structuredClone(local)
                    next.predict_colors[i] = e.target.value
                    setLocal(next)
                  }} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-500 flex-shrink-0">{t('settings.busy.actualLayer')}</span>
            <div className="flex gap-1">
              {local.done_colors.map((c, i) => (
                <input key={i} type="color" value={c} title={t('settings.busy.levelTitle', { n: i + 1 })}
                  onChange={(e) => {
                    const next = structuredClone(local)
                    next.done_colors[i] = e.target.value
                    setLocal(next)
                  }} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="px-4 py-1.5 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-40"
            >
              {saveMut.isPending ? t('settings.saving') : t('settings.busy.save')}
            </button>
            {msg && <span className="text-sm text-green-600">{msg}</span>}
          </div>
        </div>
      )}
    </section>
  )
}

/** 非 React 工具函数：t 由调用方传入（规范 §0） */
function reportText(t: I18n['t'], r: SyncResult): string {
  return t('settings.sync.report', {
    pulled: r.pulled ?? 0, pushed: r.pushed ?? 0, conflicts: r.conflicts ?? 0, deleted: r.deleted ?? 0,
  }) + (r.warning ? t('settings.sync.reportWarning', { warning: r.warning }) : '')
}

function ReminderConfigSection() {
  const qc = useQueryClient()
  const t = useT()
  const { data: cfg } = useQuery({
    queryKey: ['todoReminderConfig'],
    queryFn: getTodoReminderConfig,
    staleTime: 60_000,
  })
  const [local, setLocal] = useState<TodoReminderConfig | null>(null)
  useEffect(() => { if (cfg && !local) setLocal(cfg) }, [cfg, local])

  const saveMut = useMutation({
    mutationFn: async (next: TodoReminderConfig) => {
      const saved = await setTodoReminderConfig(next)
      setLocal(saved)
      qc.invalidateQueries({ queryKey: ['todoReminderConfig'] })
      qc.invalidateQueries({ queryKey: ['reminderBanner'] })
      return saved
    },
  })

  if (!local) {
    return (
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('settings.reminder.sectionTitle')}</h3>
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      </section>
    )
  }

  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('settings.reminder.sectionTitle')}</h3>
      <p className="text-xs text-gray-400 mb-2">
        {t('settings.reminder.desc')}
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={local.enabled}
            onChange={(e) => saveMut.mutate({ ...local, enabled: e.target.checked })}
            disabled={saveMut.isPending}
            className="rounded border-gray-300 text-pink-500 focus:ring-pink-400"
          />
          <span className="text-sm text-gray-700">{t('settings.reminder.enable')}</span>
        </label>
        <Field label={t('settings.reminder.fieldTime')}>
          <input
            type="time"
            value={local.time}
            onChange={(e) => setLocal({ ...local, time: e.target.value })}
            onBlur={() => {
              if (local.time !== cfg?.time) saveMut.mutate(local)
            }}
            disabled={!local.enabled || saveMut.isPending}
            className="tt-input"
          />
        </Field>
      </div>
    </section>
  )
}

function SyncConfigSection() {
  const qc = useQueryClient()
  const t = useT()
  const tPlural = useTPlural()
  const { data: cfg } = useQuery({ queryKey: ['syncConfig'], queryFn: getSyncConfig })
  const { data: status } = useQuery({ queryKey: ['syncStatus'], queryFn: getSyncStatus })
  const [repo, setRepo] = useState('')
  const [branch, setBranch] = useState('main')
  const [token, setToken] = useState('')
  const [auto, setAuto] = useState(true)
  const [closeSync, setCloseSync] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<'save' | 'test' | 'sync' | null>(null)
  const [decision, setDecision] = useState<number | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    if (cfg && !loaded.current) {
      loaded.current = true
      setRepo(cfg.repo)
      setBranch(cfg.branch)
      setAuto(cfg.auto_on_start)
      setCloseSync(cfg.sync_on_close)
    }
  }, [cfg])

  const persist = () => saveSyncConfig({
    repo, branch, token: token || undefined, auto_on_start: auto, sync_on_close: closeSync,
  })

  const onSave = async () => {
    setBusy('save'); setMsg(null)
    try {
      await persist()
      setToken('')
      qc.invalidateQueries({ queryKey: ['syncConfig'] })
      setMsg({ ok: true, text: t('settings.sync.savedMsg') })
    } catch (e) { setMsg({ ok: false, text: String(e) }) } finally { setBusy(null) }
  }

  const onTest = async () => {
    setBusy('test'); setMsg(null)
    try {
      await persist()
      setToken('')
      const r = await testSync()
      qc.invalidateQueries({ queryKey: ['syncConfig'] })
      setMsg({ ok: r.ok, text: r.detail })
    } catch (e) { setMsg({ ok: false, text: String(e) }) } finally { setBusy(null) }
  }

  const onSync = async () => {
    setBusy('sync'); setMsg(null)
    try {
      const r = await syncNow()
      if (r.result === 'needs_decision') {
        setDecision(r.remote_rows ?? 0)
      } else if (r.result === 'initialized') {
        setMsg({ ok: true, text: tPlural('settings.sync.initDone', r.pushed ?? 0) })
      } else {
        setMsg({ ok: true, text: reportText(t, r) })
      }
      qc.invalidateQueries()
    } catch (e) { setMsg({ ok: false, text: String(e) }) } finally { setBusy(null) }
  }

  const onResolve = async (mode: 'pull_overwrite' | 'merge_push') => {
    setBusy('sync'); setMsg(null)
    try {
      const r = await resolveSync(mode)
      setDecision(null)
      setMsg({ ok: true, text: t('settings.sync.resolvedDone', { report: reportText(t, r) }) })
      qc.invalidateQueries()
    } catch (e) { setMsg({ ok: false, text: String(e) }) } finally { setBusy(null) }
  }

  const lastLine = status?.at
    ? t(status.ok ? 'settings.sync.lastSyncOk' : 'settings.sync.lastSyncWarn', { time: status.at.slice(11, 19) })
    : t('settings.sync.lastSyncNever')

  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('settings.sync.sectionTitle')}</h3>
      <p className="text-xs text-gray-400 mb-2">
        {t('settings.sync.desc')}
      </p>
      {decision !== null && (
        <div className="mb-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm">
          <p className="mb-2">{tPlural('settings.sync.decisionPrompt', decision)}</p>
          <div className="flex gap-2">
            <button disabled={busy !== null} onClick={() => onResolve('merge_push')}
              className="px-3 py-1.5 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-40">
              {t('settings.sync.resolveMerge')}
            </button>
            <button disabled={busy !== null} onClick={() => onResolve('pull_overwrite')}
              className="px-3 py-1.5 text-sm bg-white border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40">
              {t('settings.sync.resolveOverwrite')}
            </button>
          </div>
        </div>
      )}
      {status?.notice && decision === null && (
        <div className="mb-3 p-3 rounded-md bg-sky-50 border border-sky-200 text-sm text-sky-800">
          {status.notice}
        </div>
      )}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-20 flex-shrink-0">{status?.configured ? lastLine : t('settings.sync.notConfigured')}</span>
        </div>
        <div className="flex gap-2">
          <Field label={t('settings.sync.fieldRepo')}>
            <input className="tt-input w-full" placeholder="TTDiang2/tt-calendar-data"
              value={repo} onChange={(e) => setRepo(e.target.value)} />
          </Field>
          <Field label={t('settings.sync.fieldBranch')}>
            <input className="tt-input w-24" value={branch} onChange={(e) => setBranch(e.target.value)} />
          </Field>
        </div>
        <Field label={t('settings.sync.patLabel', { state: cfg?.has_token ? t('settings.sync.patStored') : t('settings.sync.patMissing') })}>
          <input type="password" className="tt-input w-full" placeholder={cfg?.has_token ? '••••••••' : 'github_pat_...'}
            value={token} onChange={(e) => setToken(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          {t('settings.sync.autoOnStart')}
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
          <input type="checkbox" checked={closeSync} onChange={(e) => setCloseSync(e.target.checked)} />
          {t('settings.sync.syncOnClose')}
        </label>
        <div className="flex items-center gap-2">
          <button onClick={onSave} disabled={busy !== null || !repo}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-40">
            {busy === 'save' ? t('settings.saving') : t('common.save')}
          </button>
          <button onClick={onTest} disabled={busy !== null || !repo || (!token && !cfg?.has_token)}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-40">
            {busy === 'test' ? t('settings.sync.testing') : t('settings.sync.test')}
          </button>
          <button onClick={onSync} disabled={busy !== null || !repo || !cfg?.has_token}
            className="px-4 py-1.5 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-40">
            {busy === 'sync' ? t('settings.sync.syncing') : t('settings.sync.syncNow')}
          </button>
          {msg && <span className={`text-sm ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</span>}
        </div>
      </div>
    </section>
  )
}

function CustomLayerRow({ layer, onToggle }: { layer: Layer; onToggle: (id: string) => void }) {
  const qc = useQueryClient()
  const t = useT()
  const [confirming, setConfirming] = useState(false)
  const delMut = useMutation({
    mutationFn: () => deleteLayer(layer.layer_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['layers'] })
      qc.invalidateQueries({ queryKey: ['view'] })
      setConfirming(false)
    },
  })
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50">
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: layer.color ?? '#9ca3af' }} />
      {/* 图层名为用户数据（custom_* 无内置映射），原样渲染 */}
      <span className="flex-1 text-sm text-gray-700 truncate">{layer.display_name}</span>
      <button
        onClick={() => onToggle(layer.layer_id)}
        aria-pressed={layer.enabled}
        className={clsx(
          'relative inline-flex items-center w-8 h-[18px] rounded-full transition-colors flex-shrink-0',
          layer.enabled ? 'bg-pink-500' : 'bg-gray-300',
        )}
      >
        <span
          className={clsx(
            'inline-block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform duration-200',
            layer.enabled ? 'translate-x-[16px]' : 'translate-x-[2px]',
          )}
        />
      </button>
      {confirming ? (
        <button
          onClick={() => delMut.mutate()}
          className="text-[11px] text-red-600 bg-red-50 px-2 py-0.5 rounded hover:bg-red-100"
        >
          {t('settings.layers.confirmDelete')}
        </button>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="text-gray-300 hover:text-red-500 p-1"
          title={t('settings.layers.deleteTitle')}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}
