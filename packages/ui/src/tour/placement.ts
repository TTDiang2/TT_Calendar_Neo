/**
 * popover 摆位纯函数（智者定稿：jsdom 里 getBoundingClientRect 恒为 0，
 * 纯函数是唯一可测路径；被 engine.tsx 调用，本身不碰 DOM）。
 *
 * 规则：4 主方位 → 空间不足自动翻转 → 水平 clamp；上下空间都不够 = 底部全宽 sheet
 * （含 safe-area padding，由引擎应用）。
 */

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface PlacementInput {
  /** 目标元素 rect（视口坐标） */
  target: Rect
  /** popover 预量尺寸（两段式渲染：先隐形量高再定位） */
  pop: Rect
  /** 视口尺寸 */
  viewport: { width: number; height: number }
  /** 期望方位；缺省 bottom */
  prefer?: 'top' | 'bottom' | 'left' | 'right'
  /** popover 与目标/视口边的间距 */
  gap?: number
}

export type PlacementResult =
  | { kind: 'absolute'; placement: 'top' | 'bottom' | 'left' | 'right'; left: number; top: number }
  | { kind: 'sheet' }

const DEFAULT_GAP = 10

/** 单一方位计算（left/top 为 popover 左上角，先不 clamp） */
function at(side: 'top' | 'bottom' | 'left' | 'right', t: Rect, p: Rect, gap: number): { left: number; top: number } {
  const cx = t.left + t.width / 2
  const cy = t.top + t.height / 2
  switch (side) {
    case 'top':
      return { left: cx - p.width / 2, top: t.top - p.height - gap }
    case 'bottom':
      return { left: cx - p.width / 2, top: t.top + t.height + gap }
    case 'left':
      return { left: t.left - p.width - gap, top: cy - p.height / 2 }
    case 'right':
      return { left: t.left + t.width + gap, top: cy - p.height / 2 }
  }
}

function fits(side: 'top' | 'bottom' | 'left' | 'right', pos: { left: number; top: number }, p: Rect, vp: { width: number; height: number }): boolean {
  if (side === 'top' || side === 'bottom') {
    return pos.top >= 0 && pos.top + p.height <= vp.height
  }
  return pos.left >= 0 && pos.left + p.width <= vp.width && pos.top >= 0 && pos.top + p.height <= vp.height
}

const FLIP: Record<'top' | 'bottom' | 'left' | 'right', 'top' | 'bottom' | 'left' | 'right'> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

export function computePlacement(input: PlacementInput): PlacementResult {
  const gap = input.gap ?? DEFAULT_GAP
  const { target: t, pop: p, viewport: vp } = input
  const prefer = input.prefer ?? 'bottom'

  for (const side of [prefer, FLIP[prefer]] as const) {
    const pos = at(side, t, p, gap)
    if (fits(side, pos, p, vp)) {
      // 水平 clamp（top/bottom 形态）：不出视口左右
      if (side === 'top' || side === 'bottom') {
        const left = Math.min(Math.max(pos.left, gap), Math.max(vp.width - p.width - gap, gap))
        return { kind: 'absolute', placement: side, left, top: pos.top }
      }
      // 垂直 clamp（left/right 形态）
      const top = Math.min(Math.max(pos.top, gap), Math.max(vp.height - p.height - gap, gap))
      return { kind: 'absolute', placement: side, left: pos.left, top }
    }
  }

  // 两主方位都放不下 → 底部全宽 sheet（视觉由引擎渲染，此处只给判定）
  return { kind: 'sheet' }
}

/** 4 矩形遮罩挖洞（智者定稿：不用 SVG path）。返回 [上,下,左,右] 四块覆盖矩形。 */
export function maskRects(hole: Rect, vp: { width: number; height: number }): [Rect, Rect, Rect, Rect] {
  return [
    { left: 0, top: 0, width: vp.width, height: Math.max(hole.top, 0) },
    { left: 0, top: hole.top + hole.height, width: vp.width, height: Math.max(vp.height - hole.top - hole.height, 0) },
    { left: 0, top: hole.top, width: Math.max(hole.left, 0), height: hole.height },
    { left: hole.left + hole.width, top: hole.top, width: Math.max(vp.width - hole.left - hole.width, 0), height: hole.height },
  ]
}

/** 洞矩形：目标 rect 外扩 padding（强调环视觉余量） */
export function holeOf(target: Rect, padding = 6): Rect {
  return {
    left: target.left - padding,
    top: target.top - padding,
    width: target.width + padding * 2,
    height: target.height + padding * 2,
  }
}
