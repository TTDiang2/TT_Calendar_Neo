/**
 * SyncFacade 端到端测试：假远端 + 两个独立本地库（模拟 手机 ↔ GitHub ↔ PC）。
 * 覆盖：初始化上传、首绑决策（pull_overwrite / merge_push）、常规三方合并
 * 双向同步、并发冲突重试、删除（墓碑）语义。
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

import type { Snapshot, Tombstones } from '@tt-calendar/contracts'

import { openLocalDb, type LocalDbHandle } from '../../local/backend'
import { SyncConflictError } from '../github'
import { SyncFacade, rowCountOf, type SyncRemote } from '../facade'

const require = createRequire(import.meta.url)

async function openDevice(): Promise<LocalDbHandle> {
  const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
  return openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
}

/** 内存假远端：commitSha 链 + 可注入的一次性冲突 */
function fakeRemote(initial?: { snapshot: Snapshot; tombstones: Tombstones }) {
  let head: string | null = null
  let snapshot: Snapshot = initial?.snapshot ?? {}
  let tombstones: Tombstones = initial?.tombstones ?? {}
  let pendingConflicts = 0
  const remote: SyncRemote = {
    async readData() {
      if (head === null) return null
      return { snapshot: structuredClone(snapshot), tombstones: structuredClone(tombstones), commitSha: head }
    },
    async writeData(snap, tombs, parentSha) {
      if (pendingConflicts > 0) {
        pendingConflicts -= 1
        throw new SyncConflictError()
      }
      if (head !== null && parentSha !== head) throw new SyncConflictError()
      snapshot = structuredClone(snap)
      tombstones = structuredClone(tombs)
      head = `c${Math.random().toString(36).slice(2, 10)}`
      return { commitSha: head, htmlUrl: `https://example.test/${head}` }
    },
  }
  return {
    remote,
    get head() {
      return head
    },
    get snapshot() {
      return snapshot
    },
    conflictOnce() {
      pendingConflicts = 1
    },
  }
}

function makeFacade(h: LocalDbHandle, remote: SyncRemote): SyncFacade {
  return new SyncFacade({ backend: h.backend, svc: h.svc, makeRemote: () => remote })
}

