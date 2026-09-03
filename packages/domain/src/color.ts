/**
 * 颜色工具（移植自 tt_calendar/utils/gradient.py + frontend/src/data.ts）。
 * 零 IO，纯计算。
 */

import type { DateStr } from '@tt-calendar/contracts'
import { addDays, diffDays } from './date'

export type RGB = [number, number, number]

/** 解析 CSS 颜色（#rgb / #rrggbb / rgb() / rgba()），失败返回 null */
export function parseColor(c: string): RGB | null {
  const s = c.trim()
  let m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) {
    const h = m[1]
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ]
  }
  m = /^#([0-9a-f]{6})$/i.exec(s)
  if (m) {
    return [
      parseInt(m[1].slice(0, 2), 16),
      parseInt(m[1].slice(2, 4), 16),
      parseInt(m[1].slice(4, 6), 16),
    ]
  }
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  return null
}

/** 线性插值两个 hex 颜色，t ∈ [0,1] */
export function lerpColor(a: string, b: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t))
  const ra = parseColor(a) ?? [255, 255, 255]
  const rb = parseColor(b) ?? [255, 255, 255]
  const ch = (i: 0 | 1 | 2) => {
    const v = Math.round(ra[i] + (rb[i] - ra[i]) * clamped)
    return v.toString(16).padStart(2, '0')
  }
  return `#${ch(0)}${ch(1)}${ch(2)}`
}

/** WCAG 相对亮度 https://www.w3.org/TR/WCAG21/#dfn-relative-luminance */
export function relativeLuminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** 背景色上该用黑字还是白字（WCAG 对比度阈值） */
export function pickContrastColor(bg: string): '#ffffff' | '#1f2937' {
  const rgb = parseColor(bg)
  if (!rgb) return '#1f2937'
  return relativeLuminance(rgb) > 0.45 ? '#1f2937' : '#ffffff'
}

export const GRADIENT_WHITE = '#FFFFFF'
export const GRADIENT_PEAK = '#FF4D4D'

/**
 * 重要日期渐变：事件日涂峰值色，相邻事件之间从白向峰值色渐变，事件后一天回到白。
 *
 * 移植自 gradient.py build_gradient。注意「取距离未来事件更近的颜色优先」的
 * 权重逻辑 —— 同一天被两个区间覆盖时，保留 weight 更大的那个。
 *
 * @param capT 非事件日的最大渐变进度，避免中间日被误认为事件日本身
 */
export function buildGradient(
  eventDates: readonly DateStr[],
  monthStart: DateStr,
  monthEnd: DateStr,
  peakColor: string = GRADIENT_PEAK,
  capT = 0.9,
): Record<DateStr, string> {
  const baseColor = GRADIENT_WHITE
  const allDates = [...new Set(eventDates)].sort()
  if (allDates.length === 0) return {}

  const gradient: Record<DateStr, string> = {}
  const totalDays = diffDays(monthStart, monthEnd) + 1
  for (let i = 0; i < totalDays; i++) {
    gradient[addDays(monthStart, i)] = baseColor
  }

  const eventSet = new Set(allDates)
  for (const d of eventSet) {
    if (d >= monthStart && d <= monthEnd) gradient[d] = peakColor
  }

  const weights: Record<DateStr, number> = {}
  for (let i = 0; i < allDates.length - 1; i++) {
    const dPrev = allDates[i]
    const dNext = allDates[i + 1]
    const intervalLen = diffDays(dPrev, dNext)
    if (intervalLen <= 1) continue

    const denom = Math.max(intervalLen - 2, 1)
    for (let offset = 1; offset < intervalLen; offset++) {
      const d = addDays(dPrev, offset)
      if (d === dNext) continue

      let color: string
      let weight: number
      if (offset === 1) {
        color = baseColor
        weight = 0
      } else {
        const position = (offset - 1) / denom
        weight = position
        color = lerpColor(baseColor, peakColor, Math.min(position, capT))
      }

      if (d < monthStart || d > monthEnd) continue
      if (gradient[d] === peakColor && eventSet.has(d)) continue
      if (!(d in weights) || weight > weights[d]) {
        weights[d] = weight
        gradient[d] = color
      }
    }
  }
  return gradient
}

/**
 * 重要日期 / 倒数日当天直接染峰值色（现行行为）。
 *
 * 历史包袱：aggregator.build_view 曾在重要日期之间做渐变，后来改为「只有当天染色」，
 * buildGradient 保留在这里是因为年视图仍可能需要区间渐变。
 */
export function buildImportantColors(
  dates: readonly DateStr[],
  monthStart: DateStr,
  monthEnd: DateStr,
  color: string = GRADIENT_PEAK,
): Record<DateStr, string> {
  const out: Record<DateStr, string> = {}
  for (const d of dates) {
    if (d >= monthStart && d <= monthEnd) out[d] = color
  }
  return out
}

/** 取 5 档调色板里某一档的颜色，越界返回 null */
export function paletteAt(palette: readonly string[], level: number | null): string | null {
  if (level == null) return null
  if (!Number.isInteger(level) || level < 0 || level >= palette.length) return null
  return palette[level]
}

/** 把 hex 颜色调亮/调暗（用于 hover 态），amount ∈ [-1, 1] */
export function shadeColor(c: string, amount: number): string {
  const rgb = parseColor(c)
  if (!rgb) return c
  const f = (v: number) => {
    const t = amount < 0 ? 0 : 255
    const p = Math.abs(amount)
    return Math.round(v + (t - v) * p)
  }
  return `#${rgb.map((v) => f(v).toString(16).padStart(2, '0')).join('')}`
}
