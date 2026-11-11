#!/bin/sh
# tools/check-plugin-sync.sh 的測試：造一個假的家目錄（假安裝紀錄＋假的安裝複本）真的跑，不讀檔猜行為。六項：
#   1. 帳號層＋專案層都和 repo 一致 → 退 0，兩筆都印 OK
#   2. 帳號層一致、某專案層是舊版 → 退 1，印出那個專案路徑與 `--scope project`（BACKLOG #17 的假綠）
#   3. 只有帳號層是舊版 → 退 1，印 `--scope user`
#   4. 專案資料夾已不存在的那筆 → 只印提示，退 0
#   5. 專案路徑有空白 → 照樣分得出欄位
#   6. 沒有安裝紀錄／這個 plugin 沒裝 → 跳過，退 0
# 用 HOME 指到暫存目錄：那支讀的是 `$HOME/.claude/plugins/installed_plugins.json`，不必為了測試加開關。
set -e
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✔ $1"; }
bad() { echo "  ✘ $1"; FAIL=1; }

copy() {  # $1 目的地：一份和 repo 一致的安裝複本
  mkdir -p "$1"
  cp -R "$ROOT/hooks" "$ROOT/tools" "$ROOT/commands" "$1/"
}
GOOD="$TMP/cache/good"; copy "$GOOD"
OLD="$TMP/cache/old";   copy "$OLD"; echo "// 舊版" >> "$OLD/hooks/guard-bash.mjs"
mkdir -p "$TMP/proj-a" "$TMP/proj with space"

record() {  # 參數：一筆一個 "scope|projectPath|installPath|version"
  mkdir -p "$TMP/home/.claude/plugins"
  python3 - "$TMP/home/.claude/plugins/installed_plugins.json" "$@" <<'PY'
import json, sys
entries = []
for raw in sys.argv[2:]:
    scope, proj, path, ver = raw.split("|")
    e = {"scope": scope, "installPath": path, "version": ver}
    if proj:
        e["projectPath"] = proj
    entries.append(e)
json.dump({"version": 2, "plugins": {"cch-lite@cch-lite": entries}}, open(sys.argv[1], "w"))
PY
}
run() { OUT="$(HOME="$TMP/home" sh "$ROOT/tools/check-plugin-sync.sh" 2>&1)" && RC=0 || RC=$?; }

record "user||$GOOD|9.9.9" "project|$TMP/proj-a|$GOOD|9.9.9"
run
[ "$RC" = 0 ] && [ "$(echo "$OUT" | grep -c 'PLUGIN_SYNC OK')" = 2 ] && ok "兩層都一致 → 綠，兩筆都比過" || bad "兩層都一致：rc=$RC $OUT"

record "user||$GOOD|9.9.9" "project|$TMP/proj-a|$OLD|9.9.8"
run
[ "$RC" = 1 ] && echo "$OUT" | grep -q "PLUGIN_SYNC FAIL（cch-lite 9.9.8｜專案層 $TMP/proj-a）" \
  && echo "$OUT" | grep -q "cd \"$TMP/proj-a\" && claude plugin update cch-lite@cch-lite --scope project" \
  && echo "$OUT" | grep -q "PLUGIN_SYNC OK（cch-lite 9.9.9｜帳號層" \
  && ok "帳號層一致、專案層舊版 → 紅，點名專案與 --scope project" || bad "專案層舊版：rc=$RC $OUT"

record "user||$OLD|9.9.8" "project|$TMP/proj-a|$GOOD|9.9.9"
run
[ "$RC" = 1 ] && echo "$OUT" | grep -q "再跑：claude plugin update cch-lite@cch-lite --scope user" \
  && ok "帳號層舊版 → 紅，--scope user" || bad "帳號層舊版：rc=$RC $OUT"

record "user||$GOOD|9.9.9" "project|$TMP/gone|$OLD|9.9.8"
run
[ "$RC" = 0 ] && echo "$OUT" | grep -q "PLUGIN_SYNC 提示（cch-lite 9.9.8｜專案層 $TMP/gone）" \
  && ok "專案資料夾不在 → 只提示，不紅" || bad "專案資料夾不在：rc=$RC $OUT"

record "user||$GOOD|9.9.9" "project|$TMP/proj with space|$OLD|9.9.8"
run
[ "$RC" = 1 ] && echo "$OUT" | grep -q "專案層 $TMP/proj with space）" \
  && ok "專案路徑有空白 → 欄位沒切錯" || bad "路徑有空白：rc=$RC $OUT"

rm -f "$TMP/home/.claude/plugins/installed_plugins.json"
run; A="$RC|$OUT"
echo '{"version":2,"plugins":{}}' > "$TMP/home/.claude/plugins/installed_plugins.json"
run
[ "$A" = "0|PLUGIN_SYNC 跳過（本機沒有安裝記錄）" ] && [ "$RC" = 0 ] && echo "$OUT" | grep -q "跳過（cch-lite 沒裝在本機）" \
  && ok "沒有紀錄／沒裝 → 跳過，不紅" || bad "沒有紀錄：$A / rc=$RC $OUT"

[ "$FAIL" = 0 ] && echo "PLUGIN_SYNC_TEST OK（6 項）" || { echo "PLUGIN_SYNC_TEST FAIL"; exit 1; }
