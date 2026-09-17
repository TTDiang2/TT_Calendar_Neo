import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import type { Todo, TodoList } from '../adapt/types'
import { NotesEditorModal } from './NotesEditorModal'
import { animDrawerIn } from '../anim'
import { useIsWideScreen } from '../hooks/useMedia'

interface Props {
  todo: Todo | null
  lists: TodoList[]
  onClose: () => void
  onSave: (data: Todo) => void
  onDelete: (id: string) => void
}

export interface TodoDetailPanelRef {
  openNotes: () => void
}

const IMPORTANCE_OPTIONS: { key: string; label: string }[] = [
  { key: 'high', label: '高' },
  { key: 'normal', label: '普通' },
  { key: 'low', label: '低' },
]

const STATUS_OPTIONS: { key: string; label: string }[] = [
  { key: 'notStarted', label: '未开始' },
  { key: 'inProgress', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'waitingOnOthers', label: '等待他人' },
  { key: 'deferred', label: '已推迟' },
]

const COMPLEXITY_OPTIONS: { key: string; label: string }[] = [
  { key: 'simple', label: '简单' },
  { key: 'medium', label: '中等' },
  { key: 'hard', label: '复杂' },
]

export const TodoDetailPanel = forwardRef<TodoDetailPanelRef, Props>(function TodoDetailPanel(
  { todo, lists, onClose, onSave, onDelete },
  ref,
) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [importance, setImportance] = useState<Todo['importance']>('normal')
  const [dueDate, setDueDate] = useState('')
  const [plannedDate, setPlannedDate] = useState('')
  const [startDate, setStartDate] = useState('')
  const [complexity, setComplexity] = useState<Todo['complexity']>('medium')
  const [tagsText, setTagsText] = useState('')
  const [notesModalOpen, setNotesModalOpen] = useState(false)
  const [listId, setListId] = useState('')
  const [status, setStatus] = useState<Todo['status']>('notStarted')
  const [dueExpanded, setDueExpanded] = useState(false)
  // 手机查看优先模式：当前进入编辑态的字段（null = 纯浏览，不渲染输入框不弹输入法）
  const [editing, setEditing] = useState<string | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)

  useImperativeHandle(ref, () => ({
    openNotes: () => setNotesModalOpen(true),
  }))
  const [plannedExpanded, setPlannedExpanded] = useState(false)

  // 手机端（<lg）待办详情是右侧边栏抽屉（20260916 任务书：与日历页右侧边栏统一）。
  // 仅「无选中 → 选中」滑入一次；A→B 切换与桌面端（静态右栏）都不播动画——
  // 桌面播放滑入是 20260916 审核缺陷 1（任务书红线：桌面零变化）
  const isDesktop = useIsWideScreen()
  const prevOpenRef = useRef(false)
  useEffect(() => {
    const open = !!todo
    if (open && !prevOpenRef.current && !isDesktop) animDrawerIn(panelRef.current, 1)
    prevOpenRef.current = open
  }, [todo?.id, isDesktop])

  const formRef = useRef({ title, body, importance, dueDate, plannedDate, startDate, complexity, tagsText, listId, status })
  formRef.current = { title, body, importance, dueDate, plannedDate, startDate, complexity, tagsText, listId, status }

  const savingRef = useRef(false)
  const [saving, setSaving] = useState(false)
  // 当前正在编辑的对象（可能是真实 todo，也可能是「新建待办」的幻影 id=''）
  // cleanup 必须读 ref 的当前值，不能闭包捕获 —— 详见下方 effect 说明
  const prevTodoRef = useRef<Todo | null>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  // 消费型标记：显式保存 / 删除已自行落盘，紧随其后的那一次 cleanup 不得重复提交
  const skipFlushRef = useRef(false)

  /**
   * 把当前表单内容落盘 —— 所有「离开编辑态」路径的唯一出口。
   * - 真实任务：有改动才 PUT，无改动静默跳过（避免每次开合都打一次接口）
   * - 幻影新建（id === '' / '__NEW__'）：标题非空就 POST 创建
   */
  const flushSave = (target: Todo) => {
    const f = formRef.current
    const title = f.title.trim()
    // 空标题 / 无归属列表 = 用户放弃编辑，不落盘（否则会建出空任务或 list_id 为空的脏数据）
    if (!title || !f.listId) return
    const tags = f.tagsText.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
    const isPhantom = target.id === '' || target.id === '__NEW__'
    if (!isPhantom) {
      const changed =
        f.title !== target.title ||
        (f.body || '') !== (target.body ?? '') ||
        f.importance !== target.importance ||
        (f.dueDate || '') !== (target.due_date ?? '') ||
        (f.plannedDate || '') !== (target.planned_date ?? '') ||
        (f.startDate || '') !== (target.start_date ?? '') ||
        f.complexity !== (target.complexity || 'medium') ||
        JSON.stringify(tags) !== JSON.stringify(target.tags ?? []) ||
        f.listId !== target.list_id ||
        f.status !== target.status
      if (!changed) return
    }
    onSaveRef.current({
      ...target,
      title,
      body: f.body.trim() || null,
      importance: f.importance,
      due_date: f.dueDate || null,
      planned_date: f.plannedDate || null,
      start_date: f.startDate || null,
      complexity: f.complexity,
      tags: tags.length ? tags : null,
      list_id: f.listId,
      status: f.status,
    })
  }

  useEffect(() => {
    prevTodoRef.current = todo

    if (todo) {
      // 同步把表单快照写进 formRef，使 ref 与「刚装载的 todo」保持一致。
      // 两个必要作用：
      // 1) StrictMode 开发模式下 React 会「body → cleanup → body」模拟一次卸载，
      //    若 ref 还停在初始空值，那次模拟 cleanup 会拿空表单去 flush，可能误发 PUT；
      // 2) 保证「打开后没改动就关闭」时 flushSave 的 changed 判定恒为 false。
      formRef.current = {
        title: todo.title,
        body: todo.body ?? '',
        importance: todo.importance,
        dueDate: todo.due_date ?? '',
        plannedDate: todo.planned_date ?? '',
        startDate: todo.start_date ?? '',
        complexity: todo.complexity || 'medium',
        tagsText: (todo.tags ?? []).join(', '),
        listId: todo.list_id,
        status: todo.status,
      }
      setTitle(todo.title)
      setBody(todo.body ?? '')
      setImportance(todo.importance)
      setDueDate(todo.due_date ?? '')
      setPlannedDate(todo.planned_date ?? '')
      setStartDate(todo.start_date ?? '')
      setComplexity(todo.complexity || 'medium')
      setTagsText((todo.tags ?? []).join(', '))
      setListId(todo.list_id)
      setStatus(todo.status)
      setDueExpanded(false)
      setPlannedExpanded(false)
      setEditing(null)
      savingRef.current = false
      setSaving(false)
    }
    skipFlushRef.current = false

    return () => {
      // 离开「上一个编辑对象」时统一落盘。
      //
      // 为什么放在 cleanup 而不是 body：
      //   cleanup 在 React 提交新渲染之后、下一个 effect body 之前执行，此时
      //   formRef.current 仍是用户刚输入的值；而组件卸载时 React 同样会执行 cleanup。
      //   于是这一条路径同时覆盖了 ——
      //     点 X 关闭 / 点侧栏切列表 / 切到另一个待办 / 切视图导致整个面板卸载
      //   之前把条件写成「prevIsPhantom && curId === null」，只覆盖了「切到无选中」
      //   一种情况，另外三种都会静默丢输入（用户报的就是这个）。
      //
      // 为什么读 ref 而不是闭包捕获 prev：
      //   捕获到的是「body 执行那一刻」的上一个 todo，A→B→C 连续切换时会拿到 null 导致漏存。
      if (skipFlushRef.current) {
        skipFlushRef.current = false
        return
      }
      const leaving = prevTodoRef.current
      if (leaving) flushSave(leaving)
    }
  }, [todo?.id])

  if (!todo) {
    if (!isDesktop) return null
    return (
      <aside className="w-72 bg-white border-l border-gray-200 p-4 flex-shrink-0">
        <p className="text-sm text-gray-400">点击待办查看详情</p>
      </aside>
    )
  }

  const tags = tagsText.split(/[,，]/).map((t) => t.trim()).filter(Boolean)

  // 构造完整保存数据（与 useEffect 自动保存的字段一一对应）
  const buildData = (): Todo => ({
    ...todo!,
    title: title.trim(),
    body: body.trim() || null,
    importance,
    due_date: dueDate || null,
    planned_date: plannedDate || null,
    start_date: startDate || null,
    complexity,
    tags: tags.length ? tags : null,
    list_id: listId,
    status,
  })

  // 显式保存：自己提交一次，再用 skipFlushRef 让紧随其后的 cleanup 别重复提交
  const save = () => {
    if (savingRef.current) return
    if (!title.trim() || !listId) return
    savingRef.current = true
    setSaving(true)
    skipFlushRef.current = true
    onSave(buildData())
    onClose()
  }

  // 表单体（桌面右栏 / 手机抽屉共用同一份 JSX）
  const header = (
    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{todo.id === '' || todo.id === '__NEW__' ? '新建待办' : '待办详情'}</p>
      <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0 ml-2" title="关闭">
        <X size={16} />
      </button>
    </div>
  )

  const form = (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <textarea
        autoFocus
        rows={2}
        className="w-full text-base font-medium border-0 border-b border-transparent hover:border-gray-200 focus:border-pink-400 focus:outline-none py-1 resize-none break-words whitespace-pre-wrap"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="标题"
      />

      <textarea
        className="w-full text-sm border border-gray-200 rounded-md p-2 min-h-[80px] focus:border-pink-400 focus:outline-none resize-y cursor-text"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onDoubleClick={() => setNotesModalOpen(true)}
        title="双击放大编辑"
        placeholder="备注（可选）"
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-500">
          <span className="block mb-1">列表</span>
          <select className="tt-input" value={listId} onChange={(e) => setListId(e.target.value)}>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>{l.display_name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          <span className="block mb-1">重要性</span>
          <select className="tt-input" value={importance} onChange={(e) => setImportance(e.target.value as Todo['importance'])}>
            {IMPORTANCE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className={clsx('text-xs text-gray-500', dueExpanded && 'col-span-2', plannedExpanded && 'hidden')}>
          <span className="block mb-1">截止日期</span>
          <DueDateQuickPicker value={dueDate} onChange={setDueDate} expanded={dueExpanded} setExpanded={setDueExpanded} />
        </label>
        <label className={clsx('text-xs text-gray-500', plannedExpanded && 'col-span-2', dueExpanded && 'hidden')}>
          <span className="block mb-1">计划日期</span>
          <DueDateQuickPicker value={plannedDate} onChange={setPlannedDate} expanded={plannedExpanded} setExpanded={setPlannedExpanded} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-500">
          <span className="block mb-1">开始日</span>
          <input type="date" className="tt-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="text-xs text-gray-500">
          <span className="block mb-1">复杂度</span>
          <select className="tt-input" value={complexity} onChange={(e) => setComplexity(e.target.value as Todo['complexity'])}>
            {COMPLEXITY_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-500">
          <span className="block mb-1">状态</span>
          <select className="tt-input" value={status} onChange={(e) => setStatus(e.target.value as Todo['status'])}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="text-xs text-gray-500 block">
        <span className="block mb-1">标签（逗号分隔，自定义）</span>
        <input
          className="tt-input"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder="工作, 学习, 家庭…"
        />
        {tags.length > 0 && (
          <span className="flex flex-wrap gap-1 mt-1.5">
            {tags.map((t) => (
              <span key={t} className="text-[10px] text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{t}</span>
            ))}
          </span>
        )}
      </label>
    </div>
  )

  const footer = (
    <div className="px-4 py-3 border-t border-gray-100 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => {
            // 删除后面板会关闭，必须阻止 cleanup 把这条刚删掉的记录又 flush 回去
            if (confirm(`删除待办「${todo.title}」？`)) {
              skipFlushRef.current = true
              onDelete(todo.id)
            }
          }}
          className="flex items-center gap-1 text-sm text-red-500 hover:text-red-600 whitespace-nowrap"
        >
          <Trash2 size={14} /> 删除
        </button>
        <button
          onClick={save}
          disabled={!title.trim() || !listId || saving}
          className="px-4 py-1.5 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-40 whitespace-nowrap"
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
      <p className="text-[11px] text-gray-400 text-right leading-none whitespace-nowrap">
        切换页面自动保存 · <span className="font-medium text-gray-500">Ctrl+Enter</span> 直接保存
      </p>
    </div>
  )

  const notesModal = (
    <NotesEditorModal
      open={notesModalOpen}
      initialValue={body}
      title={title || '备注'}
      onClose={(next) => {
        setBody(next)
        setNotesModalOpen(false)
      }}
    />
  )

  const onKeyDownSave = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter 直接保存（新建待办时同样生效）
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      if (title.trim() && listId && !savingRef.current) save()
    }
  }

  // 桌面（lg+）：静态右栏（原样，任务书红线：桌面零变化）
  if (isDesktop) {
    return (
      <aside className="w-72 bg-white border-l border-gray-200 flex flex-col overflow-hidden flex-shrink-0" onKeyDown={onKeyDownSave}>
        {header}
        {form}
        {footer}
        {notesModal}
      </aside>
    )
  }

  // ── 手机（<lg）：查看优先的详情抽屉（20260917 任务书 1.1-10）──
  // 打开即浏览：不渲染任何输入框、不 autofocus，输入法绝不自动弹出；
  // 点某个字段行才进入该字段的编辑态（输入法随之弹出是用户主动的结果）。
  // 布局改为通栏行式，修复原 grid-cols-2 挤压问题。
  const isPhantom = todo.id === '' || todo.id === '__NEW__'
  const listName = lists.find((l) => l.id === listId)?.display_name ?? '—'

  const metaRow = (key: string, label: string, value: React.ReactNode, editor: React.ReactNode) => (
    <div className="border-b border-black/5 last:border-b-0">
      {editing === key ? (
        <div className="px-4 py-2.5 flex items-center gap-2">
          <span className="text-[13px] text-gray-400 w-16 flex-shrink-0">{label}</span>
          <div className="flex-1 min-w-0">{editor}</div>
          <button
            onClick={() => setEditing(null)}
            className="text-xs text-pink-600 font-medium px-1 py-1 flex-shrink-0 active:opacity-60"
          >
            完成
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(key)}
          className="w-full px-4 py-3 flex items-center gap-2 text-left active:bg-black/[0.04] transition-colors"
        >
          <span className="text-[13px] text-gray-400 w-16 flex-shrink-0">{label}</span>
          <span className="flex-1 min-w-0 text-[15px] text-gray-800 truncate text-right">{value}</span>
          <svg width="8" height="12" viewBox="0 0 8 12" className="flex-shrink-0 text-gray-300">
            <path d="M1.5 1L6.5 6L1.5 11" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  )

  const mobileBody = (
    <>
      {/* 标题：默认纯展示，点一下才进入编辑（输入法只在主动点击后出现） */}
      {editing === 'title' ? (
        <div className="px-4 pt-3">
          <textarea
            autoFocus
            rows={2}
            className="w-full text-lg font-semibold border border-pink-200 rounded-xl p-2 focus:border-pink-400 focus:outline-none resize-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setEditing(null)}
          />
        </div>
      ) : (
        <button
          onClick={() => setEditing('title')}
          className="px-4 pt-4 pb-2 text-left w-full active:bg-black/[0.03] transition-colors"
        >
          <p className={clsx('text-lg font-semibold leading-snug break-words', title ? 'text-gray-900' : 'text-gray-300')}>
            {title || (isPhantom ? '点这里输入标题…' : '无标题（点按编辑）')}
          </p>
        </button>
      )}

      {/* 备注：预览 + 点开全屏笔记编辑器（原本就是手机友好的大编辑面） */}
      <button
        onClick={() => setNotesModalOpen(true)}
        className="mx-4 mb-3 px-3 py-2.5 rounded-xl bg-white/80 border border-black/5 text-left active:bg-black/[0.04] transition-colors"
      >
        <p className="text-[11px] text-gray-400 mb-0.5">备注</p>
        <p className={clsx('text-sm leading-snug break-words whitespace-pre-wrap line-clamp-3', body ? 'text-gray-700' : 'text-gray-300')}>
          {body || '点开写点备注…'}
        </p>
      </button>

      {/* 元信息：通栏行式（label 左 value 右），点行编辑单字段 */}
      <div className="rounded-2xl bg-white/60 border border-black/5 mx-4 mb-3 overflow-hidden">
        {metaRow('list', '清单', listName, (
          <select className="tt-input" value={listId} onChange={(e) => setListId(e.target.value)}>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>{l.display_name}</option>
            ))}
          </select>
        ))}
        {metaRow('importance', '重要性', IMPORTANCE_OPTIONS.find((o) => o.key === importance)?.label ?? importance, (
          <select className="tt-input" value={importance} onChange={(e) => setImportance(e.target.value as Todo['importance'])}>
            {IMPORTANCE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        ))}
        {metaRow('status', '状态', STATUS_OPTIONS.find((o) => o.key === status)?.label ?? status, (
          <select className="tt-input" value={status} onChange={(e) => setStatus(e.target.value as Todo['status'])}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        ))}
        {metaRow('due', '截止', dueDate || '无', (
          <DueDateQuickPicker value={dueDate} onChange={setDueDate} expanded={false} setExpanded={() => {}} />
        ))}
        {metaRow('planned', '计划', plannedDate || '无', (
          <DueDateQuickPicker value={plannedDate} onChange={setPlannedDate} expanded={false} setExpanded={() => {}} />
        ))}
        {metaRow('start', '开始日', startDate || '无', (
          <input type="date" className="tt-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        ))}
        {metaRow('complexity', '复杂度', COMPLEXITY_OPTIONS.find((o) => o.key === complexity)?.label ?? complexity, (
          <select className="tt-input" value={complexity} onChange={(e) => setComplexity(e.target.value as Todo['complexity'])}>
            {COMPLEXITY_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        ))}
        {metaRow(
          'tags',
          '标签',
          tags.length ? tags.join('、') : '无',
          <input
            className="tt-input"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="工作, 学习…"
          />,
        )}
      </div>

      {/* 底部操作：完成切换（大按钮）+ 删除 + 保存 */}
      <div className="mt-auto px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 border-t border-black/5 space-y-2 bg-white/40">
        <button
          onClick={() => {
            const nextStatus: Todo['status'] = status === 'completed' ? 'notStarted' : 'completed'
            setStatus(nextStatus)
            if (!isPhantom) {
              // 全量落盘（含切换后的状态）；面板不关闭，后续继续编辑关闭时仍会正常 flush
              onSave({ ...buildData(), status: nextStatus })
            }
          }}
          disabled={isPhantom}
          className={clsx(
            'w-full py-3 rounded-2xl text-[15px] font-semibold transition-colors disabled:opacity-40',
            status === 'completed'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-emerald-500 text-white active:bg-emerald-600',
          )}
        >
          {status === 'completed' ? '↩ 恢复为未完成' : '✓ 标记完成'}
        </button>
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              // 删除后面板会关闭，必须阻止 cleanup 把这条刚删掉的记录又 flush 回去
              if (confirm(`删除待办「${todo.title}」？`)) {
                skipFlushRef.current = true
                onDelete(todo.id)
              }
            }}
            className="flex items-center gap-1 text-sm text-red-500 active:opacity-60 py-2"
          >
            <Trash2 size={15} /> 删除
          </button>
          <button
            onClick={save}
            disabled={!title.trim() || !listId || saving}
            className="px-6 py-2 text-sm bg-pink-500 text-white rounded-full active:bg-pink-600 disabled:opacity-40"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </>
  )

  // 手机（<lg）：右侧边栏抽屉。portal 到 body —— 待办页在手势容器（contentRef）内，
  // 容器残留的 inline transform 会把 fixed 抽屉圈进内容区矩形（遮罩盖不住 dock），
  // portal 彻底绕开包含块问题（20260916 审核缺陷 2）
  return createPortal(
    <>
      <div className="fixed inset-0 z-[39] bg-black/30" onClick={onClose} />
      <aside
        ref={panelRef}
        className="glass-sheet fixed inset-y-0 right-0 z-40 w-[320px] max-w-[88vw] rounded-l-3xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
        onKeyDown={onKeyDownSave}
      >
        {header}
        <div className="flex-1 overflow-y-auto flex flex-col">
          {mobileBody}
        </div>
        {notesModal}
      </aside>
    </>,
    document.body,
  )
})

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nextMonday(): Date {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? 1 : 8 - day
  d.setDate(d.getDate() + diff)
  return d
}

