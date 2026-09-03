import { describe, expect, it } from 'vitest'

import type { DateStr } from '@tt-calendar/contracts'
import {
  buildGradient,
  parseColor,
  pickContrastColor,
  relativeLuminance,
  shadeColor,
} from './color'

describe('parseColor', () => {
  it('支持 #rgb / #rrggbb / rgb() / rgba()', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255])
    expect(parseColor('#FF0000')).toEqual([255, 0, 0])
    expect(parseColor('rgb(16, 32, 48)')).toEqual([16, 32, 48])
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual([1, 2, 3])
  })

  it('不支持的写法（如 8 位 hex）返回 null', () => {
    expect(parseColor('#11223344')).toBeNull()
    expect(parseColor('not-a-color')).toBeNull()
    expect(parseColor('')).toBeNull()
  })
})

describe('relativeLuminance / pickContrastColor', () => {
  it('白底配深字，黑底配白字', () => {
    expect(pickContrastColor('#FFFFFF')).toBe('#1f2937')
    expect(pickContrastColor('#000000')).toBe('#ffffff')
  })

  it('浅琥珀底配深字（日历卡片常见色）', () => {
    expect(pickContrastColor('#FDE68A')).toBe('#1f2937')
  })

  it('深钢蓝底配白字', () => {
    expect(pickContrastColor('#3730A3')).toBe('#ffffff')
  })

  it('relativeLuminance 在 0..1，白=1 黑=0', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5)
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 5)
  })
})

describe('buildGradient（重要日期渐变：white → peak 插值）', () => {
  const MS = '2026-09-01' as DateStr
  const ME = '2026-09-30' as DateStr

  it('无事件返回空表', () => {
    expect(buildGradient([], MS, ME)).toEqual({})
  })

  it('事件日涂峰值色，事件前一天回到白', () => {
    const g = buildGradient(['2026-09-10' as DateStr, '2026-09-20' as DateStr], MS, ME)
    expect(g['2026-09-10']?.toUpperCase()).toBe('#FF4D4D')
    expect(g['2026-09-20']?.toUpperCase()).toBe('#FF4D4D')
    // 事件后一天回到白（offset=1 → baseColor, weight=0）
    expect(g['2026-09-11']?.toUpperCase()).toBe('#FFFFFF')
    expect(g['2026-09-21']?.toUpperCase()).toBe('#FFFFFF')
    // 区间外仍是白
    expect(g['2026-09-30']?.toUpperCase()).toBe('#FFFFFF')
  })

  it('两事件中间的日期单调变深，且不超过 capT=0.9', () => {
    const g = buildGradient(['2026-09-10' as DateStr, '2026-09-20' as DateStr], MS, ME)
    // 09-12 position=(2-1)/8=0.125；09-19 position=0.875→cap 0.9
    const t0 = parseColor(g['2026-09-12']!)!
    const t1 = parseColor(g['2026-09-15']!)!
    const t2 = parseColor(g['2026-09-19']!)!
    expect(t0[1]).toBeGreaterThan(t1[1])
    expect(t1[1]).toBeGreaterThan(t2[1])
    // capT=0.9：G = 255 * (1 - 0.9) = 25.5 → 26
    expect(t2[1]).toBeGreaterThanOrEqual(25)
  })

  it('同一天被两个区间覆盖时保留 weight 更大者', () => {
    // 三个事件：09-10, 09-14, 09-20 —— 09-12..13 同时属于两个区间
    const g = buildGradient(
      ['2026-09-10' as DateStr, '2026-09-14' as DateStr, '2026-09-20' as DateStr],
      MS,
      ME,
    )
    // 区间2（10→14）里 09-12 的 position=(2-1)/2=0.5，比区间3（14→20）里
    // 09-13 的 position=(1-1)/4=0 只会更大；09-13 在区间2 是 offset 3 → 0.75，
    // 在区间3 是 offset 1 → weight 0 → 保留 0.75 的颜色
    const t13 = parseColor(g['2026-09-13']!)!
    expect(t13[1]).toBeLessThan(255 * (1 - 0.5))
  })
})

describe('shadeColor（amount ∈ [-1,1]，比例式调亮调暗）', () => {
  it('正向变亮、负向变暗', () => {
    const lighter = parseColor(shadeColor('#808080', 0.25))!
    const darker = parseColor(shadeColor('#808080', -0.25))!
    expect(lighter[0]).toBeGreaterThan(128)
    expect(darker[0]).toBeLessThan(128)
  })

  it('不会越界', () => {
    expect(parseColor(shadeColor('#FFFFFF', 1))![0]).toBe(255)
    expect(parseColor(shadeColor('#000000', -1))![0]).toBe(0)
  })
})
