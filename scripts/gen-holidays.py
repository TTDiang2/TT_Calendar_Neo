"""
一次性工具：从 Python 的 chinese_calendar 库导出中国法定节假日 + 调休为静态 JSON，
供 TT_Calendar_Neo 的 TypeScript 前端直接内置（替代运行时的 Python 依赖）。

用法：
    <venv-python> scripts/gen-holidays.py <起始年> <结束年> <输出 json 路径>

判定口径与旧实现 backend/aggregator.py::_holiday_of 逐字一致：
    on_h, name = cc.get_holiday_detail(d)
    if on_h and name:           → 节假日名
    if cc.is_workday(d) and d.weekday() >= 5:  → 调休补班日

导出后前端查表即可，每年重跑一次本脚本更新数据。
"""

from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from pathlib import Path

# chinese_calendar 返回的是英文名，UI 要中文；未命中的名字原样保留（好过显示空白）
CN_NAMES = {
    "New Year's Day": "元旦",
    "Spring Festival": "春节",
    "Tomb-sweeping Day": "清明节",
    "Labour Day": "劳动节",
    "Dragon Boat Festival": "端午节",
    "Mid-autumn Festival": "中秋节",
    "National Day": "国庆节",
    "Anti-Fascist 70th Anniversary Day": "抗战胜利纪念日",
}


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__)
        return 2

    start_year = int(sys.argv[1])
    end_year = int(sys.argv[2])
    out_path = Path(sys.argv[3]).resolve()

    import chinese_calendar as cc

    data: dict[str, dict] = {}
    d = date(start_year, 1, 1)
    end = date(end_year, 12, 31)

    while d <= end:
        entry: dict = {}
        try:
            on_holiday, name = cc.get_holiday_detail(d)
            if on_holiday and name:
                entry["name"] = CN_NAMES.get(name, name)
            # 周末但算工作日 = 调休补班
            if cc.is_workday(d) and d.weekday() >= 5:
                entry["workday_made_up"] = True
        except (NotImplementedError, ValueError, KeyError):
            # 数据未覆盖该年份，跳过
            pass

        if entry:
            data[d.isoformat()] = entry
        d += timedelta(days=1)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "source": "chinese_calendar (Python) — 导出后静态内置，运行时不再依赖 Python",
        "coverage": {"from": start_year, "to": end_year},
        "data": {k: data[k] for k in sorted(data)},
    }
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=0) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"wrote {len(data)} holiday/调休 days ({start_year}-{end_year}) -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
