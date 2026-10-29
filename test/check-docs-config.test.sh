#!/bin/sh
# check_docs.py 的英文別名與可設定清單（第 1、3、5 類）。沒設環境變數＝原行為，這裡逐項證明。
#   1. BACKLOG 檔頭 `Max N items` 跟「上限 N 條」一樣生效；項目行裡的 `limit 5 items` 不算檔頭
#   2. CHECK_DOCS_SRC_GLOBS 把 lib/** 也算進「動原始碼就載入」那一桶
#   3. CHECK_DOCS_HOOK_DIRS 改找別處的 git hook 真身
#   4. BACKLOG 編號重複 → 紅；日期過期只印 ⚠️，BACKLOG_STALE_DAYS 可改
set -e
unset CLAUDE_CONFIG_DIR CHECK_DOCS_SRC_GLOBS CHECK_DOCS_HOOK_DIRS BACKLOG_STALE_DAYS
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✔ $1"; }
bad() { echo "  ✘ $1"; FAIL=1; }
run() { HOME="$TMP/home" python3 "$ROOT/tools/check_docs.py" "$TMP/r" 2>&1; }
mkdir -p "$TMP/r" "$TMP/home"

# ── 1. BACKLOG 英文檔頭 ──
printf '# BACKLOG\n\nMax 2 items.\n\n- a\n- b\n- c\n' > "$TMP/r/BACKLOG.md"
run | grep -q "3 條 > 2（檔頭宣告" && ok "Max 2 items → 上限 2" || bad "英文檔頭沒生效：$(run)"
printf '# BACKLOG\n\n上限 2 條。\n\n- a\n- b\n- c\n' > "$TMP/r/BACKLOG.md"
run | grep -q "3 條 > 2（檔頭宣告" && ok "上限 2 條 → 上限 2（原行為）" || bad "中文檔頭壞了：$(run)"
printf '# BACKLOG\n\n- show limit 1 items per page\n- b\n' > "$TMP/r/BACKLOG.md"
run | grep -q "CHECK_DOCS OK" && ok "項目行裡的 limit N items 不當檔頭" || bad "項目行被當成檔頭：$(run)"
rm "$TMP/r/BACKLOG.md"

# ── 4. BACKLOG 編號唯一、過期警告 ──
D31="$(python3 -c "import datetime; print(datetime.date.today() - datetime.timedelta(days=31))")"
TODAY="$(python3 -c "import datetime; print(datetime.date.today())")"
printf '| # | 一行 | 日期 |\n|---|---|---|\n| 18 | a | %s |\n| 18 | b | %s |\n' "$TODAY" "$TODAY" > "$TMP/r/BACKLOG.md"
run | grep -q "編號 18 重複（L3、L4）" && ok "兩列同編號 → 紅，帶兩個行號" || bad "重複編號沒抓到：$(run)"
printf '| # | 一行 | 日期 |\n|---|---|---|\n| 1 | a | %s |\n| 2 | b | %s |\n' "$D31" "$TODAY" > "$TMP/r/BACKLOG.md"
OUT="$(run)"; echo "$OUT" | grep -q "⚠️  BACKLOG.md L3: $D31" && echo "$OUT" | grep -q "CHECK_DOCS OK" && ! echo "$OUT" | grep -q "L4:" \
  && ok "31 天前 → 只印 ⚠️ 且仍綠；今天的不印" || bad "過期警告不對：$OUT"
BACKLOG_STALE_DAYS=60 run | grep -q "⚠️" && bad "BACKLOG_STALE_DAYS=60 仍警告" || ok "BACKLOG_STALE_DAYS=60 → 不警告"
rm "$TMP/r/BACKLOG.md"

# ── 2. src 桶可設定 ──
mkdir -p "$TMP/r/.claude/rules"
{ printf -- '---\npaths: ["lib/**"]\n---\n'; python3 -c "print('x'*6100)"; } > "$TMP/r/.claude/rules/lib.md"
run | grep -q "CHECK_DOCS OK" && ok "沒設：lib/** 不進 src 桶（原行為）" || bad "預設行為變了：$(run)"
CHECK_DOCS_SRC_GLOBS="src/**,lib/**" run | grep -q "scoped 合計 6,1" && ok "CHECK_DOCS_SRC_GLOBS 含 lib/** → 計入並超標" || bad "SRC_GLOBS 沒生效：$(CHECK_DOCS_SRC_GLOBS="src/**,lib/**" run)"
rm -rf "$TMP/r/.claude"

# ── 3. hook 目錄可設定 ──
git -C "$TMP/r" init -q
mkdir -p "$TMP/r/ops/hooks"; printf '#!/bin/sh\necho a\n' > "$TMP/r/ops/hooks/pre-commit"
run | grep -q "git hook 0 支" && ok "沒設：不看 ops/hooks（原行為）" || bad "預設行為變了：$(run)"
CHECK_DOCS_HOOK_DIRS="ops/hooks" run | grep -q "git hook pre-commit 未安裝" && ok "CHECK_DOCS_HOOK_DIRS=ops/hooks → 找到真身" || bad "HOOK_DIRS 沒生效：$(CHECK_DOCS_HOOK_DIRS=ops/hooks run)"

[ "$FAIL" -eq 0 ] && echo "CHECK_DOCS_CONFIG OK（10 項全過）" || { echo "CHECK_DOCS_CONFIG FAIL"; exit 1; }
