/**
 * 订阅图层统一判别式的回归测试。
 *
 * 核心回归（20260918 用户实测缺陷）：判别式曾含「sort_order≥10 = 订阅图层」
 * 档位，而老端（Python）create_layer 给自建图层硬编码 sort_order=10
 * （backend/routes.py:271）——早起/早睡/约饭因此在手机端被误判成订阅图层、
 * 从图层树里消失。该档位已删除，本测试钉死：用户自建图层无论 sort_order
 * 多大都不是订阅图层。
 */
import { describe, expect, it } from 'vitest'
import { subscriptionLayerFilter, subscriptionLayerIds } from '../subscription'
import type { Layer } from '../types'

const SUB_NAMES = new Set(['集思录'])

function layer(overrides: Partial<Layer> = {}): Layer {
  return {
    layer_id: 'custom_abc',
    display_name: '早起',
    enabled: true,
    color: '#f00',
    sort_order: 0,
    kind: 'color' as const,
    group: null,
    config: {},
    ...overrides,
  } as Layer
}

describe('subscriptionLayerFilter', () => {
  it('jisilu_ 前缀 = 订阅图层（无论组名和档位）', () => {
    const isSub = subscriptionLayerFilter(SUB_NAMES)
    expect(isSub(layer({ layer_id: 'jisilu_CNV', display_name: '集思录·可转债', group: '集思录', sort_order: 10 }))).toBe(true)
    expect(isSub(layer({ layer_id: 'jisilu_CNV', display_name: '集思录·可转债', group: null, sort_order: 3 }))).toBe(true)
  })

  it('组名 = 某订阅 display_name = 订阅图层（即使没有前缀）', () => {
    const isSub = subscriptionLayerFilter(SUB_NAMES)
    expect(isSub(layer({ layer_id: 'weird_source_a', display_name: '某指标', group: '集思录', sort_order: 3 }))).toBe(true)
  })

  it('【回归】用户自建图层 sort_order=10 不是订阅图层（老端 create_layer 硬编码 10，早起/早睡/约饭实测踩雷）', () => {
    const isSub = subscriptionLayerFilter(SUB_NAMES)
    expect(isSub(layer({ layer_id: 'custom_813be064f200', display_name: '早起', group: '打卡', sort_order: 10 }))).toBe(false)
    expect(isSub(layer({ layer_id: 'custom_0c4bf8f35dad', display_name: '早睡', group: '打卡', sort_order: 10 }))).toBe(false)
    expect(isSub(layer({ layer_id: 'custom_db805bea0c05', display_name: '约饭', group: '日程', sort_order: 10 }))).toBe(false)
    expect(isSub(layer({ layer_id: 'custom_xyz', display_name: '打卡测试', group: null, sort_order: 99 }))).toBe(false)
  })

  it('内置日程点点（组名「日程」）不是订阅图层', () => {
    const isSub = subscriptionLayerFilter(SUB_NAMES)
    expect(isSub(layer({ layer_id: 'schedule_work', display_name: '工作', group: '日程', sort_order: 5, kind: 'dot' }))).toBe(false)
  })

  it('subscriptionLayerIds：只收订阅图层；sort_order=10 的自建图层不收', () => {
    const layers = [
      layer({ layer_id: 'jisilu_CNV', display_name: '集思录·可转债', group: '集思录', sort_order: 10 }),
      layer({ layer_id: 'custom_813be064f200', display_name: '早起', group: '打卡', sort_order: 10 }),
    ]
    expect(subscriptionLayerIds(layers, SUB_NAMES)).toEqual(new Set(['jisilu_CNV']))
  })
})
