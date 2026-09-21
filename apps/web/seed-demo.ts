/**
 * 演示数据种子：生成一份「好看」的示例库，供 App Store 截图 / 预览用。
 *
 * 用法：
 *   node --import tsx apps/web/seed-demo.ts <db-path>
 *   例如 artifacts/preview/demo.db
 *
 * 日期全部相对「今天」平移，任何日期跑都能得到当下鲜活的视图。
 * 目标库文件会先删除，保证幂等。
 */

import { rmSync } from 'node:fs'
import { SqliteBackend, layerConfig, openDb } from '@tt-calendar/db'

const target = process.argv[2] ?? 'artifacts/preview/demo.db'
for (const f of [target, `${target}-shm`, `${target}-wal`]) rmSync(f, { force: true })

const { db } = openDb({ path: target })
const be = new SqliteBackend(db)

const p = (n: number) => String(n).padStart(2, '0')
function d(delta: number): string {
  const t = new Date()
  t.setDate(t.getDate() + delta)
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}

// ---------- 图层（镜像真实库的内置层；订阅源已下线，不带 jisilu_*） ----------
const LAYERS: [string, string, number, string, number, string | null, string][] = [
  // id, 名称, enabled, color, sort, group, kind
  ['important', '重要日期', 1, '#EF5350', 1, null, 'color'],
  ['coloring', '充实度染色', 1, '#388E3C', 2, null, 'color'],
  ['holiday', '公共节假日', 1, '#8E24AA', 3, null, 'color'],
  ['todo', '待办', 1, '#F59E0B', 4, null, 'color'],
  ['todo_done', '待办·已完成', 1, '#818CF8', 5, null, 'color'],
  ['schedule_work', '工作', 1, '#3D6BFB', 5, '日程', 'dot'],
  ['schedule_course', '课程', 1, '#8E24AA', 6, '日程', 'dot'],
  ['schedule_sport', '运动', 1, '#10B981', 7, '日程', 'dot'],
  ['schedule_play', '玩耍', 1, '#F59E0B', 8, '日程', 'dot'],
  ['schedule_other', '其他', 1, '#64748B', 9, '日程', 'dot'],
]
db.insert(layerConfig)
  .values(
    LAYERS.map(([layerId, displayName, enabled, color, sortOrder, group, kind]) => ({
      layerId,
      displayName,
      enabled,
      color,
      sortOrder,
      kind,
      groupName: group,
      configJson: '{}',
      updatedAt: null,
    })),
  )
  .run()

// ---------- 清单 ----------
const work = be.createTodoList('工作')
const life = be.createTodoList('生活')
const study = be.createTodoList('学习')

// ---------- 待办 ----------
be.createTodo({ list_id: work.id, title: '准备季度汇报 PPT', body: '数据图先从统计页导出', importance: 'high', due_date: d(4), planned_date: d(0), complexity: 'hard', tags: ['汇报'], status: 'inProgress' })
be.createTodo({ list_id: work.id, title: '写周报', importance: 'normal', due_date: d(2), planned_date: d(0), complexity: 'simple', tags: ['周更'] })
be.createTodo({ list_id: work.id, title: '评审小程序模块的 PR', importance: 'normal', due_date: d(5), planned_date: d(1), complexity: 'medium' })
be.createTodo({ list_id: work.id, title: '回复合作方邮件', importance: 'low', due_date: d(-1), planned_date: d(-1), tags: ['沟通'] })
be.createTodo({ list_id: work.id, title: '整理会议纪要归档', importance: 'low', due_date: d(-2), planned_date: d(-2) })
be.createTodo({ list_id: work.id, title: '每日站会同步进展', importance: 'normal', planned_date: d(0), complexity: 'simple', repeat: 'daily' })
be.createTodo({ list_id: work.id, title: '打扫工位', importance: 'low', planned_date: d(0), status: 'completed' })
be.createTodo({ list_id: work.id, title: '处理报销单', importance: 'normal', planned_date: d(0), status: 'completed' })
be.createTodo({ list_id: work.id, title: '更新项目排期表', importance: 'normal', planned_date: d(-1), status: 'completed' })

be.createTodo({ list_id: life.id, title: '晚上跑步 5 公里', body: '江边路线', importance: 'normal', planned_date: d(0), complexity: 'medium', tags: ['运动'] })
be.createTodo({ list_id: life.id, title: '预约洗牙', importance: 'normal', due_date: d(9), tags: ['健康'] })
be.createTodo({ list_id: life.id, title: '采购周末食材', body: '番茄、牛排、酸奶', importance: 'low', planned_date: d(2) })
be.createTodo({ list_id: life.id, title: '给爸妈打电话', importance: 'high', planned_date: d(0), repeat: 'weekly' })
be.createTodo({ list_id: life.id, title: '取快递', importance: 'low', planned_date: d(0), status: 'completed' })

be.createTodo({ list_id: study.id, title: '读《思考，快与慢》第 7 章', importance: 'normal', planned_date: d(0), complexity: 'medium', tags: ['阅读'] })
be.createTodo({ list_id: study.id, title: '背 50 个英语单词', importance: 'normal', planned_date: d(0), complexity: 'simple', repeat: 'daily' })
be.createTodo({ list_id: study.id, title: '完成网课单元测验', importance: 'high', due_date: d(3), planned_date: d(1), complexity: 'medium' })
be.createTodo({ list_id: study.id, title: '整理错题本', importance: 'low', planned_date: d(-1), status: 'completed' })

