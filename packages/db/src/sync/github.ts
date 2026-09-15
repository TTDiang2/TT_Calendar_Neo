/**
 * GitHub 数据仓客户端 —— 纯 REST 实现（git data API），不依赖 git 二进制。
 *
 * 这是为了 iOS WebView / Node 服务端都能跑同步：手机上没有 git，也没法
 * spawn 子进程；而「读快照 / 提交快照」用 blobs/trees/commits/refs 四个
 * REST 端点就够了。浏览器与 Node 22+ 都自带 fetch。
 *
 * 数据仓布局（两边自洽即可，PC/手机共用本文件）：
 *   data/snapshot.json    全量快照（SYNC_TABLE_NAMES 各表行数组）
 *   data/tombstones.json  墓碑集合 { "<table>|<rowKey>": deleted_at }
 *
 * 并发语义：提交按 parentSha 前进 ref（force=false）；别人先推了就 422，
 * 由调用方（SyncFacade）重拉重并重试。
 */

import pRetry, { AbortError } from 'p-retry'

import type { Snapshot, Tombstones } from '@tt-calendar/contracts'
import { SYNC_TABLES } from '@tt-calendar/contracts'

const API_ROOT = 'https://api.github.com'

export const SNAPSHOT_PATH = 'data/snapshot.json'
export const TOMBSTONES_PATH = 'data/tombstones.json'

/** 旧版 TT_Calendar 数据仓的每表一文件布局（data/{table}.json）识别 */
function isLegacyTablePath(path: string): boolean {
  return (
    path.startsWith('data/') &&
    path.endsWith('.json') &&
    path !== SNAPSHOT_PATH &&
    path !== TOMBSTONES_PATH
  )
}

/**
 * 把两份快照按**行级并集**合并（Neo 单文件快照 × 旧版每表文件）。
 *
 * 为什么需要并集而不是二选一：旧版仓被老 Neo 触碰过时，仓里会同时存在
 * 空的 data/snapshot.json 与完整的旧版各表；只认其一都会丢数据（这正是
 * 2026-09-15 用户「永远 0/0/0/0」的成因）。同一行两边都有时按 updated_at
 * 取新（LWW）——与三方合并同一口径；我们自己的双写产物两边内容一致，
 * 并集天然幂等。
 */
export function unionSnapshot(primary: Snapshot, extra: Snapshot): Snapshot {
  const out: Snapshot = { ...primary }
  for (const [table, rows] of Object.entries(extra)) {
    if (!Array.isArray(rows) || rows.length === 0) continue
    const spec = (SYNC_TABLES as Record<string, readonly [string, string, boolean]>)[table]
    const key = spec?.[1] ?? 'id'
    const byKey = new Map<string, Record<string, unknown>>()
    const put = (row: unknown): void => {
      if (!row || typeof row !== 'object') return
      const r = row as Record<string, unknown>
      const k = String(r[key] ?? '')
      if (!k) return
      const prev = byKey.get(k)
      if (!prev) {
        byKey.set(k, r)
        return
      }
      const a = String(prev['updated_at'] ?? '')
      const b = String(r['updated_at'] ?? '')
      byKey.set(k, b >= a ? r : prev)
    }
    const outRec = out as Record<string, unknown[] | undefined>
    for (const r of outRec[table] ?? []) put(r)
    for (const r of rows) put(r)
    outRec[table] = [...byKey.values()]
  }
  return out
}

/** 422 = ref 非快进（远端被并发推进） */
export class SyncConflictError extends Error {
  constructor(message = '远端分支已被并发更新（非快进），需要重拉重并') {
    super(message)
    this.name = 'SyncConflictError'
  }
}

export interface GithubDataRepoOptions {
  /** owner/name */
  repo: string
  branch: string
  /** PAT（repo 权限即可；classic 与 fine-grained 均可） */
  token: string
}

