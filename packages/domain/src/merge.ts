/**
 * 行级三方合并（移植自 tt_calendar/sync/merge.py）。
 *
 * 纯函数，不碰 DB。有 golden vectors 对拍（tests/golden/merge_vectors.json），
 * 改这个文件必须重跑对拍测试。
 *
 * 裁决规则：
 *  - base == remote → 只有本地改了，用 local
 *  - base == local  → 只有远端改了，用 remote
 *  - 两边都改且内容不同 → updated_at 字符串大者胜（LWW，相等时本地优先）
 *  - 墓碑事后做删除裁决：deleted_at > 行.updated_at 则删行，否则行胜、墓碑撤销（revived）
 */

import { SYNC_TABLES, tombKey } from '@tt-calendar/contracts'
import type { SyncTableSpec, SyncTableName, Tombstones } from '@tt-calendar/contracts'
import type { Snapshot } from '@tt-calendar/contracts'

type Row = Record<string, unknown>

export interface MergeReport {
  pulled: number
  pushed: number
  conflicts: number
  deleted: number
  revived: number
}

export interface MergeResult {
  data: Snapshot
  upsert: Snapshot
  deletes: Partial<Record<SyncTableName, string[]>>
  tombstones: Tombstones
  report: MergeReport
}

/** 该表的行身份列名（自增表用 sync_uid，其余用主键） */
export function rowKeyColumnOf(table: string): string | null {
  const spec = (SYNC_TABLES as Record<string, SyncTableSpec | undefined>)[table]
  return spec ? spec[1] : null
}

/** 行数组 → 以行身份为键的字典；缺键的行直接丢弃 */
function byKey(rows: Row[] | undefined, key: string): Map<string, Row> {
  const out = new Map<string, Row>()
  for (const r of rows ?? []) {
    const v = r[key]
    if (!v) continue
    out.set(String(v), r)
  }
  return out
}

/** 严格深比较（键序无关，值用 JSON 序列化比对） */
function rowsEqual(a: Row | undefined, b: Row | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  if (ka.length !== kb.length) return false
  if (ka.some((k, i) => k !== kb[i])) return false
  return ka.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]))
}

/** LWW：updated_at 字符串大者胜，相等时本地优先 */
function lww(lrow: Row | undefined, rrow: Row | undefined): Row | undefined {
  if (!lrow) return rrow
  if (!rrow) return lrow
  const lt = String(lrow.updated_at ?? '')
  const rt = String(rrow.updated_at ?? '')
  return lt >= rt ? lrow : rrow
}

export interface MergeOptions {
  /**
   * 计算 upsert/deletes 差集的基准，默认 = local。
   * pull_overwrite 场景：合并参与者传空 local，差集基准仍传真实本地。
   */
  diffLocal?: Snapshot | null
}

/**
 * 三方合并主入口。
 *
 * @param base   上次同步的快照（首次绑定为 null / {}）
 * @param remote 远端快照
 * @param local  本地快照
 * @param baseTombs / remoteTombs / localTombs  三方的墓碑集合
 */
