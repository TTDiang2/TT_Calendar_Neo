/**
 * countdownBanner/countdownDisplay 回归钉（智者终审 C1/F6）：
 * 上一轮横幅丢后缀（「恋爱 800 天」→「恋爱」）就是因为零测试覆盖——这里钉死行为：
 * 横幅必须使用含后缀的显示名，后缀形态与旧 domain buildCountdownText 逐字一致。
 */
import { describe, expect, it } from 'vitest'
import { makeI18n } from '../core'
import { countdownBanner, countdownDisplay, countdownLabelSuffix } from '../../adapt/labels'
import type { CountdownItem } from '@tt-calendar/contracts'

function item(partial: Partial<CountdownItem>): CountdownItem {
  return {
    id: 1,
    name: '恋爱',
    category: '纪念日',
    base_date: '2024-02-14',
    repeat_yearly: false,
    repeat_type: 'solar',
    milestone_rule: '100,800',
    never_expire: false,
    notes: null,
    color: null,
    next_date: '2026-10-03',
    label: { kind: 'milestone', days: 800 },
    days_left: 3,
    is_today: false,
    passed: false,
    ...partial,
  } as CountdownItem
}

const zh = makeI18n('zh-CN')
const en = makeI18n('en')

describe('countdownDisplay（列表行标题：名称 + 后缀）', () => {
  it('带里程碑 label → 「恋爱 第 800 天」改后为「恋爱 800 天」（与旧版逐字一致）', () => {
    expect(countdownDisplay(zh.t, item({}))).toBe('恋爱 800 天')
  })
  it('无 label → 只有名称', () => {
    expect(countdownDisplay(zh.t, item({ label: null }))).toBe('恋爱')
  })
  it('周年后缀', () => {
    expect(countdownDisplay(zh.t, item({ label: { kind: 'solarAnniversary', years: 3 } }))).toBe('恋爱 3 周年')
    expect(countdownLabelSuffix(en.t, { kind: 'solarAnniversary', years: 3 })).toBe('3-year anniversary')
  })
})

describe('countdownBanner（顶栏一句话倒数：必须用含后缀的显示名）', () => {
  it('未来事件：「距离『恋爱 800 天』还有 3 天」——名称不能丢后缀', () => {
    const text = countdownBanner(zh.t, zh.tPlural, [item({})])
    expect(text).toBe('距离「恋爱 800 天」还有 3 天')
  })
  it('今天：🎉 今天是「恋爱 800 天」', () => {
    const text = countdownBanner(zh.t, zh.tPlural, [item({ is_today: true, days_left: 0 })])
    expect(text).toBe('🎉 今天是「恋爱 800 天」')
  })
  it('已过：「恋爱 800 天」已过 5 天', () => {
    const text = countdownBanner(zh.t, zh.tPlural, [
      item({ passed: true, days_left: -5 }),
    ])
    expect(text).toBe('「恋爱 800 天」已过 5 天')
  })
  it('空态', () => {
    expect(countdownBanner(zh.t, zh.tPlural, [])).toBe('暂无倒数日')
  })
  it('en 复数：3 days until "恋爱 Day 800"（后缀随语言）', () => {
    expect(countdownBanner(en.t, en.tPlural, [item({})])).toBe('3 days until "恋爱 Day 800"')
  })
})
