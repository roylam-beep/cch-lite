#!/bin/sh
# 裝著的 plugin 真的載入成功了嗎？
#
# 為什麼需要這支：`claude plugin validate --strict` **驗不出載入期的錯誤**。
# 實測（2026-09-04）：`plugin.json` 宣告 `"hooks": "./hooks/hooks.json"` 時 validate 全綠，
# 但 `hooks/hooks.json` 是標準路徑、runtime 會自動載入，再宣告一次＝
# `Duplicate hooks file detected` → **整個 plugin failed to load**，四個 hook 全部沒跑，
# 而且除了 `claude plugin list` 之外沒有任何地方看得出來。
# 這個 bug 活了一輪才被第二個 repo 的 doctor 抓到。
#
# 沒安裝就跳過（CI 與新 clone 本來就沒裝），退 0。
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RC=0
for PJ in "$ROOT/.claude-plugin/plugin.json" "$ROOT"/plugins/*/.claude-plugin/plugin.json; do
  [ -f "$PJ" ] || continue
  NAME="$(sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PJ" | head -1)"
  OUT="$(claude plugin list 2>/dev/null | grep -A4 -- "$NAME@")"
  if [ -z "$OUT" ]; then echo "PLUGIN_LOADS 跳過（$NAME 沒裝在本機）"; continue; fi
  if printf '%s' "$OUT" | grep -q 'failed to load'; then
    echo "PLUGIN_LOADS FAIL：$NAME 載入失敗——hook 與 command 全部沒生效"
    printf '%s\n' "$OUT"; RC=1; continue
  fi
  echo "PLUGIN_LOADS OK（$NAME enabled）"
done
exit $RC
