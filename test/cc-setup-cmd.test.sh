#!/bin/sh
# commands/cc-setup.md 第一段那行 check_docs.py 複製指令的測試：從 markdown 抽出指令，在暫存目錄真的跑。三項：
#   1. 沒有 scripts/ → 建 scripts/ 並複製（BACKLOG #26）
#   2. 已有 scripts/check_docs.py → 不覆寫
#   3. 有 scripts/ 但沒有該檔 → 複製
set -e
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✔ $1"; }
bad() { echo "  ✘ $1"; FAIL=1; }
CMD="$(grep 'tools/check_docs.py' "$ROOT/commands/cc-setup.md" | grep -E '^(\[ -e|cp )' | head -1)"
[ -n "$CMD" ] || { echo "  ✘ cc-setup.md 找不到 check_docs.py 複製指令"; exit 1; }
run() { (cd "$1" && CLAUDE_PLUGIN_ROOT="$ROOT" sh -c "$CMD") >/dev/null 2>&1; }

mkdir "$TMP/a"
run "$TMP/a" && cmp -s "$ROOT/tools/check_docs.py" "$TMP/a/scripts/check_docs.py" \
  && ok "沒有 scripts/ → 建目錄並複製" || bad "沒有 scripts/"

mkdir -p "$TMP/b/scripts"; echo "# 使用者版" > "$TMP/b/scripts/check_docs.py"
run "$TMP/b" && [ "$(cat "$TMP/b/scripts/check_docs.py")" = "# 使用者版" ] \
  && ok "已有 scripts/check_docs.py → 不覆寫" || bad "覆寫了既有檔"

mkdir -p "$TMP/c/scripts"
run "$TMP/c" && cmp -s "$ROOT/tools/check_docs.py" "$TMP/c/scripts/check_docs.py" \
  && ok "有 scripts/ 沒有該檔 → 複製" || bad "有 scripts/ 沒檔"

[ "$FAIL" = 0 ] && echo "CC_SETUP_CMD_TEST OK（3 項）" || { echo "CC_SETUP_CMD_TEST FAIL"; exit 1; }