/** 截止/计划日期快捷选择（详情抽屉与快速新增抽屉共用，20260917 导出复用） */
export function DueDateQuickPicker({
  value,
  onChange,
  expanded,
  setExpanded,
}: {
  value: string
  onChange: (v: string) => void
  expanded: boolean
  setExpanded: (v: boolean) => void
}) {
  const today = fmtDate(new Date())
  const tomorrow = fmtDate(new Date(Date.now() + 86400000))
  const monday = fmtDate(nextMonday())

  if (expanded) {
    return (
      <div className="flex gap-1">
        <input type="date" className="tt-input flex-1" value={value} onChange={(e) => onChange(e.target.value)} autoFocus />
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="px-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-md"
        >
          返回
        </button>
      </div>
    )
  }

  const presets = [
    { key: 'today', label: '今天', val: today },
    { key: 'tomorrow', label: '明天', val: tomorrow },
    { key: 'monday', label: '下周一', val: monday },
  ]
  const matched = presets.find((p) => p.val === value)
  const label = value ? (matched ? matched.label : value.slice(5)) : '无'

  return (
    <select
      className="tt-input"
      value={matched ? matched.key : (value ? value : '__none__')}
      onChange={(e) => {
        if (e.target.value === '__none__') onChange('')
        else if (e.target.value === '__custom__') setExpanded(true)
        else if (presets.find((x) => x.key === e.target.value)) {
          onChange(presets.find((x) => x.key === e.target.value)!.val)
        }
      }}
    >
      {!matched && value && <option value={value}>{value}（自定义）</option>}
      <option value="__none__">无</option>
      <option value="today">今天（{today.slice(5)}）</option>
      <option value="tomorrow">明天（{tomorrow.slice(5)}）</option>
      <option value="monday">下周一（{monday.slice(5)}）</option>
      <option value="__custom__">选择日期…</option>
    </select>
  )
}
