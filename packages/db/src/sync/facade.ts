/**
 * 同步编排层 —— 把 SyncService（纯数据面三方合并）接到一个远端数据仓上。
 *
 * 状态模型：
 *   - 本地基线（上次同步后的合并快照+墓碑+commitSha）存 meta 表 sync.* 私有键，
 *     永不进入快照导出（LOCAL_ONLY_META_PREFIX 语义）；
 *   - 远端 = GitHub 数据仓的两个 JSON 文件（见 github.ts）；
 *   - 首绑决策：本地无基线且远端有数据 → 返回 needs_decision，由 UI 让用户选
 *     merge_push / pull_overwrite（与 SettingsDialog 的交互一致）。
 *
 * 端侧复用：mobile 在 Worker 里实例化本类；web/desktop 的 Node 数据服务同样
 * 可用（fetch 两边都有）——两端行为由同一份代码与测试保证。
 */

import type { Snapshot, SyncTableName, Tombstones } from '@tt-calendar/contracts'
import { SYNC_TABLE_NAMES } from '@tt-calendar/contracts'

import type { SqliteBackend } from '../backend'
import { SyncService } from '../sync-service'

export interface SyncRemote {
  /** 远端数据；null = 空仓/分支不存在 */
  readData(): Promise<{ snapshot: Snapshot; tombstones: Tombstones; commitSha: string } | null>
  writeData(
    snapshot: Snapshot,
    tombstones: Tombstones,
    parentSha: string | null,
    message: string,
  ): Promise<{ commitSha: string; htmlUrl: string | null }>
}

export interface StoredSyncConfig {
  repo: string
  branch: string
  token: string
  auto_on_start: boolean
  sync_on_close: boolean
}

export interface SyncFacadeDeps {
  backend: SqliteBackend
  svc: SyncService
  /** 按当前配置构造远端（配置存在 meta 里，允许中途改仓换号） */
  makeRemote: (cfg: { repo: string; branch: string; token: string }) => SyncRemote
  now?: () => string
}

// meta 表私有键（sync. 前缀：永不导出、永不产生墓碑）
const K_BASE = 'sync.base' // JSON { snapshot, tombstones, commitSha }
const K_REPO = 'sync.repo'
const K_BRANCH = 'sync.branch'
const K_TOKEN = 'sync.token'
const K_AUTO = 'sync.auto_on_start'
const K_ON_CLOSE = 'sync.sync_on_close'
const K_LAST_AT = 'sync.last_at'
const K_LAST_OK = 'sync.last_ok'
const K_LAST_COMMIT = 'sync.last_commit'

export interface LocalSyncBase {
  snapshot: Snapshot
  tombstones: Tombstones
  commitSha: string
}

export function rowCountOf(snapshot: Snapshot): number {
  let n = 0
  for (const t of SYNC_TABLE_NAMES) n += snapshot[t]?.length ?? 0
  return n
}

export class SyncNotConfiguredError extends Error {
  constructor() {
    super('尚未配置同步：请先填写数据仓与 PAT')
    this.name = 'SyncNotConfiguredError'
  }
}

export class SyncFacade {
  private readonly backend: SqliteBackend
  private readonly svc: SyncService
  private readonly makeRemote: SyncFacadeDeps['makeRemote']
  private readonly now: () => string

  constructor(deps: SyncFacadeDeps) {
    this.backend = deps.backend
    this.svc = deps.svc
    this.makeRemote = deps.makeRemote
    this.now = deps.now ?? ((): string => new Date().toISOString())
  }

  // ---------- 配置 / 状态（同步读 meta，与 UI 的 SyncConfig 对齐） ----------

  private readBase(): LocalSyncBase | null {
    const raw = this.backend.getMeta(K_BASE)
    if (!raw) return null
    try {
      return JSON.parse(raw) as LocalSyncBase
    } catch {
      return null
    }
  }

  getStoredConfig(): StoredSyncConfig {
    return {
      repo: this.backend.getMeta(K_REPO) ?? '',
      branch: this.backend.getMeta(K_BRANCH) ?? 'main',
      token: this.backend.getMeta(K_TOKEN) ?? '',
      auto_on_start: this.backend.getMeta(K_AUTO) === '1',
      sync_on_close: this.backend.getMeta(K_ON_CLOSE) !== '0',
    }
  }

