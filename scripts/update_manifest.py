#!/usr/bin/env python3
# AIGC START
"""扫描 data/editions/*.json，重建期数清单 data/editions/index.json。

用途：每日自动化只需推送新的 data/editions/YYYY-MM-DD.json，
本脚本（由 GitHub Actions 或本地执行）负责校验并重建清单。
清单中的 editions 按日期由新到旧排序，页面默认展示最新一期。
"""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
EDITIONS_DIR = REPO_ROOT / "data" / "editions"
MANIFEST = EDITIONS_DIR / "index.json"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def main() -> int:
    if not EDITIONS_DIR.is_dir():
        print(f"error: {EDITIONS_DIR} not found", file=sys.stderr)
        return 1

    dates: list[str] = []
    for path in sorted(EDITIONS_DIR.glob("*.json")):
        if path.name == "index.json":
            continue
        if not DATE_RE.match(path.stem):
            print(f"skip: {path.name} (filename is not YYYY-MM-DD)", file=sys.stderr)
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"error: {path.name} is not valid JSON: {exc}", file=sys.stderr)
            return 1
        if data.get("date") != path.stem:
            print(f"error: {path.name} has mismatched 'date' field: {data.get('date')}", file=sys.stderr)
            return 1
        dates.append(path.stem)

    dates.sort(reverse=True)  # 新 → 旧
    manifest = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "editions": dates,
    }
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"manifest updated: {len(dates)} edition(s) -> {MANIFEST.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
# AIGC END
