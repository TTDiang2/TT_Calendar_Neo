/**
 * 动效助手 —— 基于 anime.js v4 的少量封装，统一全应用的入场/交互动效曲线。
 *
 * 原则（对应 docs/PHILOSOPHY 的克制审美）：
 * - 只做「引导注意力」的微动效：入场淡入上浮、层级 stagger、指示器位移；
 * - 时长 240-420ms、标准缓出，不做弹跳/旋转等抢戏效果；
 * - 尊重系统「减弱动态效果」设置（prefers-reduced-motion）时直接跳过。
 */

import { animate, stagger } from 'animejs'

/** 系统「减弱动态效果」开启时跳过一切动画（可访问性硬要求） */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 单元素入场：淡入 + 轻微上浮 */
export function animEnter(el: HTMLElement | null, opts?: { delay?: number; distance?: number; duration?: number }): void {
  if (!el || prefersReducedMotion()) return
  animate(el, {
    opacity: [0, 1],
    translateY: [opts?.distance ?? 10, 0],
    duration: opts?.duration ?? 320,
    delay: opts?.delay ?? 0,
    ease: 'out(3)',
  })
}

/** 容器内直接子元素依次入场（卡片网格 / 列表行的 stagger） */
export function animStaggerChildren(parent: HTMLElement | null, opts?: { delay?: number; each?: number; distance?: number }): void {
  if (!parent || prefersReducedMotion()) return
  const children = Array.from(parent.children).filter((c): c is HTMLElement => c instanceof HTMLElement)
  if (children.length === 0) return
  animate(children, {
    opacity: [0, 1],
    translateY: [opts?.distance ?? 14, 0],
    duration: 380,
    delay: stagger(opts?.each ?? 45, { start: opts?.delay ?? 0 }),
    ease: 'out(3)',
  })
}

/** 底部弹层（sheet）滑入：从屏幕底缘上滑 + 背景淡入由 CSS 负责 */
export function animSheetUp(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion()) return
  animate(el, {
    translateY: ['100%', 0],
    duration: 360,
    ease: 'out(4)',
  })
}

/** 数字滚动：从 0 数到目标值（统计面板大数字） */
export function animCountUp(el: HTMLElement | null, target: number, opts?: { duration?: number }): void {
  if (!el || prefersReducedMotion()) {
    if (el) el.textContent = String(target)
    return
  }
  const obj = { v: 0 }
  animate(obj, {
    v: target,
    duration: opts?.duration ?? 700,
    ease: 'out(3)',
    onUpdate: () => {
      el.textContent = String(Math.round(obj.v))
    },
  })
}

/** 柱状图生长：按 scaleY(0→1) 逐柱展开（transform-origin 需在调用侧设为 bottom） */
export function animGrowBars(els: HTMLElement[]): void {
  if (els.length === 0 || prefersReducedMotion()) return
  animate(els, {
    scaleY: [0, 1],
    duration: 520,
    delay: stagger(28),
    ease: 'out(4)',
  })
}

/** 环形进度描绘：stroke-dashoffset 从满偏移到目标 */
export function animRing(svgCircle: SVGCircleElement | null, targetOffset: number): void {
  if (!svgCircle || prefersReducedMotion()) return
  animate(svgCircle, {
    strokeDashoffset: [svgCircle.r.baseVal.value * 2 * Math.PI, targetOffset],
    duration: 800,
    ease: 'out(3)',
  })
}

/** 点击涟漪按压反馈：先缩到 0.94 再弹回 1 */
export function animPress(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion()) return
  animate(el, {
    scale: [{ to: 0.94, duration: 90, ease: 'out(2)' }, { to: 1, duration: 220, ease: 'out(3)' }],
  })
}
