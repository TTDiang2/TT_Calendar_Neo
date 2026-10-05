/**
 * 滴答清单 CSV fixture（2026-10 滴答清单导入任务书裁决 14）。
 *
 * ⚠️ 重建样例，非真实导出：仓库不收真实备份（隐私）。本文件按社区文档级格式
 * （表头 21 列 + 取值语义）手工构造，覆盖：6 行 preamble 变体、多行 Content、
 * 子任务行、RRULE 全形态矩阵、All Day/Floating、UTC+8 偏移、\uFFFD 拒绝、
 * 未知列、taskId 折叠、空 List Name。
 * 【待用户动作】拿到真实滴答导出件后逐一复核——尤其注意真实导出可能用 -1
 * 哨兵填充未设的日期/数值列（本样例一律用空单元格），若属实需补宽容解析。
 *
 * 行构造走 buildRow：列序由 TICKTICK_HEADER 决定，杜绝手数逗号错位；
 * fixtureLineOf 记录每个标记行的 CSV 物理行号（含多行引号字段造成的位移）。
 */

/** 表头（含「新版可能追加列」代表 Estimated Pomodoro——按列名匹配，未知列必须被忽略） */
export const TICKTICK_HEADER = [
  'Folder Name',
  'List Name',
  'Title',
  'Tags',
  'Content',
  'Is Check list',
  'Start Date',
  'Due Date',
  'Reminder',
  'Repeat',
  'Priority',
  'Status',
  'Created Time',
  'Completed Time',
  'Order',
  'Timezone',
  'Is All Day',
  'Is Floating',
  'Estimated Pomodoro',
  'taskId',
  'parentId',
] as const

type HeaderCol = (typeof TICKTICK_HEADER)[number]
type RowSpec = Partial<Record<HeaderCol, string>>

/** 含逗号/引号/换行的字段加引号（引号翻倍）——与 shared.parseCsv 的解析对偶 */
function cell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function buildRow(spec: RowSpec): string {
  return TICKTICK_HEADER.map((h) => cell(spec[h] ?? '')).join(',')
}

// ---- preamble（6 行元数据：真实导出的元数据行数不固定，解析器必须扫描找表头） ----
const PREAMBLE = [
  'TickTick Backup,Pro,true,2026-01-01T00:00:00+0000',
  ',3,2,3',
  '"TickTick (dida365) | ticktick.com",',
  '任务数,18',
  'Folders,2',
  'Lists,3',
]

const lines: string[] = [...PREAMBLE, TICKTICK_HEADER.join(',')]
/** 标记名 → 该行起始的 CSV 物理行号（1 基；多行引号字段占多物理行，这里显式顺延） */
export const fixtureLineOf: Record<string, number> = {}
let physicalCount = lines.length // 已占用的物理行数

function pushRow(marker: string | null, spec: RowSpec): void {
  const s = buildRow(spec)
  if (marker) fixtureLineOf[marker] = physicalCount + 1
  lines.push(s)
  physicalCount += 1 + (s.match(/\n/g)?.length ?? 0)
}

const SH = 'Asia/Shanghai'

// ---- 数据行（行号 = fixtureLineOf 标记） ----

// 写周报：已完成 + weekdays 重复（BYDAY 恰五工作日）+ 全天（UTC 串不得偏移）
// + 多行 Content（▫/▪ 勾选项）+ created/completed 透传换算 + Order 透传
pushRow('写周报', {
  'Folder Name': 'Folder A',
  'List Name': '工作',
  Title: '写周报',
  Tags: '重点',
  Content: '▫ 起草大纲\n▪ 定稿发送',
  'Is Check list': 'false',
  'Due Date': '2025-01-12T00:00:00+0000',
  Repeat: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  Priority: '5',
  Status: '1',
  'Created Time': '2024-12-30T02:00:00+0000',
  'Completed Time': '2025-01-13T06:30:00+0000',
  Order: '-1099511627776',
  Timezone: SH,
  'Is All Day': 'true',
  taskId: 'task-1',
})

