/**
 * 待办 CSV 导入测试：解析（引号/逗号/BOM/CRLF）、列别名、清单自动创建、
 * 坏行跳过与行号报错、标签拆分。
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

import { openLocalDb, type LocalDbHandle } from '../../local/backend'
import { importTodosCsvOnBackend, parseCsv } from '../csv-todos'

const require = createRequire(import.meta.url)

async function openDevice(): Promise<LocalDbHandle> {
  const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
  return openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
}

describe('parseCsv', () => {
  it('支持引号内逗号/换行、BOM、CRLF、引号转义', () => {
    const text = '\uFEFFa,b\r\n"1,2","x""y"\r\n"多\n行",z\r\n'
    expect(parseCsv(text)).toEqual([
      ['a', 'b'],
      ['1,2', 'x"y'],
      ['多\n行', 'z'],
    ])
  })
})

describe('importTodosCsvOnBackend', () => {
  it('列别名 + 清单自动创建 + 标签拆分 + 全字段导入', async () => {
    const h = await openDevice()
    const csv = [
      '标题,清单,优先级,截止,标签,备注',
      '买牛奶,生活,low,2026-09-10,家庭|采购,两盒',
      '"写报告, 修改PPT",工作,HIGH,2026-09-15,,带引号的标题',
    ].join('\n')
    const r = importTodosCsvOnBackend(h.backend, csv)
    expect(r.inserted).toBe(2)
    expect(r.lists_created).toBe(2)
    expect(r.errors).toEqual([])

    const lists = h.backend.getTodoLists()
    expect(lists.map((l) => l.display_name).sort()).toEqual(['生活', '工作'].sort())

    const milk = h.backend.getTodos({ list_id: lists.find((l) => l.display_name === '生活')!.id })
    expect(milk).toHaveLength(1)
    expect(milk[0]!.importance).toBe('low')
    expect(milk[0]!.due_date).toBe('2026-09-10')
    expect(milk[0]!.tags).toEqual(['家庭', '采购'])

    const report = h.backend.getTodos({ list_id: lists.find((l) => l.display_name === '工作')!.id })
    expect(report[0]!.title).toBe('写报告, 修改PPT')
    expect(report[0]!.importance).toBe('high')
    h.sqlite.close()
  })

  it('坏行跳过并报行号；无 list 列落「导入」；缺 title 列直接报错', async () => {
    const h = await openDevice()
    const csv = 'title,due_date\n合法任务,2026-09-20\n,2026-09-21\n坏日期,2026/09/22\n'
    const r = importTodosCsvOnBackend(h.backend, csv)
    expect(r.inserted).toBe(1)
    expect(r.errors).toHaveLength(2)
    expect(r.errors.some((e) => e.includes('第3行'))).toBe(true)
    expect(r.errors.some((e) => e.includes('第4行'))).toBe(true)
    expect(h.backend.getTodos()[0]!.list_id).toBeTruthy()

    const r2 = importTodosCsvOnBackend(h.backend, 'name,note\na,b\n')
    expect(r2.inserted).toBe(0)
    expect(r2.errors[0]).toContain('title')
    h.sqlite.close()
  })
})
