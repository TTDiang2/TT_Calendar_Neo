/**
 * GitHubDataRepo 纯 REST 客户端单测：stub 全局 fetch。
 * 覆盖：readData 的单树一致性（快照与墓碑必须来自同一 commit，回归
 * 「每次 readBlob 各自取 head」的 TOCTOU）、瞬时 5xx 的退避重试、
 * 非快进 422 → SyncConflictError。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { GitHubDataRepo, SNAPSHOT_PATH, SyncConflictError, TOMBSTONES_PATH } from '../github'

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
    expect(data).toEqual({ snapshot: {}, tombstones: {}, commitSha: 'h' })
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

  it('空仓/分支不存在 → readData 返回 null', async () => {
    withFetch(() => new Response('not found', { status: 404 }))
    const repo = new GitHubDataRepo({ repo: 'u/d', branch: 'main', token: 't' })
    expect(await repo.readData()).toBeNull()
  })
})