interface GitTreeEntry {
  path: string
  type: string
  sha: string
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/\n/g, '')
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/** 可重试的瞬时失败：网络错误 / 5xx / 429（422 冲突、4xx 语义错误不在此列） */
function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500
}

export class GitHubDataRepo {
  private readonly repo: string
  private readonly branch: string
  private readonly token: string
  /** 远端存在旧版布局（manifest.json 或 data/{table}.json）→ 写回时保持双写。
   *  由 readData 探测设置、同一次 sync 调用内 writeData 读取，因此无需持久化；
   *  我们自己的双写产物会让后续 readData 持续判定为旧版布局，自动维持。 */
  private legacyLayout = false

  constructor(opts: GithubDataRepoOptions) {
    this.repo = opts.repo
    this.branch = opts.branch
    this.token = opts.token
  }

  private async api<T>(method: string, path: string, body?: unknown): Promise<T> {
    // 瞬时失败（网络抖动 / 5xx / 429）指数退避重试；非快进 422 等语义错误
    // 属正常并发路径，交给调用方（SyncFacade）重拉重并，不在这里重试。
    return pRetry(
      async () => {
        // fetch 自身的拒绝（网络抖动）默认就会被 p-retry 重试
        const res = await fetch(`${API_ROOT}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
            'User-Agent': 'tt-calendar-sync',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        if (!res.ok) {
          let detail = ''
          try {
            detail = (await res.json())?.message ?? ''
          } catch {
            // 无响应体，忽略
          }
          const msg = `GitHub API ${method} ${path} → ${res.status}${detail ? `：${detail}` : ''}`
          if (isTransientStatus(res.status)) throw new Error(msg)
          throw new AbortError(msg)
        }
        if (res.status === 204) return undefined as T
        return (await res.json()) as T
      },
      {
        retries: 3,
        minTimeout: 500,
        maxTimeout: 4000,
        randomize: true,
      },
    )
  }

  private async apiMaybe<T>(path: string): Promise<T | null> {
    try {
      return await this.api<T>('GET', path)
    } catch (e) {
      if (e instanceof Error && e.message.includes('→ 404')) return null
      throw e
    }
  }

  /** 分支头 commit；分支/仓库不存在（空仓）返回 null */
  async headSha(): Promise<string | null> {
    const ref = await this.apiMaybe<{ object: { sha: string } }>(
      `/repos/${this.repo}/git/ref/heads/${encodeURIComponent(this.branch)}`,
    )
    return ref?.object.sha ?? null
  }

  /** 读仓库中某个文件（走 trees+blobs，无 1MB contents 限制）；不存在返回 null */
  async readBlob(path: string): Promise<Uint8Array | null> {
    const head = await this.headSha()
    if (!head) return null
    const tree = await this.api<{ tree: GitTreeEntry[] }>(
      'GET',
      `/repos/${this.repo}/git/trees/${head}?recursive=1`,
    )
    return this.blobFromTree(tree, path)
  }

  /** 从指定的 tree 里读 blob（不重新取 head —— 保证多文件来自同一 commit） */
  private async blobFromTree(tree: { tree: GitTreeEntry[] }, path: string): Promise<Uint8Array | null> {
    const entry = tree.tree.find((t) => t.type === 'blob' && t.path === path)
    if (!entry) return null
    const blob = await this.api<{ content: string; encoding: string }>(
      'GET',
      `/repos/${this.repo}/git/blobs/${entry.sha}`,
    )
    if (blob.encoding !== 'base64') throw new Error(`blob ${path} 编码异常：${blob.encoding}`)
    return fromBase64(blob.content)
  }

  /**
   * 一次提交多个文件。parentSha=null 表示从空仓创建初始提交并建分支；
   * ref 被并发推进时抛 SyncConflictError。
   */
  async commitFiles(
    files: { path: string; text: string }[],
    parentSha: string | null,
    message: string,
  ): Promise<{ commitSha: string; htmlUrl: string | null }> {
    // 1) 建 blob
    const treeEntries: { path: string; mode: string; type: string; sha: string }[] = []
    for (const f of files) {
      const blob = await this.api<{ sha: string }>('POST', `/repos/${this.repo}/git/blobs`, {
        content: toBase64(textEncoder.encode(f.text)),
        encoding: 'base64',
      })
      treeEntries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha })
    }

    // 2) 建树（有父提交则基于其树，只覆盖涉及路径）
    let baseTree: string | undefined
    if (parentSha) {
      const parent = await this.api<{ tree: { sha: string } }>(
        'GET',
        `/repos/${this.repo}/git/commits/${parentSha}`,
      )
      baseTree = parent.tree.sha
    }
    const tree = await this.api<{ sha: string }>('POST', `/repos/${this.repo}/git/trees`, {
      ...(baseTree ? { base_tree: baseTree } : {}),
      tree: treeEntries,
    })

    // 3) 提交
    const commit = await this.api<{ sha: string; html_url: string }>(
      'POST',
      `/repos/${this.repo}/git/commits`,
      {
        message,
        tree: tree.sha,
        parents: parentSha ? [parentSha] : [],
      },
    )

    // 4) 前进分支引用
    if (parentSha) {
      try {
        await this.api('PATCH', `/repos/${this.repo}/git/refs/heads/${encodeURIComponent(this.branch)}`, {
          sha: commit.sha,
          force: false,
        })
      } catch (e) {
        if (e instanceof Error && e.message.includes('→ 422')) throw new SyncConflictError()
        throw e
      }
    } else {
      // parentSha=null 本意是「空仓首建分支」。但分支实际已存在时（并发首绑、
      // 或远端是初始化过但快照为空的仓），GitHub 对 POST refs 返回
      // 422 "Reference already exists"。此时本提交没有父提交（parents=[]），
      // 对已有 head 必然非快进，就地 PATCH 注定失败——正确做法是重读 head
      // 并抛 SyncConflictError，让 SyncFacade 以正确的父提交重拉重并后重试。
      try {
        await this.api('POST', `/repos/${this.repo}/git/refs`, {
          ref: `refs/heads/${this.branch}`,
          sha: commit.sha,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!(msg.includes('→ 422') && msg.includes('already exists'))) throw e
        // 重读一次 head：把「分支已存在」坐实，也让下一次合并拿到正确 commitSha
        // （headSha 返回 null 的极端竞态同样按冲突处理，由调用方 bounded 重试收敛）
        await this.headSha()
        throw new SyncConflictError()
      }
    }

    return { commitSha: commit.sha, htmlUrl: commit.html_url ?? null }
  }

  /** 读远端数据（快照+墓碑）；空仓/分支不存在返回 null。
   *  兼容旧版 TT_Calendar 数据仓：新版是单文件 data/snapshot.json；旧版是
   *  manifest.json + data/{table}.json（每表一文件 {"rows":[...]}）。两者
   *  表名/行身份（sync_uid）/墓碑格式完全同构，旧版仓可直接合成 Neo 快照，
   *  数据无需迁移即可跨版本互通。legacy=true 标记来源为旧版布局。 */
  async readData(): Promise<{
    snapshot: Snapshot
    tombstones: Tombstones
    commitSha: string
    legacy: boolean
  } | null> {
    const head = await this.headSha()
    if (!head) return null
    // 只取一次 tree：快照与墓碑必须来自同一 commit，否则合并会拿
    // 「新快照 × 旧墓碑」这类错配输入（此前每次 readBlob 各自取 head 的
    // TOCTOU 窗口，在并发推送时会撞上）。
    const tree = await this.api<{ tree: GitTreeEntry[] }>(
      'GET',
      `/repos/${this.repo}/git/trees/${head}?recursive=1`,
    )
    const [snap, tombs] = await Promise.all([
      this.blobFromTree(tree, SNAPSHOT_PATH),
      this.blobFromTree(tree, TOMBSTONES_PATH),
    ])
    const tombstones: Tombstones = tombs ? (JSON.parse(textDecoder.decode(tombs)) as Tombstones) : {}
    // 旧版布局探测（与快照是否存在无关）：manifest.json 或任一 data/{table}.json
    const legacyTables = tree.tree.filter(
      (t) => t.type === 'blob' && isLegacyTablePath(t.path),
    )
    const hasManifest = tree.tree.some((t) => t.type === 'blob' && t.path === 'manifest.json')
    this.legacyLayout = hasManifest || legacyTables.length > 0

    const snapshot: Snapshot = snap ? (JSON.parse(textDecoder.decode(snap)) as Snapshot) : {}
    if (legacyTables.length === 0) {
      // 纯 Neo 仓（快照存在）或空仓 —— 无旧版表可并
      return { snapshot, tombstones, commitSha: head, legacy: false }
    }
    // ⚠️ 快照与旧版各表**并存**是真实且必然出现的形态：旧版仓被老 Neo 触碰过时，
    // 那次（失败的）初始化会往仓里补一个空的 data/snapshot.json，而旧版各表原样
    // 保留。若此时见快照就早返回，旧版表会被永久遮蔽 → 用户实测的「永远 0/0/0/0」
    // （2026-09-15 智者复核指出，我的第一版修复正是栽在这里）。故两者必须取并集。
    const legacySnapshot = await this.synthesizeLegacy(tree, legacyTables)
    return {
      snapshot: unionSnapshot(snapshot, legacySnapshot),
      tombstones,
      commitSha: head,
      legacy: true,
    }
  }

  /** 把旧版每表一文件的布局合成为 Neo 快照形态（单表损坏则跳过该表） */
  private async synthesizeLegacy(
    tree: { tree: GitTreeEntry[] },
    legacyTables: GitTreeEntry[],
  ): Promise<Snapshot> {
    const snapshot: Snapshot = {}
    await Promise.all(
      legacyTables.map(async (entry) => {
        const table = entry.path.slice('data/'.length, -'.json'.length)
        try {
          const blob = await this.blobFromTree(tree, entry.path)
          if (!blob) return
          const parsed = JSON.parse(textDecoder.decode(blob)) as { rows?: unknown[] }
          if (Array.isArray(parsed.rows)) {
            ;(snapshot as Record<string, unknown[]>)[table] = parsed.rows
          }
        } catch {
          // 单表损坏：跳过该表，不让整仓不可读
        }
      }),
    )
    return snapshot
  }

  /** 写远端数据（快照 + 墓碑；旧版布局时额外双写每表一文件）。
   *
   *  双写让旧版 TT_Calendar 桌面端与 Neo 共用同一数据仓（旧版读不到
   *  snapshot.json；墓碑两版格式相同，天然共享）。双写**只在检测到旧版
   *  布局时**进行——新用户的仓库不会被无谓地写成一式两份（体积翻倍）。
   *  空表也写 {"rows":[]}，防旧版客户端看到已清空表的残影。 */
  async writeData(
    snapshot: Snapshot,
    tombstones: Tombstones,
    parentSha: string | null,
    message: string,
    opts?: { dualWrite?: boolean },
  ): Promise<{ commitSha: string; htmlUrl: string | null }> {
    const files: { path: string; text: string }[] = [
      { path: SNAPSHOT_PATH, text: JSON.stringify(snapshot) },
      { path: TOMBSTONES_PATH, text: JSON.stringify(tombstones) },
    ]
    // 调用方（SyncFacade）显式传 dualWrite；未传时退回 readData 探测到的实例
    // 状态（仅供直接调用与测试使用）
    if (opts?.dualWrite ?? this.legacyLayout) {
      for (const [table, rows] of Object.entries(snapshot)) {
        if (Array.isArray(rows)) {
          files.push({ path: `data/${table}.json`, text: JSON.stringify({ rows }) })
        }
      }
    }
    return this.commitFiles(files, parentSha, message)
  }
}
