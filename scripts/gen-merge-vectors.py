"""
一次性工具：从 Python 参考实现（TT_Calendar/tt_calendar/sync/merge.py）导出**可对拍**的
同步合并 golden vectors，供 TT_Calendar_Neo 的 TypeScript 实现逐条复现。

用法：
    # 需要能 import 到 tt_calendar 包（旧仓库根目录）
    python scripts/gen-merge-vectors.py <TT_Calendar 仓库根> <输出 json 路径>

说明：
  - 旧仓库的 tests/gen_golden.py 有个缺陷：它在把 base/remote/local/墓碑传给 merge()
    之前就 v.pop() 掉了，导致 JSON 里 input 恒为空，其他语言的实现**无法对拍**。
    本脚本先深拷贝再 pop，把输入原样持久化，输出才是真正可用于跨语言对拍的向量。
  - 输出后本脚本即完成使命；Neo 日常不依赖 Python，vectors 只是冻结的协议产物。
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path


def row(k, title, ts, status="notStarted", extra=None):
    r = {"id": k, "title": title, "updated_at": ts, "status": status}
    if extra:
        r.update(extra)
    return r


def urow(uid, title, ts):
    return {"sync_uid": uid, "title": title, "updated_at": ts}


def d(*rows):
    return {"todo": list(rows)}


def key_str(k):
    table, row_key = k
    return f"{table}|{row_key}"


def build_vectors():
    """与旧仓库 tests/gen_golden.py 的场景集合逐条对齐，不增减。"""
    V = []

    def vec(name, kind, **kw):
        V.append({"name": name, "kind": kind, **kw})

    base = d(row("t1", "a", "2026-01-01 10:00:00"))

    # ---- 行合并基本分支 ----
    vec("no_change", "merge",
        base=base, remote=d(row("t1", "a", "2026-01-01 10:00:00")),
        local=d(row("t1", "a", "2026-01-01 10:00:00")),
        base_tombs={}, remote_tombs={}, local_tombs={})

    vec("pull_only", "merge", base=base, local=base,
        remote=d(row("t1", "a2", "2026-01-01 11:00:00")),
        base_tombs={}, remote_tombs={}, local_tombs={})

    vec("push_only", "merge", base=base, remote=base,
        local=d(row("t1", "a3", "2026-01-01 12:00:00")),
        base_tombs={}, remote_tombs={}, local_tombs={})

    vec("conflict_local_newer", "merge", base=base,
        remote=d(row("t1", "r-edit", "2026-01-01 11:00:00")),
        local=d(row("t1", "l-edit", "2026-01-01 12:00:00")),
        base_tombs={}, remote_tombs={}, local_tombs={})

    vec("conflict_remote_newer", "merge", base=base,
        remote=d(row("t1", "r-edit", "2026-01-01 13:00:00")),
        local=d(row("t1", "l-edit", "2026-01-01 12:00:00")),
        base_tombs={}, remote_tombs={}, local_tombs={})

    # 平局：updated_at 相同 → local 胜
    vec("conflict_tie_local_wins", "merge", base=base,
        remote=d(row("t1", "r-edit", "2026-01-01 12:00:00")),
        local=d(row("t1", "l-edit", "2026-01-01 12:00:00")),
        base_tombs={}, remote_tombs={}, local_tombs={})

    # 时间戳缺失（空串）：存在方胜过 absent
    vec("missing_ts_remote_wins_over_absent", "merge",
        base=d(), local=d(),
        remote=d({"id": "t9", "title": "no-ts", "updated_at": ""}),
        base_tombs={}, remote_tombs={}, local_tombs={})

    vec("both_add_different_rows", "merge", base=d(),
        remote=d(row("r1", "remote-new", "11:00")),
        local=d(row("l1", "local-new", "12:00")),
        base_tombs={}, remote_tombs={}, local_tombs={})

    vec("both_add_same_key", "merge", base=d(),
        remote=d(row("x1", "from-remote", "11:00")),
        local=d(row("x1", "from-local", "12:00")),
        base_tombs={}, remote_tombs={}, local_tombs={})

    vec("both_add_identical", "merge", base=d(),
        remote=d(row("x1", "same", "11:00")),
        local=d(row("x1", "same", "11:00")),
        base_tombs={}, remote_tombs={}, local_tombs={})

    # ---- 删除 / 墓碑 ----
    vec("remote_delete_wins", "merge", base=base, local=base, remote=d(),
        base_tombs={}, local_tombs={},
        remote_tombs={("todo", "t1"): "2026-01-01 11:00:00"})

    vec("local_edit_beats_tombstone", "merge", base=base, remote=d(),
        local=d(row("t1", "edited", "2026-01-01 12:00:00")),
        base_tombs={},
        remote_tombs={("todo", "t1"): "2026-01-01 11:00:00"},
        local_tombs={})

    vec("tombstone_newer_beats_edit", "merge", base=base, remote=d(),
        local=d(row("t1", "edited", "2026-01-01 12:00:00")),
        base_tombs={},
        remote_tombs={("todo", "t1"): "2026-01-01 13:00:00"},
        local_tombs={})

    # 墓碑 == 行时间戳 → 行胜（复活）边界
    vec("tombstone_equal_revives", "merge", base=base, remote=d(),
        local=d(row("t1", "edited", "2026-01-01 12:00:00")),
        base_tombs={},
        remote_tombs={("todo", "t1"): "2026-01-01 12:00:00"},
        local_tombs={})

    vec("local_delete_pushes", "merge", base=base, remote=base, local=d(),
        base_tombs={}, remote_tombs={},
        local_tombs={("todo", "t1"): "2026-01-01 12:00:00"})

    vec("tombstone_union_newer_wins", "merge", base=d(), remote=d(), local=d(),
        base_tombs={},
        remote_tombs={("todo", "t1"): "2026-01-01 13:00:00",
                      ("todo", "t2"): "2026-01-01 09:00:00"},
        local_tombs={("todo", "t1"): "2026-01-01 10:00:00"})

    vec("tombstone_for_absent_row_kept", "merge", base=d(), remote=d(), local=d(),
        base_tombs={},
        remote_tombs={("todo", "ghost"): "2026-01-01 10:00:00"},
        local_tombs={})

    # ---- 自增表（sync_uid 行身份）----
    vec("auto_table_merge", "merge",
        base={"marks": [urow("u1", "m-a", "10:00")]},
        remote={"marks": [urow("u1", "m-r", "11:00")]},
        local={"marks": [urow("u1", "m-a", "10:00"), urow("u2", "new-local", "12:00")]},
        base_tombs={}, remote_tombs={}, local_tombs={})

    # ---- 多表混合 ----
    vec("multi_table", "merge",
        base={"todo": [row("t1", "a", "10:00")],
              "coloring": [{"date": "2026-01-01", "level": 2, "updated_at": "10:00"}]},
        remote={"todo": [row("t1", "a", "10:00")],
                "coloring": [{"date": "2026-01-01", "level": 4, "updated_at": "11:00"}]},
        local={"todo": [row("t1", "a-rw", "12:00")],
               "coloring": [{"date": "2026-01-01", "level": 2, "updated_at": "10:00"}]},
        base_tombs={}, remote_tombs={}, local_tombs={})

    # ---- 表集合完整性：本地独有表 ----
    vec("local_only_table_in_merge", "merge",
        base={"todo": [row("t1", "a", "10:00")]},
        remote={"todo": [row("t1", "a2", "11:00")]},
        local={"todo": [row("t1", "a", "10:00")],
               "marks": [urow("u9", "local-only", "10:00")]},
        base_tombs={}, remote_tombs={}, local_tombs={})

    # ---- 首次绑定 ----
    vec("first_bind_pull_overwrite", "first_bind", mode="pull_overwrite",
        remote=d(row("r1", "remote", "11:00")),
        local=d(row("l1", "local", "12:00"), row("r1", "local-older", "09:00")),
        remote_tombs={}, local_tombs={})

    vec("first_bind_pull_overwrite_local_only_table", "first_bind",
        mode="pull_overwrite",
        remote=d(row("r1", "remote", "11:00")),
        local={"todo": [row("r1", "local-older", "09:00")],
               "marks": [urow("u1", "m", "10:00")]},
        remote_tombs={}, local_tombs={})

    vec("first_bind_merge_push_union", "first_bind", mode="merge_push",
        remote=d(row("r1", "remote", "11:00")),
        local=d(row("l1", "local", "12:00")),
        remote_tombs={}, local_tombs={})

    vec("first_bind_merge_push_conflict_lww", "first_bind", mode="merge_push",
        remote=d(row("x1", "from-remote", "13:00")),
        local=d(row("x1", "from-local", "12:00")),
        remote_tombs={}, local_tombs={})

    return V


def _norm(x):
    """墓碑统一用 "table|key" 字符串键并排序（Python dict 迭代序不稳定，排序保证幂等）。"""
    if isinstance(x, dict) and x and all(isinstance(k, tuple) for k in x):
        return {key_str(k): x[k] for k in sorted(x)}
    if isinstance(x, dict):
        return {k: _norm(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_norm(i) for i in x]
    return x


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    repo_root = Path(sys.argv[1]).resolve()
    out_path = Path(sys.argv[2]).resolve()

    sys.path.insert(0, str(repo_root))
    from tt_calendar.sync.merge import first_bind_merge, merge  # noqa: E402

    vectors = []
    for v in build_vectors():
        # 关键：先深拷贝保留输入，再 pop 出调用参数
        input_snapshot = _norm({k: v[k] for k in v if k not in ("name", "kind")})
        args = copy.deepcopy(v)

        if args["kind"] == "merge":
            result = merge(
                args["base"], args["remote"], args["local"],
                args["base_tombs"], args["remote_tombs"], args["local_tombs"],
            )
        else:
            result = first_bind_merge(
                args["mode"], args["remote"], args["local"],
                args["remote_tombs"], args["local_tombs"],
            )

        vectors.append({
            "name": v["name"],
            "kind": v["kind"],
            "input": input_snapshot,
            "expect": {
                "data": {t: sorted(rows, key=lambda r: json.dumps(r, sort_keys=True))
                         for t, rows in sorted(result["data"].items())},
                "tombstones": {key_str(k): dt for k, dt in sorted(result["tombstones"].items())},
                "report": result["report"],
            },
        })

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps({"version": 2, "vectors": vectors}, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"wrote {len(vectors)} replayable vectors -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
