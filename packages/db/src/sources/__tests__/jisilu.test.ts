/**
 * 集思录源测试：mock fetch（不出网）——解析容错、拉取分路、图层自动补建、
 * (layer_id, source_ref) upsert 去重与更新。
 */

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { openLocalDb } from '../../local/backend'
import {
  fetchJisiluEvents,
  htmlToPlain,
  parseJisiluItem,
  refreshDueOnBackend,
  refreshSubscriptionOnBackend,
  runJisiluImport,
  tryParseJisiluDate,
} from '../jisilu'

const require = createRequire(import.meta.url)

function item(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 101,
    code: '127061',
    title: '尚荣转债申购',
    start: '1780000000',
    description: '<b>申购</b> 代码 127061',
    url: '/data/detail/101',
    color: '#FFB300',
    ...over,
  }
}

describe('解析', () => {
  it('tryParseJisiluDate 容错 unix 秒/毫秒/ISO/松散格式', () => {
    expect(tryParseJisiluDate('1780000000')).toHaveLength(10)
    expect(tryParseJisiluDate('1780000000000')).toHaveLength(10)
    expect(tryParseJisiluDate('2026-9-5')).toBe('2026-09-05')
    expect(tryParseJisiluDate('2026-09-05 09:30:00')).toBe('2026-09-05')
    expect(tryParseJisiluDate('垃圾')).toBeNull()
  })

  it('htmlToPlain 去标签/实体/空白', () => {
    expect(htmlToPlain('<b>申购</b>&nbsp;代码&nbsp;127061<br/>详情')).toBe('申购 代码 127061 详情')
    expect(htmlToPlain('A&amp;B &lt;x&gt;')).toBe('A&B <x>')
  })

  it('parseJisiluItem：身份/图层/extra.url 前缀；缺日期或缺标题返回 null', () => {
    const ev = parseJisiluItem(item(), 'CNV')!
    expect(ev).not.toBeNull()
    expect(ev!.layer_id).toBe('jisilu_CNV')
    expect(ev!.source).toBe('jisilu')
    expect(ev!.source_ref).toBe('CNV:101')
    expect(ev!.date).toHaveLength(10)
    expect(ev!.description).toBe('申购 代码 127061')
    expect((ev!.extra as Record<string, unknown>)['url']).toBe('https://www.jisilu.cn/data/detail/101')

    expect(parseJisiluItem(item({ start: '' }), 'CNV')).toBeNull()
    expect(parseJisiluItem(item({ title: '  ' }), 'CNV')).toBeNull()
  })
})

describe('fetchJisiluEvents（mock fetch）', () => {
  it('按 qtype 分路拉取；字面 false 视为无数据；HTTP/解析错误进 errors 不中断', async () => {
    const calls: string[] = []
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = String(url)
      calls.push(u)
      if (u.includes('qtype=CNV')) {
        return new Response(JSON.stringify([item(), item({ id: 102, title: '另一条' })]), { status: 200 })
      }
      if (u.includes('qtype=diva')) return new Response('false', { status: 200 })
      if (u.includes('qtype=idxfut')) return new Response('{"oops":1}', { status: 500 })
      return new Response(JSON.stringify([]), { status: 200 })
    }) as unknown as typeof fetch

    const { events, errors } = await fetchJisiluEvents({
      start: '2026-09-01',
      end: '2026-10-01',
      qtypes: ['CNV', 'diva', 'idxfut', 'newstock_apply'],
      fetchImpl,
    })

    expect(calls).toHaveLength(4)
    expect(events.map((e) => e.source_ref)).toEqual(['CNV:101', 'CNV:102'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('idxfut: HTTP 500')
    // URL 参数形态与 legacy 一致
    expect(calls[0]).toContain('start=')
    expect(calls[0]).toContain('end=')
  })
})

describe('runJisiluImport 端到端', () => {
  it('图层自动补建（sort_order=10）+ 重复导入去重更新', async () => {
    const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
    const h = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })

    const payload = JSON.stringify([item(), item({ id: 102, title: '缴款' })])
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).includes('qtype=CNV')) return new Response(payload, { status: 200 })
      return new Response('false', { status: 200 })
    }) as unknown as typeof fetch

    // 默认 qtype 集里只有 CNV 返回数据，其余 qtype 为空
    const r1 = await runJisiluImport(h.backend, { start: '2026-09-01', end: '2026-10-01', qtypes: ['CNV'], fetchImpl })
    expect(r1.inserted).toBe(2)
    expect(r1.error).toBeNull()

    // 图层自动补建
    const layer = h.backend.getLayers().find((l) => l.layer_id === 'jisilu_CNV')
    expect(layer).toBeDefined()
    expect(layer!.display_name).toBe('可转债')
    expect(layer!.sort_order).toBeGreaterThanOrEqual(10)

    // 再导入：同 source_ref 更新，不产生重复
    const payload2 = JSON.stringify([item({ title: '尚荣转债申购（更新）' })])
    const fetchImpl2 = (async () => new Response(payload2, { status: 200 })) as unknown as typeof fetch
    const r2 = await runJisiluImport(h.backend, { start: '2026-09-01', end: '2026-10-01', qtypes: ['CNV'], fetchImpl: fetchImpl2 })
    expect(r2.inserted).toBe(1)

    const evs = h.backend.searchEvents('尚荣')
    expect(evs).toHaveLength(1)
    expect(evs[0]!.title).toBe('尚荣转债申购（更新）')
    expect(evs[0]!.layer_id).toBe('jisilu_CNV')

    h.sqlite.close()
  })

  it('订阅刷新：jisilu 源拉取并置 active；未知 source_key 返回 pending_adaptation；refresh-due 只刷启用的', async () => {
    const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
    const h = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })

    const payload = JSON.stringify([item({ id: 201, title: '打新日历事件' })])
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).includes('qtype=CNV')) return new Response(payload, { status: 200 })
      return new Response('false', { status: 200 })
    }) as unknown as typeof fetch

    // jisilu 订阅
    const jsub = h.backend.createSubscription({ display_name: '集思录日历', source_key: 'jisilu' })
    expect(jsub.source_key).toBe('jisilu')
    expect(jsub.status).toBe('pending')

    const r1 = await refreshSubscriptionOnBackend(h.backend, jsub, fetchImpl)
    expect(r1.ok).toBe(true)
    expect(r1.inserted).toBeGreaterThan(0)
    const after = h.backend.getSubscriptions().find((s) => s.id === jsub.id)!
    expect(after.status).toBe('active')
    expect(after.last_synced_at).toBeTruthy()
    expect(h.backend.searchEvents('打新日历事件')).toHaveLength(1)

    // 未适配源
    const csub = h.backend.createSubscription({ display_name: '自定义源' })
    const r2 = await refreshSubscriptionOnBackend(h.backend, csub, fetchImpl)
    expect(r2.ok).toBe(false)
    expect(r2.error).toContain('pending_adaptation')

    // refresh-due：禁用的订阅不参与
    h.backend.patchSubscription(csub.id, { enabled: false })
    const r3 = await refreshDueOnBackend(h.backend, fetchImpl)
    expect(r3.refreshed.some((r) => r.id === jsub.id)).toBe(true)
    expect(r3.refreshed.some((r) => r.id === csub.id)).toBe(false)

    h.sqlite.close()
  })
})
