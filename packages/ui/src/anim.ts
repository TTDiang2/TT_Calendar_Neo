/**
 * 动效助手 —— 基于 anime.js v4 的少量封装，统一全应用的入场/交互动效曲线。
 *
 * 原则（对应 docs/PHILOSOPHY 的克制审美）：
 * - 只做「引导注意力」的微动效：入场淡入上浮、层级 stagger、指示器位移；
 * - 时长 240-420ms、标准缓出，不做弹跳/旋转等抢戏效果；
 * - 尊重系统「减弱动态效果」设置（prefers-reduced-motion）时直接跳过。
 */

import { animate, easings, stagger, utils } from 'animejs'

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

/* ── 苹果化补充：物理弹簧与方向性滑动 ──────────────────────────────
   曲线参数对齐 iOS 默认 spring 的手感：轻阻尼、快速收敛、末端微回弹。 */

/** 共享弹簧曲线：随手势松手归位 / 弹层入场 / 指示器滑动共用一份手感 */
export function springEase(stiffness = 170, damping = 22): ReturnType<typeof easings.spring> {
  return easings.spring({ mass: 1, stiffness, damping, velocity: 0 })
}

/**
 * 方向性内容滑动：内容朝 delta 方向滑出淡出再从反侧滑回（翻月/翻日/切 Tab）。
 * negative delta = 向左滑入（前进到下一页），positive = 向右滑入（退回上一页）。
 * 返回 cleanup：动画未完成时移除监听用（当前实现动画自成一体，直接忽略）。
 */
export function animSlideDirection(el: HTMLElement | null, delta: number, opts?: { distance?: number; duration?: number }): void {
  if (!el || prefersReducedMotion()) return
  const dist = opts?.distance ?? 32
  const dir = delta < 0 ? -1 : 1
  utils.remove(el, undefined, 'translateX')
  animate(el, {
    opacity: [0, 1],
    translateX: [dir * dist, 0],
    duration: opts?.duration ?? 320,
    ease: 'out(3)',
  })
}

/** 跟手位移的松手归位：手势未越过阈值时把内容弹回原位 */
export function animSpringBack(el: HTMLElement | null, fromX: number): void {
  if (!el) return
  if (prefersReducedMotion()) {
    el.style.transform = ''
    return
  }
  utils.remove(el, undefined, 'translateX')
  animate(el, {
    translateX: [fromX, 0],
    duration: 380,
    ease: springEase(220, 26),
  })
}

/** 抽屉滑入：direction -1 从左缘滑入，1 从右缘滑入（弹簧曲线，跟手感的替代） */
export function animDrawerIn(el: HTMLElement | null, direction: -1 | 1): void {
  if (!el || prefersReducedMotion()) return
  utils.remove(el, undefined, 'translateX')
  animate(el, {
    translateX: [`${direction * 100}%`, '0%'],
    duration: 420,
    ease: springEase(190, 22),
  })
}

/** 弹簧入场：轻微放大 + 上浮，带一次柔软的过冲（sheet / 弹窗 / dock 首现） */
export function animSpringIn(el: HTMLElement | null, opts?: { distance?: number; duration?: number }): void {
  if (!el || prefersReducedMotion()) return
  animate(el, {
    opacity: [0, 1],
    translateY: [opts?.distance ?? 18, 0],
    scale: [0.96, 1],
    duration: opts?.duration ?? 480,
    ease: springEase(180, 20),
  })
}
