/**
 * 教程契约守门（智者 P0 定稿：两个测试先红后绿）：
 *  1. 每步 content key（title/body）在 zh-CN 与全部已注册语言字典中存在；
 *  2. 每步 target 的 data-tour 值存在于 src 代码库，且全库唯一（静态扫描）。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOUR_STEPS } from '../steps'
import { DICTS } from '../../i18n/dict/index'
import { zhCN } from '../../i18n/dict/zh-CN'

const UI_SRC_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

function lookup(obj: unknown, path: string): unknown {
  let node: unknown = obj
  for (const p of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[p]
  }
  return node
}

/** 全库扫 data-tour="..." 静态出现次数（grep 等价实现） */
function scanDataTourCounts(): Map<string, number> {
  const counts = new Map<string, number>()
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === 'node_modules' || entry.name === 'dist') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) visit(full)
      else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        const src = readFileSync(full, 'utf8')
        const re = /data-tour="([a-z-]+)"|data-tour=\{`([a-z-]+)-\$\{[^}]+\}`\}/g
        let m: RegExpExecArray | null
        while ((m = re.exec(src))) {
          const key = m[1] ?? `${m[2]}-*`
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
    }
  }
  visit(UI_SRC_ROOT)
  return counts
}

describe('教程步骤契约', () => {
  it('步骤表非空且 id 唯一', () => {
    expect(TOUR_STEPS.length).toBeGreaterThan(0)
    const ids = TOUR_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('每步 title/body key 在 zh-CN 与全部注册语言字典中存在', () => {
    const problems: string[] = []
    for (const step of TOUR_STEPS) {
      for (const key of [step.titleKey, step.bodyKey]) {
        if (typeof lookup(zhCN, key) !== 'string') problems.push(`zh-CN 缺 ${step.id}.${key}`)
        for (const [lang, dict] of Object.entries(DICTS)) {
          if (lang === 'zh-CN') continue
          if (typeof lookup(dict, key) !== 'string') problems.push(`${lang} 缺 ${step.id}.${key}`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('无 target 步骤只能是首尾（居中卡语义）', () => {
    const noTargetIdx = TOUR_STEPS.map((s, i) => (s.target ? -1 : i)).filter((i) => i >= 0)
    for (const i of noTargetIdx) {
      const isEdge = i === 0 || i === TOUR_STEPS.length - 1
      expect(isEdge, `步骤 ${TOUR_STEPS[i]!.id} 无 target 但不在首尾`).toBe(true)
    }
  })

  it('每个 target 的 data-tour 值存在于 src 且静态唯一（模板值按前缀-* 计）', () => {
    const counts = scanDataTourCounts()
    const problems: string[] = []
    for (const step of TOUR_STEPS) {
      if (!step.target) continue
      // dock-tab-* 模板：按前缀匹配（dock-tab-calendar 等由 map 渲染）
      if (step.target.startsWith('dock-tab-')) {
        if ((counts.get('dock-tab-*') ?? 0) === 0) problems.push(`${step.id}: 无 dock-tab-* 模板锚点`)
        continue
      }
      const n = counts.get(step.target) ?? 0
      if (n === 0) problems.push(`${step.id}: data-tour="${step.target}" 不存在于 src`)
      else if (n > 1) problems.push(`${step.id}: data-tour="${step.target}" 出现 ${n} 次（须唯一）`)
    }
    expect(problems).toEqual([])
  })

  it('hands-on 体验至多 1 处（v1 定稿；mobile/desktop 变体同源不叠加）', () => {
    // 同一教学点位（去平台后缀）只算一处；跨点位仍禁超过 1
    const spots = new Set(TOUR_STEPS.filter((s) => s.advanceOnTargetClick).map((s) => s.id.replace(/-(mobile|desktop)$/, '')))
    expect(spots.size).toBeLessThanOrEqual(1)
  })
})