// 跨日核对：非全天 UTC 串 + Asia/Shanghai → 日期换算后应为次日 2025-01-16
pushRow('跨日核对', {
  'Folder Name': 'Folder A',
  'List Name': '工作',
  Title: '跨日核对',
  'Start Date': '2025-01-15T16:00:00+0000',
  'Due Date': '2025-01-15T18:00:00+0000',
  Priority: '3',
  Status: '0',
  'Created Time': '2025-01-02T03:00:00+0000',
  Order: '0',
  Timezone: SH,
  taskId: 'task-2',
})

// 确认结论：子任务（parentId 指向 task-1）→ 独立 todo，标题加「↳ 」前缀，无系统标签
pushRow('确认结论', {
  'Folder Name': 'Folder A',
  'List Name': '工作',
  Title: '确认结论',
  Timezone: SH,
  taskId: 'task-3',
  parentId: 'task-1',
})

// 孤儿跟进：parentId 指向不存在的父任务 → 照常导入；List Name 为空 → 收件箱
pushRow('孤儿跟进', {
  Title: '孤儿跟进',
  Timezone: SH,
  taskId: 'task-4',
  parentId: 'task-nope',
})

// 旧习惯：Status 2（已归档/可能已放弃）→ 按已完成 + warning；DAILY;INTERVAL=1 → daily
pushRow('旧习惯', {
  'Folder Name': 'Folder B',
  'List Name': '个人',
  Title: '旧习惯',
  'Due Date': '2024-11-01T00:00:00+0000',
  Repeat: 'RRULE:FREQ=DAILY;INTERVAL=1',
  Priority: '3',
  Status: '2',
  'Created Time': '2024-10-01T00:00:00+0000',
  'Completed Time': '2024-11-02T10:00:00+0000',
  Timezone: SH,
  'Is All Day': 'true',
  taskId: 'task-5',
})

// 未知优先级 2 → 按普通 + warning
pushRow('未知优先级', {
  'Folder Name': 'Folder A',
  'List Name': '工作',
  Title: '未知优先级',
  Priority: '2',
  Status: '0',
  Timezone: SH,
  taskId: 'task-6',
})

// ---- RRULE 全形态矩阵（未迁移的 6+1 种 → repeat=null + 备注行 + warning） ----
pushRow('月度整理', {
  'Folder Name': 'Folder A', 'List Name': '工作', Title: '月度整理',
  Repeat: 'RRULE:FREQ=MONTHLY', Status: '0', Timezone: SH, taskId: 'task-7',
})
pushRow('隔日打卡', {
  'Folder Name': 'Folder A', 'List Name': '工作', Title: '隔日打卡',
  Repeat: 'RRULE:FREQ=DAILY;INTERVAL=2', Status: '0', Timezone: SH, taskId: 'task-8',
})
pushRow('月末检查', {
  'Folder Name': 'Folder A', 'List Name': '工作', Title: '月末检查',
  Repeat: 'RRULE:FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO', Status: '0', Timezone: SH, taskId: 'task-9',
})
pushRow('十次训练', {
  'Folder Name': 'Folder A', 'List Name': '工作', Title: '十次训练',
  Repeat: 'RRULE:FREQ=DAILY;COUNT=10', Status: '0', Timezone: SH, taskId: 'task-10',
})
// 多天 BYDAY（MO,WE,FR）→ 未迁移
pushRow('三天周期', {
  'Folder Name': 'Folder A', 'List Name': '工作', Title: '三天周期',
  Repeat: 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR', Status: '0', Timezone: SH, taskId: 'task-11',
})
// 周末 RRULE —— 映成 weekdays 即一票否决事故
pushRow('周末巡查', {
  'Folder Name': 'Folder A', 'List Name': '工作', Title: '周末巡查',
  Repeat: 'RRULE:FREQ=WEEKLY;BYDAY=SA,SU', Status: '0', Timezone: SH, taskId: 'task-12',
})

