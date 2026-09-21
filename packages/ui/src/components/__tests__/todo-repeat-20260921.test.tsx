// @vitest-environment jsdom
/**
 * 20260921 待办重复（老端 todo.repeat 交接）渲染回归：
 * 走完整链路守护「手工列字段」接缝——幻影新建设了重复档位，保存后 createTodo
 * 必须带上 repeat；详情面板改档位保存后 updateTodo 必须带上 repeat。
 * （alarm_at 曾经就在这条接缝上静默丢过：TodoView onSave 新建分支手工列字段。）
 * 注：matchMedia stub 下实际驱动 TodoDetailPanel 的手机抽屉分支；被守护的
 * 断点（onSave 分支）手机/桌面共用同一段代码，保护效力一致。
 */
import { describe, expect, it, vi, beforeAll, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { setBackend, type BackendAdapter } from '../../adapt/api'
import { TodoView } from '../TodoView'
import type { Todo } from '../../adapt/types'

vi.mock('../../anim', () => ({
  animDrawerIn: () => {},
  animSheetUp: () => {},
  animEnter: () => {},
}))

afterEach(cleanup)

beforeAll(() => {
  if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }
})

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const existingTodo: Todo = {
  id: 't1',
  list_id: 'l1',
  title: '给花浇水',
  body: null,
  status: 'notStarted',
  importance: 'normal',
  due_date: null,
  planned_date: null,
  start_date: null,
  complexity: 'simple',
  tags: null,
  created_at: null,
  completed_at: null,
  sort_order: 0,
  alarm_at: null,
  repeat: null,
}

function backendWith(createTodoSpy: ReturnType<typeof vi.fn>, updateTodoSpy: ReturnType<typeof vi.fn>, todos: Todo[]) {
  setBackend({
    getTodoLists: async () => [{ id: 'l1', display_name: '任务', sort_order: 0, created_at: null }],
    getTodoStats: async () => ({ total: todos.length, incomplete: todos.length, completed: 0 }),
    getTodos: async () => todos,
    createTodoList: async (name: string) => ({ id: 'l1', display_name: name, sort_order: 0, created_at: null }),
    createTodo: createTodoSpy,
    updateTodo: updateTodoSpy,
  } as unknown as BackendAdapter)
}

describe('新建待办 · 重复档位不丢（20260921 老端 repeat 交接）', () => {
  it('幻影新建设了「每工作日」，保存后 createTodo 必须带上 repeat', async () => {
    const createTodoSpy = vi.fn(async (data: Record<string, unknown>) => ({ id: 'new1', ...data }))
    const updateTodoSpy = vi.fn()
    backendWith(createTodoSpy, updateTodoSpy, [])

    render(
      <TodoView
        viewMode="list"
        onViewModeChange={() => {}}
        listsDrawerOpen={false}
        onListsDrawerOpenChange={() => {}}
        onDetailOpenChange={() => {}}
      />,
      { wrapper },
    )

    await screen.findByText('任务')
    fireEvent.click(await screen.findByText('新建待办'))

    // 幻影新建：点标题进入编辑 → 输入 → 收起输入法（blur 收起，保持抽屉开着）
    fireEvent.click(await screen.findByText('点这里输入标题…'))
    const titleBox = document.querySelector('textarea') as HTMLTextAreaElement
    expect(titleBox).not.toBeNull()
    fireEvent.change(titleBox, { target: { value: '写日报' } })

    // 点「重复」行进入编辑态 → 选「每工作日」→ 点「完成」收起
    fireEvent.click(screen.getByText('重复'))
    const select = screen.getByDisplayValue('不重复') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'weekdays' } })
    fireEvent.click(screen.getByText('完成', { selector: 'button' }))

    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(createTodoSpy).toHaveBeenCalledTimes(1))
    const payload = createTodoSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).toMatchObject({ list_id: 'l1', title: '写日报', repeat: 'weekdays' })
  })

  it('既有待办改档位保存后，updateTodo 必须带上 repeat', async () => {
    const createTodoSpy = vi.fn()
    const updateTodoSpy = vi.fn(async (id: string, data: Record<string, unknown>) => ({ id, ...data }))
    backendWith(createTodoSpy, updateTodoSpy, [existingTodo])

    render(
      <TodoView
        viewMode="list"
        onViewModeChange={() => {}}
        listsDrawerOpen={false}
        onListsDrawerOpenChange={() => {}}
        onDetailOpenChange={() => {}}
      />,
      { wrapper },
    )

    // 点开既有待办进详情
    fireEvent.click(await screen.findByText('给花浇水'))
    fireEvent.click(screen.getByText('重复'))
    const select = screen.getByDisplayValue('不重复') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'weekly' } })
    fireEvent.click(screen.getByText('完成', { selector: 'button' }))
    fireEvent.click(screen.getByText('保存'))

    await waitFor(() => expect(updateTodoSpy).toHaveBeenCalledTimes(1))
    const [, payload] = updateTodoSpy.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload).toMatchObject({ title: '给花浇水', repeat: 'weekly' })
  })
})