describe('SyncFacade 端到端（假远端）', () => {
  it('未配置时 sync 抛 SyncNotConfiguredError', async () => {
    const h = await openDevice()
    const fr = fakeRemote()
    const f = makeFacade(h, fr.remote)
    await expect(f.sync()).rejects.toMatchObject({ name: 'SyncNotConfiguredError' })
    expect(f.getStatus().configured).toBe(false)
    h.sqlite.close()
  })

  it('首次同步·远端为空 → initialized：本地全部行上传，基线保存', async () => {
    const h = await openDevice()
    const fr = fakeRemote()
    const f = makeFacade(h, fr.remote)

    const layer = h.backend.createLayer({ display_name: '工作' })
    h.backend.createEvent({
      layer_id: layer.layer_id,
      source: 'manual',
      date: '2026-09-15',
      title: '发布会',
      color: null,
      description: null,
      source_ref: null,
      sort_key: 0,
      extra: {},
    })

    f.saveConfig({ repo: 'u/data', branch: 'main', token: 't0k', auto_on_start: false, sync_on_close: true })
    const r = await f.sync()
    expect(r.result).toBe('initialized')
    expect(r.pushed).toBeGreaterThan(0)
    expect(fr.head).toBeTruthy()
    const evRows = (fr.snapshot['events'] ?? []) as { title: string }[]
    expect(evRows.some((e) => e.title === '发布会')).toBe(true)
    expect(f.getConfig().has_token).toBe(true)
    expect(f.getStatus().configured).toBe(true)
    expect(f.getStatus().ok).toBe(true)
    h.sqlite.close()
  })

  it('首绑·远端有数据 → needs_decision；pull_overwrite 用远端覆盖空本地', async () => {
    const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
    const pc = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
    const fr = fakeRemote()
    const pcF = makeFacade(pc, fr.remote)
    pcF.saveConfig({ repo: 'u/data', branch: 'main', token: 't', auto_on_start: false, sync_on_close: false })
    const list = pc.backend.createTodoList('PC清单')
    pc.backend.createTodo({ list_id: list.id, title: 'PC上的待办' })
    await pcF.sync()

    // 手机空库首绑
    const phone = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
    const phoneF = makeFacade(phone, fr.remote)
    phoneF.saveConfig({ repo: 'u/data', branch: 'main', token: 't', auto_on_start: false, sync_on_close: false })
    const r1 = await phoneF.sync()
    expect(r1.result).toBe('needs_decision')
    expect(r1.remote_rows).toBeGreaterThan(0)

    const r2 = await phoneF.resolveFirstBind('pull_overwrite')
    expect(r2.result).toBe('ok')
    expect(phone.backend.getTodos()).toHaveLength(1)
    expect(phone.backend.getTodos()[0]!.title).toBe('PC上的待办')
    expect(phone.backend.getTodoLists()[0]!.display_name).toBe('PC清单')

    // 再同步一次：无变化
    const r3 = await phoneF.sync()
    expect(r3.result).toBe('ok')
    expect(r3.pulled ?? 0).toBe(0)
    expect(r3.pushed ?? 0).toBe(0)
    pc.sqlite.close()
    phone.sqlite.close()
  })

  it('首绑·merge_push：两边数据取并集', async () => {
    const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
    const fr = fakeRemote()
    const pc = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
    const pcF = makeFacade(pc, fr.remote)
    pcF.saveConfig({ repo: 'u/data', branch: 'main', token: 't', auto_on_start: false, sync_on_close: false })
    const pcList = pc.backend.createTodoList('PC')
    pc.backend.createTodo({ list_id: pcList.id, title: '来自PC' })
    await pcF.sync()

    // 手机上有自己的数据，首绑 merge_push
    const phone = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
    const phoneF = makeFacade(phone, fr.remote)
    phoneF.saveConfig({ repo: 'u/data', branch: 'main', token: 't', auto_on_start: false, sync_on_close: false })
    const phoneList = phone.backend.createTodoList('手机')
    phone.backend.createTodo({ list_id: phoneList.id, title: '来自手机' })
    const r1 = await phoneF.sync()
    expect(r1.result).toBe('needs_decision')
    await phoneF.resolveFirstBind('merge_push')

    // 手机先看到 PC 的；PC 同步后也看到手机的
    expect(phone.backend.getTodos().some((t) => t.title === '来自PC')).toBe(true)
    await pcF.sync()
    expect(pc.backend.getTodos().some((t) => t.title === '来自手机')).toBe(true)
    pc.sqlite.close()
    phone.sqlite.close()
  })

  it('常规双向合并：各自改动互通，无覆盖丢失', async () => {
    const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
    const fr = fakeRemote()
    const pc = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
    const phone = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
    const pcF = makeFacade(pc, fr.remote)
    const phoneF = makeFacade(phone, fr.remote)
    pcF.saveConfig({ repo: 'u/d', branch: 'main', token: 't', auto_on_start: false, sync_on_close: false })
    phoneF.saveConfig({ repo: 'u/d', branch: 'main', token: 't', auto_on_start: false, sync_on_close: false })

    // PC 建库上行
    const list = pc.backend.createTodoList('共list')
    pc.backend.createTodo({ list_id: list.id, title: '基础任务' })
    await pcF.sync()
    // 手机首绑拉下来
    const r0 = await phoneF.sync()
    expect(r0.result).toBe('needs_decision')
    await phoneF.resolveFirstBind('pull_overwrite')
    expect(phone.backend.getTodos()).toHaveLength(1)

    // 双方各自改
    phone.backend.createTodo({ list_id: list.id, title: '手机新增' })
    pc.backend.createTodo({ list_id: list.id, title: 'PC新增' })
    pc.backend.updateTodo(pc.backend.getTodos()[0]!.id, { status: 'completed' })

    // 双向同步
    await pcF.sync()
    const rPhone = await phoneF.sync()
    expect(rPhone.result).toBe('ok')
    expect((rPhone.pulled ?? 0) + (rPhone.pushed ?? 0)).toBeGreaterThan(0)
    await pcF.sync()

    // 收敛：两边行集与状态一致
    const pTodos = pc.backend.getTodos().sort((a, b) => a.title.localeCompare(b.title))
    const mTodos = phone.backend.getTodos().sort((a, b) => a.title.localeCompare(b.title))
    expect(pTodos.map((t) => `${t.title}:${t.status}`)).toEqual(mTodos.map((t) => `${t.title}:${t.status}`))
    expect(pTodos).toHaveLength(3)
    pc.sqlite.close()
    phone.sqlite.close()
  })

  it('远端并发冲突（422）→ 自动重拉重并重试成功', async () => {
    const h = await openDevice()
    const fr = fakeRemote()
    const f = makeFacade(h, fr.remote)
    f.saveConfig({ repo: 'u/d', branch: 'main', token: 't', auto_on_start: false, sync_on_close: false })
    const layer = h.backend.createLayer({ display_name: 'L1' })
    h.backend.createEvent({
      layer_id: layer.layer_id,
      source: 'manual',
      date: '2026-10-01',
      title: 'e1',
      color: null,
      description: null,
      source_ref: null,
      sort_key: 0,
      extra: {},
    })
    await f.sync()
    fr.conflictOnce() // 下一次写远端先撞一次 422
    h.backend.createEvent({
      layer_id: layer.layer_id,
      source: 'manual',
      date: '2026-10-02',
      title: 'e2',
      color: null,
      description: null,
      source_ref: null,
      sort_key: 0,
      extra: {},
    })
    const r = await f.sync()
    expect(r.result).toBe('ok')
    expect(r.pushed).toBe(1)
    h.sqlite.close()
  })

  it('删除语义：一端删除同步后，另一端同删（墓碑生效）', async () => {
    const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
    const fr = fakeRemote()
    const pc = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
    const phone = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
    const pcF = makeFacade(pc, fr.remote)
    const phoneF = makeFacade(phone, fr.remote)
    pcF.saveConfig({ repo: 'u/d', branch: 'main', token: 't', auto_on_start: false, sync_on_close: false })
    phoneF.saveConfig({ repo: 'u/d', branch: 'main', token: 't', auto_on_start: false, sync_on_close: false })

    const list = pc.backend.createTodoList('L')
    pc.backend.createTodo({ list_id: list.id, title: '会被删的任务' })
    await pcF.sync()
    const r0 = await phoneF.sync()
    expect(r0.result).toBe('needs_decision')
    await phoneF.resolveFirstBind('pull_overwrite')
    expect(phone.backend.getTodos()).toHaveLength(1)

    pc.backend.deleteTodo(pc.backend.getTodos()[0]!.id)
    await pcF.sync()
    await phoneF.sync()
    expect(phone.backend.getTodos()).toHaveLength(0)
    pc.sqlite.close()
    phone.sqlite.close()
  })

  it('rowCountOf 汇总各表行数', () => {
    expect(rowCountOf({ todo: [{ id: 'a' }], events: [{ id: 1 }, { id: 2 }] })).toBe(3)
  })

  it('跨设备自增 id 空间无关：远端行不得按 id 串写本地行（回归）', async () => {
    const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
    const fr = fakeRemote()
    const pc = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
    const phone = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
    const pcF = makeFacade(pc, fr.remote)
    const phoneF = makeFacade(phone, fr.remote)
    pcF.saveConfig({ repo: 'u/d', branch: 'main', token: 't', auto_on_start: false, sync_on_close: false })
    phoneF.saveConfig({ repo: 'u/d', branch: 'main', token: 't', auto_on_start: false, sync_on_close: false })

    // PC 的事件 A：在 PC 库里自增 id = 1
    const layer = pc.backend.createLayer({ display_name: 'L' })
    pc.backend.createEvent({
      layer_id: layer.layer_id,
      source: 'manual',
      date: '2026-10-01',
      title: 'PC事件A',
      color: null,
      description: null,
      source_ref: null,
      sort_key: 0,
      extra: {},
    })
    await pcF.sync()

    // 手机在拉取之前已有自己的事件 B：在手机库里也是自增 id = 1，但 sync_uid 不同
    const phoneLayer = phone.backend.createLayer({ display_name: 'L' })
    phone.backend.createEvent({
      layer_id: phoneLayer.layer_id,
      source: 'manual',
      date: '2026-10-02',
      title: '手机事件B',
      color: null,
      description: null,
      source_ref: null,
      sort_key: 0,
      extra: {},
    })
    // 首绑 merge_push：A 下行到手机 —— 不得按 id=1 串写掉 B
    expect(await phoneF.sync()).toMatchObject({ result: 'needs_decision' })
    const r = await phoneF.resolveFirstBind('merge_push')
    expect(r.result).toBe('ok')

    const phoneEvs = phone.svc.exportSnapshot()['events'] ?? []
    expect(phoneEvs).toHaveLength(2)
    expect(phoneEvs.map((e) => String(e.title)).sort()).toEqual(['PC事件A', '手机事件B'])
    expect(new Set(phoneEvs.map((e) => String(e.sync_uid))).size).toBe(2)
    expect(new Set(phoneEvs.map((e) => Number(e.id))).size).toBe(2)
    // 下行行的时间戳带 UTC 偏移（跨时区 LWW 可比）
    expect(String(phoneEvs.find((e) => e.title === 'PC事件A')?.updated_at)).toMatch(/[+-]\d{2}:\d{2}$/)

    // PC 再同步：B 上行，A 保持原内容
    await pcF.sync()
    const pcEvs = pc.svc.exportSnapshot()['events'] ?? []
    expect(pcEvs).toHaveLength(2)
    const pcA = pcEvs.find(
      (e) => String(e.sync_uid) === String(phoneEvs.find((e) => e.title === 'PC事件A')?.sync_uid),
    )
    expect(pcA?.title).toBe('PC事件A')
    pc.sqlite.close()
    phone.sqlite.close()
  })

  it('同一 sync_uid 的编辑互通且不产生重复行', async () => {
    const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
    const fr = fakeRemote()
    const pc = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
    const phone = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
    const pcF = makeFacade(pc, fr.remote)
    const phoneF = makeFacade(phone, fr.remote)
    pcF.saveConfig({ repo: 'u/d', branch: 'main', token: 't', auto_on_start: false, sync_on_close: false })
    phoneF.saveConfig({ repo: 'u/d', branch: 'main', token: 't', auto_on_start: false, sync_on_close: false })

    const layer = pc.backend.createLayer({ display_name: 'L' })
    pc.backend.createEvent({
      layer_id: layer.layer_id,
      source: 'manual',
      date: '2026-10-01',
      title: '原标题',
      color: null,
      description: null,
      source_ref: null,
      sort_key: 0,
      extra: {},
    })
    await pcF.sync()
    expect(await phoneF.sync()).toMatchObject({ result: 'needs_decision' })
    await phoneF.resolveFirstBind('pull_overwrite')

    // 手机改标题 → 两轮同步后 PC 看到新标题，且没有重复行
    const mine = phone.backend.searchEvents('原标题')[0]!
    phone.backend.updateEvent(mine.id!, { title: '手机改的标题' })
    await phoneF.sync()
    await pcF.sync()

    const pcEvs = pc.svc.exportSnapshot()['events'] ?? []
    expect(pcEvs).toHaveLength(1)
    expect(String(pcEvs[0]!.title)).toBe('手机改的标题')
    pc.sqlite.close()
    phone.sqlite.close()
  })
})