// 浮动事项：Is Floating → 只取日期部分，不做时区换算；Priority 0 → normal（不映 low）
pushRow('浮动事项', {
  'Folder Name': 'Folder A', 'List Name': '工作', Title: '浮动事项',
  'Due Date': '2025-02-01T23:00:00+0000',
  Priority: '0', Status: '0', Timezone: SH, 'Is Floating': 'true', taskId: 'task-13',
})

// 重复行：与「跨日核对」同 taskId → 折叠保留首行 + warning
pushRow('重复行', {
  'Folder Name': 'Folder A', 'List Name': '工作', Title: '重复行',
  Status: '0', Timezone: SH, taskId: 'task-2',
})

// 坏日期：Due Date 无法解析 → 报物理行号、任务仍导入（无截止日）
pushRow('坏日期', {
  'Folder Name': 'Folder A', 'List Name': '工作', Title: '坏日期',
  'Due Date': 'not-a-date', Status: '0', Timezone: SH, taskId: 'task-14',
})

// 缺标题 → 报物理行号并跳过
pushRow('缺标题', {
  'Folder Name': 'Folder A', 'List Name': '工作', Title: '',
  Status: '0', Timezone: SH, taskId: 'task-15',
})

// FREQ=WEEKLY 无 BYDAY → weekly；Priority 1 → low
pushRow('每周例会', {
  'Folder Name': 'Folder A', 'List Name': '工作', Title: '每周例会',
  Repeat: 'RRULE:FREQ=WEEKLY', Priority: '1', Status: '0', Timezone: SH, taskId: 'task-16',
})

// INTERVAL≠1 的 WEEKLY → 未迁移
pushRow('间隔双周', {
  'Folder Name': 'Folder A', 'List Name': '工作', Title: '间隔双周',
  Repeat: 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', Status: '0', Timezone: SH, taskId: 'task-17',
})

export const TICKTICK_FIXTURE = lines.join('\n')

/** PREAMBLE 行数（表头物理行号 = preamble 行数 + 1） */
export const FIXTURE_HEADER_LINE = PREAMBLE.length + 1

/** GBK 拒绝用样例：表头保持 ASCII（GBK 兼容 ASCII，识别不受影响），中文内容解码出 U+FFFD */
export const GARBLED_ENCODING_SAMPLE = [
  TICKTICK_HEADER.join(','),
  buildRow({
    'Folder Name': 'Folder A',
    'List Name': '工作',
    Title: '任务\uFFFD描述乱码',
    Timezone: SH,
    taskId: 'gbk-1',
  }),
].join('\n')

/** 性能合成 CSV：n 行、日期铺开 28 天、部分已完成、RRULE daily（5000 行 ≤2s 验收用） */
export function buildPerfCsv(n: number): string {
  const out: string[] = [TICKTICK_HEADER.join(',')]
  for (let i = 0; i < n; i++) {
    const day = String((i % 28) + 1).padStart(2, '0')
    const completed = i % 4 === 0
    out.push(
      buildRow({
        'Folder Name': 'Perf Folder',
        'List Name': `清单${i % 10}`,
        Title: `性能任务 ${i}`,
        Tags: `t${i % 5}`,
        Content: `内容 ${i}`,
        'Is Check list': 'false',
        'Due Date': `2025-01-${day}T01:00:00+0000`,
        Repeat: 'RRULE:FREQ=DAILY;INTERVAL=1',
        Priority: String([5, 3, 1, 0][i % 4]!),
        Status: completed ? '1' : '0',
        'Created Time': '2024-12-01T00:00:00+0000',
        'Completed Time': completed ? `2024-12-${day}T02:00:00+0000` : '',
        Order: String(i),
        Timezone: SH,
        'Is All Day': 'true',
        taskId: `perf-${i}`,
      }),
    )
  }
  return out.join('\n')
}
