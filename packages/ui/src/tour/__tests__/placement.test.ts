/**
 * placement 纯函数测试（智者 P1 验收：jsdom 唯一可测路径）。
 * 覆盖：4 方位成功/翻转/双翻不 fit→sheet/水平 clamp/挖洞 4 矩形无重叠全覆盖/洞外扩。
 */
import { describe, expect, it } from 'vitest'
import { computePlacement, holeOf, maskRects } from '../placement'

const VP = { width: 400, height: 800 }
const POP = { left: 0, top: 0, width: 200, height: 80 }

describe('computePlacement', () => {
  it('prefer bottom 且空间充足 → bottom 定位', () => {
    const target = { left: 100, top: 100, width: 200, height: 40 }
    const r = computePlacement({ target, pop: POP, viewport: VP, prefer: 'bottom' })
    expect(r).toMatchObject({ kind: 'absolute', placement: 'bottom' })
    if (r.kind !== 'absolute') return
    expect(r.top).toBe(100 + 40 + 10) // 目标底 + gap
    // 水平居中于目标
    expect(r.left).toBe(100 + 100 - 100) // 中心 200 - pop 半宽 100
  })

  it('下方不足 → 翻转到 top', () => {
    const target = { left: 100, top: 750, width: 200, height: 40 } // 底部只剩 10px
    const r = computePlacement({ target, pop: POP, viewport: VP, prefer: 'bottom' })
    expect(r).toMatchObject({ kind: 'absolute', placement: 'top' })
  })

  it('上下都不足 → sheet', () => {
    // 高 popover，目标居中偏上
    const target = { left: 100, top: 300, width: 200, height: 40 }
    const tallPop = { left: 0, top: 0, width: 200, height: 700 }
    const r = computePlacement({ target, pop: tallPop, viewport: VP, prefer: 'top' })
    expect(r).toEqual({ kind: 'sheet' })
  })

  it('水平 clamp：目标靠左时 popover 不出左边界', () => {
    const target = { left: 5, top: 100, width: 30, height: 40 }
    const r = computePlacement({ target, pop: POP, viewport: VP, prefer: 'bottom' })
    if (r.kind !== 'absolute') return expect.fail('should be absolute')
    expect(r.left).toBeGreaterThanOrEqual(10) // gap
  })

  it('left 方位：右侧空间不足翻转 left→right（目标贴左边时 right 可行）', () => {
    const target = { left: 50, top: 300, width: 60, height: 40 }
    const widePop = { left: 0, top: 0, width: 150, height: 80 }
    const r = computePlacement({ target, pop: widePop, viewport: VP, prefer: 'left' })
    // 左边只有 50px < 150+gap → 翻 right；right=50+60+10=120，120+150=270 < 400 ✓
    expect(r).toMatchObject({ kind: 'absolute', placement: 'right' })
  })
})

describe('maskRects（4 矩形挖洞）', () => {
  it('四块拼起来 = 全屏，且互不重叠（除边界），洞完全露出', () => {
    const hole = { left: 50, top: 100, width: 200, height: 60 }
    const [top, bottom, left, right] = maskRects(hole, VP)
    // 面积守恒：四块面积和 = 全屏 − 洞
    const area = (r: { width: number; height: number } | undefined): number => (r ? r.width * r.height : 0)
    const total = area(top) + area(bottom) + area(left) + area(right)
    expect(total).toBe(VP.width * VP.height - hole.width * hole.height)
    // 上块到洞顶；下块从洞底开始
    expect(top?.top).toBe(0)
    expect(top?.height).toBe(hole.top)
    expect(bottom?.top).toBe(hole.top + hole.height)
    expect(bottom?.height).toBe(VP.height - hole.top - hole.height)
    // 左块在洞的水平带内
    expect(left?.top).toBe(hole.top)
    expect(left?.width).toBe(hole.left)
    expect(right?.left).toBe(hole.left + hole.width)
  })

  it('洞贴边时相邻块尺寸为 0 不报错', () => {
    const hole = { left: 0, top: 0, width: 100, height: 50 }
    const rects = maskRects(hole, VP)
    expect(rects.every((r) => r.width >= 0 && r.height >= 0)).toBe(true)
  })
})

describe('holeOf（洞外扩）', () => {
  it('默认外扩 6px', () => {
    const h = holeOf({ left: 10, top: 10, width: 100, height: 40 })
    expect(h).toEqual({ left: 4, top: 4, width: 112, height: 52 })
  })
})
