/**
 * 数据服务 Origin 门禁回归（20261013 slop 审计 H-1）：
 * 服务绑定 127.0.0.1 但任意网页可跨源 fetch 本端口读写日历数据，
 * 修复 = 非白名单 Origin 一律 403（含预检与写请求），白名单回显 ACAO。
 * 白名单成员见 server.ts ALLOWED_ORIGIN。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startDataServer, type DataServerHandle } from './server'

let handle: DataServerHandle
let base: string

beforeAll(async () => {
  handle = startDataServer({ dbPath: ':memory:', port: 0 })
  await handle.ready
  base = `http://127.0.0.1:${handle.port}`
})

afterAll(async () => {
  await handle.close()
})

describe('数据服务 Origin 门禁', () => {
  it('白名单 Origin（vite dev）放行并回显 ACAO', async () => {
    const r = await fetch(`${base}/api/todo/lists`, { headers: { Origin: 'http://localhost:5173' } })
    expect(r.status).toBe(200)
    expect(r.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })

  it('白名单 Origin（桌面壳生产模式 tauri.localhost）放行', async () => {
    const r = await fetch(`${base}/api/todo/lists`, { headers: { Origin: 'http://tauri.localhost' } })
    expect(r.status).toBe(200)
    expect(r.headers.get('access-control-allow-origin')).toBe('http://tauri.localhost')
  })

  it('无 Origin（同源 GET / curl / Node 工具）放行且不加 CORS 头', async () => {
    const r = await fetch(`${base}/api/todo/lists`)
    expect(r.status).toBe(200)
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('陌生网页 Origin 读请求 403', async () => {
    const r = await fetch(`${base}/api/todo/lists`, { headers: { Origin: 'https://evil.example.com' } })
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ detail: 'origin not allowed' })
  })

  it('陌生网页 Origin 的预检与写请求都 403，数据零落库', async () => {
    const pre = await fetch(`${base}/api/todo`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'POST' },
    })
    expect(pre.status).toBe(403)

    const write = await fetch(`${base}/api/todo`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example.com', 'Content-Type': 'application/json' },
      body: JSON.stringify({ list_id: 'inbox', title: 'injected' }),
    })
    expect(write.status).toBe(403)

    const todos = (await (await fetch(`${base}/api/todo?limit=100`)).json()) as unknown[]
    expect(todos).toHaveLength(0)
  })
})
