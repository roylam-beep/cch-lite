#!/bin/sh
# tools/install-hooks.sh 的測試：在臨時 git repo 真的跑，不碰真實 ~/.claude。五項：
#   1. 目的地沒有同名 hook → 直接裝上，不產生 .bak
#   2. 內容相同 → 跳過，不產生 .bak
#   3. 內容不同 → 先備份成 pre-commit.bak（內容是舊的），印出備份路徑，再覆寫（BACKLOG #24）
#   4. 已有 .bak 又遇到內容不同 → 舊備份原封不動，另存新備份
#   5. 目的地是指向 repo 內檔案的 symlink → 換掉連結本身，不寫穿到被指的檔
set -e
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✔ $1"; }
bad() { echo "  ✘ $1"; FAIL=1; }
R="$TMP/r"; mkdir -p "$R"; git -C "$R" init -q
H="$R/.git/hooks"
run() { OUT="$(cd "$R" && CLAUDE_PLUGIN_ROOT="$ROOT" sh "$ROOT/tools/install-hooks.sh" 2>&1)"; }

rm -f "$H"/pre-commit*
run
cmp -s "$ROOT/templates/hooks/pre-commit" "$H/pre-commit" && [ ! -e "$H/pre-commit.bak" ] \
  && ok "沒有同名 hook → 裝上，無備份" || bad "全新安裝：$OUT"

run
[ ! -e "$H/pre-commit.bak" ] && echo "$OUT" | grep -q "pre-commit 已是最新" \
  && ok "內容相同 → 跳過，無備份" || bad "內容相同：$OUT"

echo "# 使用者自己的 hook" > "$H/pre-commit"
run
[ "$(cat "$H/pre-commit.bak")" = "# 使用者自己的 hook" ] && cmp -s "$ROOT/templates/hooks/pre-commit" "$H/pre-commit" \
  && echo "$OUT" | grep -q "\.git/hooks/pre-commit\.bak" \
  && ok "內容不同 → 備份成 .bak、印出路徑、再覆寫" || bad "內容不同：$OUT"

echo "# 第二份舊 hook" > "$H/pre-commit"
run
NEW="$(ls "$H" | grep '^pre-commit\.bak\.' || true)"
[ "$(cat "$H/pre-commit.bak")" = "# 使用者自己的 hook" ] && [ -n "$NEW" ] && [ "$(cat "$H/$NEW")" = "# 第二份舊 hook" ] \
  && echo "$OUT" | grep -q "\.git/hooks/$NEW" \
  && ok "已有 .bak → 舊備份不動，另存帶時間戳的新備份" || bad "已有 .bak：$OUT / $NEW"

rm -f "$H"/pre-commit*; echo "# 進版控的 hook" > "$R/tracked-hook"; ln -s "$R/tracked-hook" "$H/pre-commit"
run
[ "$(cat "$R/tracked-hook")" = "# 進版控的 hook" ] && [ ! -L "$H/pre-commit" ] && cmp -s "$ROOT/templates/hooks/pre-commit" "$H/pre-commit" \
  && ok "symlink → 換掉連結，被指的檔不動" || bad "symlink：$OUT"

[ "$FAIL" = 0 ] && echo "INSTALL_HOOKS_TEST OK（5 項）" || { echo "INSTALL_HOOKS_TEST FAIL"; exit 1; }