export function merge(
  base: Snapshot | null | undefined,
  remote: Snapshot,
  local: Snapshot,
  baseTombs: Tombstones = {},
  remoteTombs: Tombstones = {},
  localTombs: Tombstones = {},
  options: MergeOptions = {},
): MergeResult {
  const diffLocal = options.diffLocal === undefined ? local : options.diffLocal

  const tables = new Set<string>([
    ...Object.keys(remote ?? {}),
    ...Object.keys(local ?? {}),
    ...Object.keys(diffLocal ?? {}),
    ...Object.keys(base ?? {}),
  ])

  const merged: Record<string, Map<string, Row>> = {}
  const upsert: Snapshot = {}
  const deletes: Partial<Record<SyncTableName, string[]>> = {}
  const report: MergeReport = {
    pulled: 0,
    pushed: 0,
    conflicts: 0,
    deleted: 0,
    revived: 0,
  }

  for (const table of tables) {
    const key = rowKeyColumnOf(table)
    if (!key) continue

    const b = byKey((base ?? {})[table as SyncTableName], key)
    const r = byKey(remote[table as SyncTableName], key)
    const l = byKey(local[table as SyncTableName], key)

    const out = new Map<string, Row | undefined>()
    const keys = new Set<string>([...b.keys(), ...r.keys(), ...l.keys()])

    for (const k of keys) {
      const brow = b.get(k)
      const rrow = r.get(k)
      const lrow = l.get(k)

      if (rowsEqual(rrow, lrow)) {
        out.set(k, rrow)
      } else if (rowsEqual(brow, rrow)) {
        out.set(k, lrow)
        if (lrow) report.pushed += 1
      } else if (rowsEqual(brow, lrow)) {
        out.set(k, rrow)
        if (rrow) report.pulled += 1
      } else {
        const win = lww(lrow, rrow)
        out.set(k, win)
        report.conflicts += 1
        if (win === lrow) report.pushed += 1
        else report.pulled += 1
      }
    }

    const kept = new Map<string, Row>()
    for (const [k, v] of out) if (v) kept.set(k, v)
    merged[table] = kept
  }

  // 墓碑并集：同名取更晚的 deleted_at。
  // 注意与 Python 逐字一致：base_tombs 虽然在签名里，但原实现并未并入
  // （历史行为，并入会让「三方都删过」的行提前复活），保持不并以通过 golden 对拍。
  const tombs: Tombstones = { ...localTombs }
  for (const [k, dt] of Object.entries(remoteTombs)) {
    if (dt > (tombs[k] ?? '')) tombs[k] = dt
  }
  void baseTombs

  // 删除裁决：行胜条件 = 行.updated_at >= 墓碑.deleted_at
  for (const [composed, dt] of [...Object.entries(tombs)]) {
    const sep = composed.indexOf('|')
    const table = composed.slice(0, sep)
    const k = composed.slice(sep + 1)
    const row = merged[table]?.get(k)
    if (!row) continue
    if (dt > String(row.updated_at ?? '')) {
      merged[table]!.delete(k)
    } else {
      delete tombs[composed]
      report.revived += 1
    }
  }

  // 差集：相对本地，哪些要 upsert / 哪些要删。
  // upsert 对每张表都建键（哪怕空数组），与 Python 一致，否则 golden 对拍会键集合不一致。
  for (const [table, rows] of Object.entries(merged)) {
    const key = rowKeyColumnOf(table)
    if (!key) continue
    const localNow = byKey((diffLocal ?? {})[table as SyncTableName], key)

    const toUpsert: Row[] = []
    for (const [k, row] of rows) {
      if (!rowsEqual(row, localNow.get(k))) toUpsert.push(row)
    }
    upsert[table as SyncTableName] = toUpsert

    for (const k of localNow.keys()) {
      if (!rows.has(k)) {
        ;(deletes[table as SyncTableName] ??= []).push(k)
        report.deleted += 1
      }
    }
  }

  const data: Snapshot = {}
  for (const [table, rows] of Object.entries(merged)) {
    data[table as SyncTableName] = [...rows.values()]
  }

  return { data, upsert, deletes, tombstones: tombs, report }
}

/** 首次绑定（无 base）。pull_overwrite：远端覆盖；merge_push：全量并集 + LWW */
export function firstBindMerge(
  mode: 'pull_overwrite' | 'merge_push',
  remote: Snapshot,
  local: Snapshot,
  remoteTombs: Tombstones = {},
  localTombs: Tombstones = {},
): MergeResult {
  if (mode === 'pull_overwrite') {
    return merge(null, remote, {}, {}, remoteTombs, {}, { diffLocal: local })
  }
  return merge({}, remote, local, {}, remoteTombs, localTombs)
}

/** 把墓碑字典按表名归一（便于 store 直接消费） */
export function tombstonesByTable(tombs: Tombstones): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const composed of Object.keys(tombs)) {
    const sep = composed.indexOf('|')
    const table = composed.slice(0, sep)
    ;(out[table] ??= []).push(composed.slice(sep + 1))
  }
  return out
}

export { tombKey }