  getConfig(): { repo: string; branch: string; auto_on_start: boolean; sync_on_close: boolean; has_token: boolean } {
    const c = this.getStoredConfig()
    return {
      repo: c.repo,
      branch: c.branch,
      auto_on_start: c.auto_on_start,
      sync_on_close: c.sync_on_close,
      has_token: c.token !== '',
    }
  }

  saveConfig(cfg: {
    repo: string
    branch: string
    token?: string
    auto_on_start: boolean
    sync_on_close?: boolean
  }): { ok: boolean } {
    if (!cfg.repo.trim() || !cfg.branch.trim()) throw new Error('数据仓（owner/repo）与分支不能为空')
    this.backend.setMeta(K_REPO, cfg.repo.trim())
    this.backend.setMeta(K_BRANCH, cfg.branch.trim())
    if (cfg.token) this.backend.setMeta(K_TOKEN, cfg.token)
    this.backend.setMeta(K_AUTO, cfg.auto_on_start ? '1' : '0')
    this.backend.setMeta(K_ON_CLOSE, (cfg.sync_on_close ?? true) ? '1' : '0')
    return { ok: true }
  }

  getStatus(): {
    configured: boolean
    at?: string
    ok?: boolean
    report?: Record<string, number>
    commit?: string | null
  } {
    const cfg = this.getConfig()
    const at = this.backend.getMeta(K_LAST_AT) ?? undefined
    return {
      configured: cfg.repo !== '' && cfg.has_token,
      at,
      ok: this.backend.getMeta(K_LAST_OK) === '1',
      commit: this.backend.getMeta(K_LAST_COMMIT) ?? null,
    }
  }

  // ---------- 连通性测试 ----------