// ---------- 重要日期（important 图层事件） ----------
be.createEvent({ layer_id: 'important', source: 'manual', date: d(0), title: '季度目标对齐会', description: null, extra: {} })
be.createEvent({ layer_id: 'important', source: 'manual', date: d(1), title: '项目里程碑评审', description: null, extra: {} })
be.createEvent({ layer_id: 'important', source: 'manual', date: d(3), title: '部门聚餐', description: null, extra: {} })
be.createEvent({ layer_id: 'important', source: 'manual', date: d(6), title: '大学同学婚礼', description: null, extra: {} })
be.createEvent({ layer_id: 'important', source: 'manual', date: d(9), title: '年度体检', description: null, extra: {} })
be.createEvent({ layer_id: 'important', source: 'manual', date: d(-3), title: '版本发布窗口', description: null, extra: {} })

// ---------- 日程条目 ----------
be.createScheduleItem({ date: d(0), start_time: '10:00', end_time: '10:30', title: '每日站会', color: '#3D6BFB', sort_order: 1, category: 'work' })
be.createScheduleItem({ date: d(0), start_time: '14:00', end_time: '16:00', title: '产品设计课', color: '#8E24AA', sort_order: 2, category: 'course' })
be.createScheduleItem({ date: d(0), start_time: '19:00', end_time: '20:00', title: '健身房 · 上肢日', color: '#10B981', sort_order: 3, category: 'sport' })
be.createScheduleItem({ date: d(0), start_time: '20:30', end_time: '22:00', title: '和老同学吃饭', color: '#F59E0B', sort_order: 4, category: 'play' })
be.createScheduleItem({ date: d(1), start_time: '09:30', end_time: '11:30', title: '季度汇报彩排', color: '#3D6BFB', sort_order: 1, category: 'work' })
be.createScheduleItem({ date: d(2), start_time: '15:00', end_time: '16:00', title: '跨部门沟通会', color: '#3D6BFB', sort_order: 1, category: 'work' })

// ---------- 倒数日 ----------
be.createCountdown({ name: '项目上线', category: '工作', base_date: d(21), color: '#3D6BFB' })
be.createCountdown({ name: '期末考试', category: '学习', base_date: d(9), color: '#8E24AA' })
be.createCountdown({ name: '国庆假期', category: '生活', base_date: '2026-10-01', color: '#EF5350' })
be.createCountdown({ name: '结对纪念日', category: '生活', base_date: '2021-05-20', repeat_yearly: true, never_expire: true, color: '#F59E0B' })
be.createCountdown({ name: '出发去旅行', category: '生活', base_date: d(16), color: '#10B981' })
be.createCountdown({ name: '驾照科目一', category: '学习', base_date: d(5), color: '#64748B' })
be.createCountdown({ name: '爸爸生日', category: '生活', base_date: '1975-11-08', repeat_yearly: true, never_expire: true, color: '#EC4899' })
be.createCountdown({ name: '妈妈生日', category: '生活', base_date: '1978-12-24', repeat_yearly: true, never_expire: true, color: '#8B5CF6' })

// ---------- 充实度染色（近 45 天，工作日饱满、周末多留白） ----------
let seed = 42
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
for (let i = 45; i >= 1; i -= 1) {
  const date = d(-i)
  const dow = new Date(`${date}T00:00:00`).getDay()
  if (dow === 0 || dow === 6) {
    if (rand() < 0.35) be.upsertColoring(date, 1 + Math.floor(rand() * 2))
    continue
  }
  const level = rand() < 0.12 ? 0 : 1 + Math.floor(rand() * 4)
  be.upsertColoring(date, Math.min(level, 4))
}

// ---------- 历史完成（喂贡献热力图 / 连续天数 / 里程碑） ----------
import { randomUUID } from 'node:crypto'
import { todo as todoTable } from '@tt-calendar/db'

const HIST_POOL = [
  '晨间阅读 20 分钟', '记账', '步行 8000 步', '背单词打卡', '整理收件箱',
  '写日记', '拉伸 10 分钟', '复盘当日计划', '收拾桌面', '喝够 8 杯水',
  '听力练习', '预习明天内容',
]
const HIST_LISTS = [work.id, life.id, study.id]
let histSeq = 0
for (let i = 56; i >= 1; i -= 1) {
  const date = d(-i)
  const dow = new Date(`${date}T00:00:00`).getDay()
  const weekend = dow === 0 || dow === 6
  // 工作日 2-3 条，周末大概率休息；最近 14 天每天至少 1 条（连续天数好看）
  let count = weekend ? (rand() < 0.4 ? 1 : 0) : 2 + Math.floor(rand() * 2)
  if (i <= 14 && count === 0) count = 1
  for (let k = 0; k < count; k += 1) {
    histSeq += 1
    const title = HIST_POOL[(i * 3 + k) % HIST_POOL.length]!
    const listId = HIST_LISTS[(i + k) % HIST_LISTS.length]!
    const hour = 8 + ((i * 7 + k * 5) % 13)
    db.insert(todoTable)
      .values({
        id: randomUUID(),
        listId,
        title,
        status: 'completed',
        importance: 'normal',
        complexity: 'simple',
        sortOrder: 100 + histSeq,
        createdAt: `${date} 07:30:00`,
        completedAt: `${date} ${p(hour)}:${p((i * 11 + k * 17) % 60)}:00`,
        updatedAt: `${date} ${p(hour)}:30:00`,
      })
      .run()
  }
}
be.recomputeTodoBusy()

console.log(`[seed-demo] 演示数据已写入 ${target}`)
console.log(`[seed-demo] 清单 3 / 待办 19 / 历史完成 ${histSeq} / 重要日期 6 / 日程 6 / 倒数日 4`)
