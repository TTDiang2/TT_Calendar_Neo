import { describe, expect, it } from 'vitest'

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import type { Snapshot, Tombstones } from '@tt-calendar/contracts'
import { firstBindMerge, merge, tombKey, tombstonesByTable } from './merge'

interface Vector {
  name: string
  kind: 'merge' | 'first_bind'
  input: {
    mode?: 'pull_overwrite' | 'merge_push'
    base?: Snapshot | null
    remote: Snapshot
    local: Snapshot
    base_tombs?: Tombstones
    remote_tombs?: Tombstones
    local_tombs?: Tombstones
  }
  expect: {
    data: Snapshot
    tombstones: Tombstones
    report: Record<string, number>
  }
}

const here = dirname(fileURLToPath(import.meta.url))
const vectors: Vector[] = JSON.parse(
  readFileSync(join(here, 'fixtures', 'merge_vectors.json'), 'utf-8'),
).vectors

/** 行按主键排序后比较（Python 端输出顺序不保证） */
function snapshotRows(s: Snapshot): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [table, rows] of Object.entries(s)) {
    out[table] = [...(rows ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  }
  return out
}

describe('golden vectors（与 Python merge.py 对拍，协议冻结）', () => {
  it('向量文件非空', () => {
    expect(vectors.length).toBeGreaterThan(0)
  })

  for (const v of vectors) {
    it(`vector: ${v.name}`, () => {
      let result
      if (v.kind === 'first_bind') {
        result = firstBindMerge(
          v.input.mode ?? 'pull_overwrite',
          v.input.remote,
          v.input.local,
          v.input.remote_tombs ?? {},
          v.input.local_tombs ?? {},
        )
      } else {
        result = merge(
          v.input.base ?? null,
          v.input.remote,
          v.input.local,
          v.input.base_tombs ?? {},
          v.input.remote_tombs ?? {},
          v.input.local_tombs ?? {},
        )
      }

      expect(snapshotRows(result.data)).toEqual(snapshotRows(v.expect.data))
      expect(result.tombstones).toEqual(v.expect.tombstones)
      expect(result.report).toEqual(v.expect.report)
    })
  }
})

describe('merge 补充行为（golden 未覆盖的角度）', () => {
  it('pull_overwrite 首绑：本地独有行按协议被删除（Python 冻结名义行为，golden 已对拍）', () => {
    const remote: Snapshot = { todo: [{ id: 'r1', updated_at: '1' }] }
    const local: Snapshot = {
      todo: [{ id: 'l1', updated_at: '9' }],
      marks: [{ id: 'm1', sync_uid: 'u1', updated_at: '1' }],
    }
    const r = firstBindMerge('pull_overwrite', remote, local)
    expect(r.data.todo).toEqual([{ id: 'r1', updated_at: '1' }])
    // ⚠️ 协议语义（golden first_bind_pull_overwrite_local_only_table 冻结）：
    // pull_overwrite = 「远端是唯一事实」，本地在远端找不到身份的行一律删除，
    // 连远端整个不存在的表也照删。上游若要保留本地数据，应走 merge_push 模式。
    expect(r.data.marks).toEqual([])
    expect(r.report.deleted).toBe(2)
    // 缺身份键（sync_uid）的行同样进不了同步
    const broken = firstBindMerge('pull_overwrite', remote, {
      marks: [{ id: 'm2', updated_at: '1' }],
    })
    expect(broken.data.marks).toEqual([])
  })

  it('tombstonesByTable：组合键拆表', () => {
    const t: Tombstones = { [tombKey('todo', 't1')]: '2026-01-01 00:00:00' }
    expect(tombstonesByTable(t)).toEqual({ todo: ['t1'] })
  })
})
