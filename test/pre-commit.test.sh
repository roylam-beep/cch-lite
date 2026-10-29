#!/bin/sh
# templates/hooks/pre-commit 的測試：裝進臨時 git repo 真的 commit，不讀檔猜行為。四項：
#   1. scripts/check_docs.py 綠 → commit 成功
#   2. scripts/check_docs.py 紅 → commit 被擋
#   3. 只有 tools/check_docs.py（harness 自己的 repo）→ 照跑它
#   4. 一支都沒有 → 放行（缺檔不准擋住所有 commit）
# 用假的 check_docs.py（只印字＋退出碼）：這裡測的是 hook 怎麼找、怎麼跑，不是 check_docs 本身。
set -e
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✔ $1"; }
bad() { echo "  ✘ $1"; FAIL=1; }
fake() { mkdir -p "$R/$1"; printf 'import sys\nprint("RAN %s")\nsys.exit(%s)\n' "$1" "$2" > "$R/$1/check_docs.py"; }
N=0
repo() {  # 每項一個乾淨 repo
  N=$((N+1)); R="$TMP/r$N"; mkdir -p "$R"
  git -C "$R" init -q; git -C "$R" config user.email t@t; git -C "$R" config user.name t
  cp "$ROOT/templates/hooks/pre-commit" "$R/.git/hooks/pre-commit"; chmod +x "$R/.git/hooks/pre-commit"
}
try() { echo x > "$R/f$N"; git -C "$R" add -A; git -C "$R" commit -qm t 2>&1; }

repo; fake scripts 0
OUT="$(try)" && echo "$OUT" | grep -q "RAN scripts" && ok "scripts/ 綠 → 放行" || bad "scripts/ 綠：$OUT"

repo; fake scripts 1
if OUT="$(try)"; then bad "scripts/ 紅卻 commit 成功：$OUT"; else ok "scripts/ 紅 → 擋下"; fi

repo; fake tools 0
OUT="$(try)" && echo "$OUT" | grep -q "RAN tools" && ok "只有 tools/ → 照跑" || bad "只有 tools/：$OUT"

repo
OUT="$(try)" && ok "一支都沒有 → 放行" || bad "缺檔卻擋下：$OUT"

[ "$FAIL" -eq 0 ] && echo "PRE_COMMIT OK（4 項全過）" && exit 0
echo "PRE_COMMIT FAIL"; exit 1
