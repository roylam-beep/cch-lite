#!/bin/sh
# templates/.github/workflows/harness.yml 的標準件清單，每一項都要在 templates/README.md 對照表裡。
# 防什麼：對照表改名或拿掉一項，workflow 還在驗舊路徑 → 每個裝過的 repo 的 CI 都紅，或驗了不存在的東西。
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
python3 - "$ROOT" <<'PY'
import re, sys
root = sys.argv[1]
wf = open(f"{root}/templates/.github/workflows/harness.yml", encoding="utf-8").read()
table = open(f"{root}/templates/README.md", encoding="utf-8").read()
m = re.search(r"for f in (.*?); do", wf, re.S)
items = m.group(1).replace("\\", " ").split() if m else []
targets = set()
for src, dst in re.findall(r"^\| `([^`]+)` \| (.+?) \|", table, re.M):
    d = re.search(r"`<repo>/([^`]+)`", dst)
    targets.add(d.group(1) if d else src)
bad = [i for i in items if i not in targets]
if not items or bad:
    print(f"HARNESS_WORKFLOW FAIL：清單解析不到或不在對照表：{bad or '（空）'}"); sys.exit(1)
print(f"HARNESS_WORKFLOW OK（{len(items)} 項都在對照表）")
PY
