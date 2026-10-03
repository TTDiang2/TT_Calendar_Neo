/**
 * Swift 小组件 L10n 表守门（智者终审 C2-4）：JS 侧字典有结构测试，Swift 表无校验，
 * 缺 key 会静默回落 zh。这里解析 TTCalendarWidget.swift 的 L10n.tables 文本，
 * 断言每个语言表的 key 集合与 en 表完全一致（zh-CN 表作为 daysLeft 裸 key 的基准除外——
 * 无复数形态语言允许裸 daysLeft，en/fr 等复数语言 daysLeft_one/other 齐全即可）。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SWIFT_PATH = fileURLToPath(new URL('../../../../../apps/mobile/widget/TTCalendarWidget.swift', import.meta.url))

function parseTables(source: string): Map<string, Map<string, string>> {
  const tables = new Map<string, Map<string, string>>()
  const tableRe = /"([a-zA-Z-]+)":\s*\[([\s\S]*?)\]/g
  let m: RegExpExecArray | null
  while ((m = tableRe.exec(source))) {
    const lang = m[1]
    const body = m[2]
    const entries = new Map<string, string>()
    const entryRe = /"([A-Za-z_]+)":\s*"((?:[^"\\]|\\.)*)"/g
    let e: RegExpExecArray | null
    while ((e = entryRe.exec(body))) entries.set(e[1], e[2])
    tables.set(lang, entries)
  }
  return tables
}

describe('Swift L10n.tables（小组件字典）', () => {
  const source = readFileSync(SWIFT_PATH, 'utf8')
  const tables = parseTables(source)
  const en = tables.get('en')
  const enKeys = new Set([...(en?.keys() ?? [])].map((k) => k.replace(/_(one|few|many|other|zero|two)$/, '')))

  it('解析出至少 zh-CN/en/ja/ko/fr 五个语言表', () => {
    for (const lang of ['zh-CN', 'en', 'ja', 'ko', 'fr']) {
      expect(tables.has(lang), `缺少 ${lang} 表`).toBe(true)
    }
  })

  for (const [lang, entries] of tables) {
    if (lang === 'en') continue
    it(`[${lang}] key 集合与 en 一致（复数后缀归一后，不多不少）`, () => {
      const keys = new Set([...entries.keys()].map((k) => k.replace(/_(one|few|many|other|zero|two)$/, '')))
      const missing = [...enKeys].filter((k) => !keys.has(k))
      const extra = [...keys].filter((k) => !enKeys.has(k))
      expect({ missing, extra }).toEqual({ missing: [], extra: [] })
    })

    it(`[${lang}] 无空值（文案缺内容会渲染空白）`, () => {
      for (const [k, v] of entries) {
        expect(v.trim().length, `${lang}.${k} 值为空`).toBeGreaterThan(0)
      }
    })
  }
})