  async test(): Promise<{ ok: boolean; detail: string }> {
    const cfg = this.getStoredConfig()
    if (!cfg.repo || !cfg.token) return { ok: false, detail: '请先填写数据仓与 PAT 并保存' }
    try {
      const remote = this.makeRemote({ repo: cfg.repo, branch: cfg.branch, token: cfg.token })
      const data = await remote.readData()
      if (!data) return { ok: true, detail: `连接成功：分支 ${cfg.branch} 尚不存在（首次同步将创建）` }
      const rows = rowCountOf(data.snapshot)
      return rows === 0
        ? { ok: true, detail: '连接成功：远端数据仓为空（首次同步将上传本地数据）' }
        : { ok: true, detail: `连接成功：远端已有 ${rows} 行数据` }
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) }
    }
  }

  // ---------- 主流程 ----------

  /**
   * 常规同步（三方合并）。本地无基线且远端有数据时返回 needs_decision，
   * 由用户调用 resolveFirstBind() 完成首绑。
   */
  async sync(mode: 'merge' | 'pull_overwrite' | 'merge_push' = 'merge'): Promise<{
    result: string
    pulled?: number
    pushed?: number
    conflicts?: number
    deleted?: number
    revived?: number
    warning?: string
    commit_url?: string | null
    remote_rows?: number
  }> {
    const cfg = this.getStoredConfig()
    if (!cfg.repo || !cfg.token) throw new SyncNotConfiguredError()
    const remote = this.makeRemote(cfg)
    const base = this.readBase()
    const remoteData = await remote.readData()

    // 首绑：本地无基线。初始化推送可能撞并发（分支刚被另一台设备建出、
    // 或 readData 与 write 之间远端发生变化）：SyncConflictError 后重读远端
    // 重试（≤3 次）；若重读发现远端已有数据则转 needs_decision。
    if (!base) {
      let attempt = 0
      for (;;) {
        attempt += 1
        const fresh = attempt === 1 ? remoteData : await remote.readData()
        const freshRows = fresh ? rowCountOf(fresh.snapshot) : 0
        if (freshRows > 0) {
          return { result: 'needs_decision', remote_rows: freshRows }
        }
        // 远端为空：把本地初始化上去。注意「远端无数据」≠「分支不存在」：
        // 分支可能已存在但快照为空（此前初始化过又清空数据），此时必须以
        // 远端头提交为父前进，传 null 会走创建 ref → 422 "Reference already exists"。
        const snapshot = this.svc.exportSnapshot()
        const tombstones = this.svc.exportTombstones()
        try {
          const w = await remote.writeData(
            snapshot,
            tombstones,
            fresh?.commitSha ?? null,
            'tt-calendar: 初始化数据仓',
          )
          this.saveBase({ snapshot, tombstones, commitSha: w.commitSha })
          this.saveLastStatus(w.commitSha)
          return { result: 'initialized', pushed: rowCountOf(snapshot), commit_url: w.htmlUrl }
        } catch (e) {
          if (e instanceof Error && e.name === 'SyncConflictError' && attempt < 3) {
            await new Promise((r) => setTimeout(r, 300 * attempt))
            continue
          }
          throw e
        }
      }
    }

    // 常规：重拉→合并→推回，冲突最多重试 3 次
    let attempt = 0
    for (;;) {
      attempt += 1
      const current = remoteData && attempt === 1 ? remoteData : await remote.readData()
      const r = this.svc.syncWith(
        base.snapshot,
        current?.snapshot ?? {},
        {
          base: base.tombstones,
          remote: current?.tombstones ?? {},
          local: this.svc.exportTombstones(),
        },
        mode,
      )
      try {
        const w = await remote.writeData(
          r.merged,
          r.tombstones,
          current?.commitSha ?? null,
          'tt-calendar: 数据同步',
        )
        this.saveBase({ snapshot: r.merged, tombstones: r.tombstones, commitSha: w.commitSha })
        this.saveLastStatus(w.commitSha)
        return {
          result: 'ok',
          pulled: r.report.pulled,
          pushed: r.report.pushed,
          conflicts: r.report.conflicts,
          deleted: r.report.deleted,
          revived: r.report.revived,
          commit_url: w.htmlUrl,
          remote_rows: rowCountOf(current?.snapshot ?? {}),
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'SyncConflictError' && attempt < 3) {
          // 非快进冲突：别人先推了。退避一下再重拉重并，避免冲突风暴下打满 API 配额。
          await new Promise((r) => setTimeout(r, 300 * attempt))
          continue
        }
        this.backend.setMeta(K_LAST_AT, this.now())
        this.backend.setMeta(K_LAST_OK, '0')
        throw e
      }
    }
  }

  /** 首绑裁决：merge_push（推并集）| pull_overwrite（远端覆盖本地） */
  async resolveFirstBind(mode: 'pull_overwrite' | 'merge_push'): Promise<{
    result: string
    pulled?: number
    pushed?: number
    conflicts?: number
    deleted?: number
    revived?: number
    commit_url?: string | null
  }> {
    const cfg = this.getStoredConfig()
    if (!cfg.repo || !cfg.token) throw new SyncNotConfiguredError()
    const remote = this.makeRemote(cfg)
    const remoteData = await remote.readData()
    const r = this.svc.syncWith(
      null,
      remoteData?.snapshot ?? {},
      {
        base: {},
        remote: remoteData?.tombstones ?? {},
        local: this.svc.exportTombstones(),
      },
      mode,
    )
    const w = await remote.writeData(r.merged, r.tombstones, remoteData?.commitSha ?? null, `tt-calendar: 首绑 ${mode}`)
    this.saveBase({ snapshot: r.merged, tombstones: r.tombstones, commitSha: w.commitSha })
    this.saveLastStatus(w.commitSha)
    return {
      result: 'ok',
      pulled: r.report.pulled,
      pushed: r.report.pushed,
      conflicts: r.report.conflicts,
      deleted: r.report.deleted,
      revived: r.report.revived,
      commit_url: w.htmlUrl,
    }
  }

  // ---------- 内部 ----------

  private saveBase(base: LocalSyncBase): void {
    this.backend.setMeta(K_BASE, JSON.stringify(base))
  }

  private saveLastStatus(commitSha: string): void {
    this.backend.setMeta(K_LAST_AT, this.now())
    this.backend.setMeta(K_LAST_OK, '1')
    this.backend.setMeta(K_LAST_COMMIT, commitSha)
  }
}

/** 供外部（测试/调试）枚举表行的辅助：快照表清单 */
export const SYNC_TABLES_FOR_UI: readonly SyncTableName[] = SYNC_TABLE_NAMES
