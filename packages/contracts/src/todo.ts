import { z } from 'zod'
import { DateStr, DateTimeStr } from './common'

/** 待办状态 */
export const TodoStatus = z.enum([
  'notStarted',
  'inProgress',
  'completed',
  'waitingOnOthers',
  'deferred',
])
export type TodoStatus = z.infer<typeof TodoStatus>

/** 重要性：high = 重要（TODO_VIEWS_DESIGN.md §2.2） */
export const Importance = z.enum(['low', 'normal', 'high'])
export type Importance = z.infer<typeof Importance>

/** 复杂度 */
export const Complexity = z.enum(['simple', 'medium', 'hard'])
export type Complexity = z.infer<typeof Complexity>

export const TodoListRow = z.object({
  id: z.string(),
  display_name: z.string(),
  sort_order: z.number().int().nullable().optional(),
  created_at: DateTimeStr.nullable().optional(),
  updated_at: DateTimeStr.nullable().optional(),
})
export type TodoListRow = z.infer<typeof TodoListRow>

export const TodoList = z.object({
  id: z.string(),
  display_name: z.string(),
  sort_order: z.number().int(),
  created_at: DateTimeStr.nullable(),
})
export type TodoList = z.infer<typeof TodoList>

/** todo 表行（tags 在 DB 里是逗号串或 JSON 串） */
export const TodoRow = z.object({
  id: z.string(),
  list_id: z.string(),
  title: z.string(),
  body: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  importance: z.string().nullable().optional(),
  due_date: DateStr.nullable().optional(),
  planned_date: DateStr.nullable().optional(),
  start_date: DateStr.nullable().optional(),
  complexity: z.string().nullable().optional(),
  tags: z.string().nullable().optional(),
  created_at: DateTimeStr.nullable().optional(),
  completed_at: DateTimeStr.nullable().optional(),
  sort_order: z.number().int().nullable().optional(),
  updated_at: DateTimeStr.nullable().optional(),
})
export type TodoRow = z.infer<typeof TodoRow>

/** 领域/前端用的待办（tags 已解析为数组） */
export const Todo = z.object({
  id: z.string(),
  list_id: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  status: TodoStatus,
  importance: Importance,
  due_date: DateStr.nullable(),
  planned_date: DateStr.nullable(),
  start_date: DateStr.nullable(),
  complexity: Complexity,
  tags: z.array(z.string()).nullable(),
  created_at: DateTimeStr.nullable(),
  completed_at: DateTimeStr.nullable(),
  sort_order: z.number().int(),
})
export type Todo = z.infer<typeof Todo>

export const NewTodo = Todo.partial({
  id: true,
  body: true,
  status: true,
  importance: true,
  due_date: true,
  planned_date: true,
  start_date: true,
  complexity: true,
  tags: true,
  created_at: true,
  completed_at: true,
  sort_order: true,
})
export type NewTodo = z.infer<typeof NewTodo>

export const TodoUpdate = Todo.partial().omit({ id: true })
export type TodoUpdate = z.infer<typeof TodoUpdate>

/** 排序与筛选（TODO_VIEWS_DESIGN.md） */
export const TodoSort = z.enum([
  'manual',
  'due_importance',
  'due_planned_importance',
  'due',
  'planned',
  'importance',
  'created',
])
export type TodoSort = z.infer<typeof TodoSort>

export const TodoStatusFilter = z.enum(['notStarted', 'all', 'completed'])
export type TodoStatusFilter = z.infer<typeof TodoStatusFilter>

export const TodoViewMode = z.enum(['list', 'matrix', 'kanban', 'gantt', 'jar', 'stickies'])
export type TodoViewMode = z.infer<typeof TodoViewMode>

export const IMPORTANCE_LABELS: Record<Importance, string> = {
  high: '高',
  normal: '中',
  low: '低',
}

export const COMPLEXITY_LABELS: Record<Complexity, string> = {
  hard: '困难',
  medium: '中等',
  simple: '简单',
}

export const STATUS_LABELS: Record<TodoStatus, string> = {
  notStarted: '未开始',
  inProgress: '进行中',
  waitingOnOthers: '等他人',
  deferred: '已推迟',
  completed: '已完成',
}
