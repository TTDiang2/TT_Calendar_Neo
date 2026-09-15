/**
 * GitHubDataRepo 纯 REST 客户端单测：stub 全局 fetch。
 * 覆盖：readData 的单树一致性（快照与墓碑必须来自同一 commit，回归
 * 「每次 readBlob 各自取 head」的 TOCTOU）、瞬时 5xx 的退避重试、
 * 非快进 422 → SyncConflictError。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { GitHubDataRepo, SNAPSHOT_PATH, SyncConflictError, TOMBSTONES_PATH, unionSnapshot } from '../github'

type Handler = (method: string, path: string, body?: unknown) => Response | Promise<Response>

function withFetch(handler: Handler) {
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url).replace('https://api.github.com', '')
    const [path, query] = u.split('?')
    const res = await handler(String(init?.method ?? 'GET'), path + (query ? `?${query}` : ''), init?.body)
    return res
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const SNAP = { todo: [{ id: 'a', title: 'x' }] }
const TOMBS = { 'todo|a': '2026-09-05 08:00:00+08:00' }
const B64 = (o: unknown): string => Buffer.from(JSON.stringify(o), 'utf8').toString('base64')

function okJson(v: unknown): Response {
  return new Response(JSON.stringify(v), { status: 200 })
}

describe('GitHubDataRepo', () => {
  it('readData：head 只取一次，快照与墓碑出自同一棵树', async () => {
    const fetchMock = withFetch((method, path) => {
      if (path === '/repos/u/d/git/ref/heads/main') {
        return okJson({ object: { sha: 'head1' } })
      }
      if (path.startsWith('/repos/u/d/git/trees/head1')) {
        return okJson({
          tree: [
            { path: SNAPSHOT_PATH, type: 'blob', sha: 'blob-snap' },
            { path: TOMBSTONES_PATH, type: 'blob', sha: 'blob-tombs' },
          ],
        })
      }
      if (path === '/repos/u/d/git/blobs/blob-snap') return okJson({ content: B64(SNAP), encoding: 'base64' })
      if (path === '/repos/u/d/git/blobs/blob-tombs') return okJson({ content: B64(TOMBS), encoding: 'base64' })
      return new Response('nope', { status: 404 })
    })

    const repo = new GitHubDataRepo({ repo: 'u/d', branch: 'main', token: 't' })
    const data = await repo.readData()
    expect(data).not.toBeNull()
    expect(data!.commitSha).toBe('head1')
    expect(data!.snapshot).toEqual(SNAP)
    expect(data!.tombstones).toEqual(TOMBS)
    // 1 次 ref + 1 次 tree + 2 次 blob：绝不出现第二次 ref 读取
    const refCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/git/ref/')).length
    expect(refCalls).toBe(1)
  })

  it('瞬时 5xx 指数退避后重试成功', async () => {
    let headCalls = 0
    withFetch((method, path) => {
      if (path === '/repos/u/d/git/ref/heads/main') {
        headCalls += 1
        if (headCalls === 1) return new Response('boom', { status: 502 })
        return okJson({ object: { sha: 'h' } })
      }
      if (path === '/repos/u/d/git/trees/h?recursive=1') return okJson({ tree: [] })
      return new Response('nope', { status: 404 })
    })

    const repo = new GitHubDataRepo({ repo: 'u/d', branch: 'main', token: 't' })
    const data = await repo.readData()
    expect(data).toEqual({ snapshot: {}, tombstones: {}, commitSha: 'h', legacy: false })
  })

  it('非快进 422 → SyncConflictError（不重试）', async () => {
    withFetch((method, path) => {
      if (path.startsWith('/repos/u/d/git/refs/heads/main') && method === 'PATCH') {
        return new Response('{"message":"Update is not a fast forward"}', {
          status: 422,
          headers: { 'content-type': 'application/json' },
        })
      }
      // commitFiles 前置的 blob/tree/commit 建链
      if (method === 'POST') return okJson({ sha: `s${Math.random()}`, html_url: 'x' })
      if (path.startsWith('/repos/u/d/git/commits/')) return okJson({ tree: { sha: 'basetree' } })
      return new Response('nope', { status: 404 })
    })

    const repo = new GitHubDataRepo({ repo: 'u/d', branch: 'main', token: 't' })
    await expect(repo.commitFiles([{ path: 'a.txt', text: 'x' }], 'parent', 'm')).rejects.toBeInstanceOf(
      SyncConflictError,
    )
  })

  it('首建分支撞 422 already exists → 重读 head 并抛 SyncConflictError（等待调用方以正确父提交重试）', async () => {
    withFetch((method, path) => {
      if (path === '/repos/u/d/git/refs' && method === 'POST') {
        return new Response('{"message":"Reference already exists"}', {
          status: 422,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (path.startsWith('/repos/u/d/git/ref/heads/main')) {
        return okJson({ object: { sha: 'existing-head' } })
      }
      // commitFiles 前置的 blob/tree/commit 建链
      if (method === 'POST') return okJson({ sha: `s${Math.random()}`, html_url: 'x' })
      return new Response('nope', { status: 404 })
    })

    const repo = new GitHubDataRepo({ repo: 'u/d', branch: 'main', token: 't' })
    await expect(repo.commitFiles([{ path: 'a.txt', text: 'x' }], null, 'm')).rejects.toBeInstanceOf(
      SyncConflictError,
    )
  })

  it('首建分支 already exists 且重读 head 也 404（极端竞态）→ 仍 SyncConflictError', async () => {
    withFetch((method, path) => {
      if (path === '/repos/u/d/git/refs' && method === 'POST') {
        return new Response('{"message":"Reference already exists"}', {
          status: 422,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (method === 'POST') return okJson({ sha: `s${Math.random()}`, html_url: 'x' })
      return new Response('nope', { status: 404 })
    })

    const repo = new GitHubDataRepo({ repo: 'u/d', branch: 'main', token: 't' })
    await expect(repo.commitFiles([{ path: 'a.txt', text: 'x' }], null, 'm')).rejects.toBeInstanceOf(
      SyncConflictError,
    )
  })

  it('快照与旧版各表并存 → 取并集（用户仓实证：空快照 319B + 旧版 todo.json 671KB）', async () => {
    // 真实形态：老 Neo 的失败初始化往旧版仓补了个空 snapshot.json，旧版各表原样
    // 保留。只认快照会永久遮蔽旧版数据（= 用户「永远 0/0/0/0」的实际成因）。
    const snapshotJson = {
      todo_list: [{ id: 'L1', display_name: '任务', updated_at: '2026-09-15 09:18:48+08:00' }],
      todo: [],
      marks: [],
    }
    const legacyTodo = {
      rows: [
        { id: 'T1', list_id: 'L1', title: '电脑待办一', updated_at: '2026-09-01 10:00:00+08:00' },
        { id: 'T2', list_id: 'L1', title: '电脑待办二', updated_at: '2026-09-02 10:00:00+08:00' },
      ],
    }
    // 同一行两边都有 → 按 updated_at LWW（旧版较新则旧版胜）
    const legacyList = {
      rows: [{ id: 'L1', display_name: '任务', updated_at: '2026-09-20 09:00:00+08:00' }],
    }
    withFetch((method, path) => {
      void method
      if (path === '/repos/u/d/git/ref/heads/main') return okJson({ object: { sha: 'h-mix' } })
      if (path.startsWith('/repos/u/d/git/trees/h-mix')) {
        return okJson({
          tree: [
            { path: 'data/snapshot.json', type: 'blob', sha: 'b-snap' },
            { path: 'manifest.json', type: 'blob', sha: 'b-manifest' },
            { path: 'data/todo.json', type: 'blob', sha: 'b-todo' },
            { path: 'data/todo_list.json', type: 'blob', sha: 'b-list' },
          ],
        })
      }
      if (path === '/repos/u/d/git/blobs/b-snap') return okJson({ content: B64(snapshotJson), encoding: 'base64' })
      if (path === '/repos/u/d/git/blobs/b-todo') return okJson({ content: B64(legacyTodo), encoding: 'base64' })
      if (path === '/repos/u/d/git/blobs/b-list') return okJson({ content: B64(legacyList), encoding: 'base64' })
      if (path === '/repos/u/d/git/blobs/b-manifest') return okJson({ content: B64({}), encoding: 'base64' })
      return new Response('nope', { status: 404 })
    })

    const repo = new GitHubDataRepo({ repo: 'u/d', branch: 'main', token: 't' })
    const data = await repo.readData()
    expect(data!.legacy).toBe(true)
    // 旧版 todo 的 2 行进来了（此前读到 0 行 = 用户症状）
    expect((data!.snapshot['todo'] ?? []).map((r) => (r as { title: string }).title).sort()).toEqual([
      '电脑待办一',
      '电脑待办二',
    ])
    // L1 两边都有 → LWW 取 updated_at 较新的旧版行，且不重复
    const lists = data!.snapshot['todo_list'] ?? []
    expect(lists).toHaveLength(1)
    expect(String((lists[0] as { updated_at: string }).updated_at)).toBe('2026-09-20 09:00:00+08:00')
  })

  it('unionSnapshot：行级并集 + LWW + 空表不遮蔽', () => {
    const a = { todo: [{ id: 'T1', title: 'A', updated_at: '2026-01-01 00:00:00+08:00' }] }
    const b = {
      todo: [
        { id: 'T1', title: 'B', updated_at: '2026-02-01 00:00:00+08:00' },
        { id: 'T2', title: 'C', updated_at: '2026-01-01 00:00:00+08:00' },
      ],
      marks: [],
    }
    const out = unionSnapshot(a as never, b as never)
    const rows = out['todo'] as { id: string; title: string }[]
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.id === 'T1')!.title).toBe('B') // LWW：较新者胜
    expect(rows.find((r) => r.id === 'T2')!.title).toBe('C') // 仅旧版有的行也保留
    expect(out['marks']).toBeUndefined() // 空表不产生键（删除由 tombstones 传播）
  })

  it('空仓/分支不存在 → readData 返回 null', async () => {
    withFetch(() => new Response('not found', { status: 404 }))
    const repo = new GitHubDataRepo({ repo: 'u/d', branch: 'main', token: 't' })
    expect(await repo.readData()).toBeNull()
  })

  it('旧版 TT_Calendar 数据仓（每表一文件）→ readData 合成 Neo 快照，legacy=true', async () => {
    const LEGACY_ROWS = { rows: [{ sync_uid: 'u1', title: '旧版事件', date: '2026-01-01' }] }
    withFetch((method, path) => {
      if (path === '/repos/u/d/git/ref/heads/main') {
        return okJson({ object: { sha: 'head-old' } })
      }
      if (path.startsWith('/repos/u/d/git/trees/head-old')) {
        return okJson({
          tree: [
            { path: 'manifest.json', type: 'blob', sha: 'b-manifest' },
            { path: 'data/events.json', type: 'blob', sha: 'b-events' },
            { path: 'data/todo_list.json', type: 'blob', sha: 'b-todolist' },
            { path: 'data/tombstones.json', type: 'blob', sha: 'b-tombs' },
          ],
        })
      }
      if (path.startsWith('/repos/u/d/git/blobs/b-events')) {
        return okJson({ content: B64(LEGACY_ROWS), encoding: 'base64' })
      }
      if (path.startsWith('/repos/u/d/git/blobs/b-tombs')) {
        return okJson({ content: B64({ 'events|u9': '2026-01-02 08:00:00+08:00' }), encoding: 'base64' })
      }
      if (path.startsWith('/repos/u/d/git/blobs/b-todolist')) {
        return okJson({ content: B64({ rows: [] }), encoding: 'base64' })
      }
      if (path.startsWith('/repos/u/d/git/blobs/b-manifest')) return okJson({ content: B64({}), encoding: 'base64' })
      return new Response('nope', { status: 404 })
    })

    const repo = new GitHubDataRepo({ repo: 'u/d', branch: 'main', token: 't' })
    const data = await repo.readData()
    expect(data).not.toBeNull()
    expect(data!.legacy).toBe(true)
    expect(data!.snapshot['events']).toEqual(LEGACY_ROWS.rows)
    // 空表在并集里不显式生成键（等价于空行；删除仍由 tombstones 传播）
    expect(data!.snapshot['todo_list'] ?? []).toEqual([])
    expect(data!.tombstones['events|u9']).toBe('2026-01-02 08:00:00+08:00')
  })

  it('writeData：旧版布局仓双写每表文件；纯 Neo 仓只写快照+墓碑（不无谓翻倍）', async () => {
    const run = async (treePaths: string[], snapshot: Record<string, unknown[]>) => {
      const created: { path: string; text: string }[] = []
      withFetch((method, path, body) => {
        if (path === '/repos/u/d/git/ref/heads/main') return okJson({ object: { sha: 'h1' } })
        if (path.startsWith('/repos/u/d/git/trees/h1')) {
          return okJson({
            tree: treePaths.map((p) => ({ path: p, type: 'blob', sha: `b-${p}` })),
          })
        }
        if (path === '/repos/u/d/git/blobs' && method === 'POST') {
          const parsed = JSON.parse(String(body)) as { content: string }
          created.push({ path: '', text: Buffer.from(parsed.content, 'base64').toString('utf8') })
          return okJson({ sha: `b${created.length}`, html_url: 'x' })
        }
        if (path === '/repos/u/d/git/trees' && method === 'POST') {
          const parsed = JSON.parse(String(body)) as { tree: { path: string }[] }
          for (const t of parsed.tree) created.push({ path: t.path, text: '' })
          return okJson({ sha: 'tree1' })
        }
        if (path === '/repos/u/d/git/commits' && method === 'POST') return okJson({ sha: 'c1', html_url: 'x' })
        if (path.startsWith('/repos/u/d/git/commits/')) return okJson({ tree: { sha: 'baseroot' } })
        if (path.startsWith('/repos/u/d/git/refs/heads/main') && method === 'PATCH') return okJson({})
        if (path.startsWith('/repos/u/d/git/blobs/')) {
          return okJson({ content: B64({ rows: [] }), encoding: 'base64' })
        }
        return new Response('nope', { status: 404 })
      })
      const repo = new GitHubDataRepo({ repo: 'u/d', branch: 'main', token: 't' })
      await repo.readData() // 探测布局（真实链路里 readData 总在 writeData 之前）
      await repo.writeData(snapshot, {}, 'h1', 'm')
      return created.filter((c) => c.path).map((c) => c.path)
    }

    // ① 纯 Neo 仓：双写关闭
    const neoPaths = await run(['data/snapshot.json', 'data/tombstones.json'], { todo: [{ id: 't1' }] })
    expect(neoPaths).toContain('data/snapshot.json')
    expect(neoPaths).toContain('data/tombstones.json')
    expect(neoPaths).not.toContain('data/todo.json')

    // ② 旧版布局仓（manifest.json + 每表文件）：双写开启
    const legacyPaths = await run(
      ['data/snapshot.json', 'manifest.json', 'data/todo.json'],
      { todo: [{ id: 't1' }], marks: [] },
    )
    expect(legacyPaths).toContain('data/snapshot.json')
    expect(legacyPaths).toContain('data/todo.json')
    expect(legacyPaths).toContain('data/marks.json') // 空表也写，防旧客户端残影
  })
})
