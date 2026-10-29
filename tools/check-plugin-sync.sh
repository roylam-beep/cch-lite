#!/bin/sh
# 裝著的 hook 是不是本 repo 的當前內容？
#
# **只比 `hooks/` 與 `tools/`，不比 `commands/`／`templates/`。** 理由是實測出來的兩種行為：
#   · **command 走原始 repo**：改了 `commands/` 的本文，不 bump、不 update，下一次呼叫就生效；
#     command 本文裡的 `${CLAUDE_PLUGIN_ROOT}` 展開成 `~/Documents/3.AGENT/cch-lite`。
#     所以 `commands/` 與它讀的 `templates/` 永遠是當前內容，不需要這支守。
#   · **hook 走安裝快取**：`~/.claude/plugins/cache/<mp>/<plugin>/<version>/`，
#     版本在 session 開始時釘住（實測：PreToolUse 的錯誤訊息印出 `…/0.1.3/hooks/guard-bash.mjs`，
#     當時 repo 已經是 0.1.4）。在 `hooks/session-start.sh` 插一行標記、不 bump、開新 session
#     → 標記**沒有**出現，確認 hook 讀的是快取那份。
#     `hooks/` 呼叫的 `$CLAUDE_PLUGIN_ROOT/tools/*` 同樣落在快取，所以 `tools/` 也要比。
#   · **command 的「有哪幾支」走快取**：本文讀原始 repo，但清單從快取列（實測 2026-09-23：
#     新增 `cc-cursor.md` 沒 bump，快取 0.3.2 沒有這檔，session 的 skill 清單也不出現）。
#     所以 `commands/` 只比檔名，不比內容。
#
# 改了 hooks/ 或 tools/ 之後：bump `plugin.json` 的 version → `claude plugin update cch-lite`
# → **重開 session**（版本在 session 開始時釘住，同一個 session 內不會換）。
#
# 沒安裝就跳過（CI 與新 clone 本來就沒裝），退 0。
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
REC="$HOME/.claude/plugins/installed_plugins.json"
[ -f "$REC" ] || { echo "PLUGIN_SYNC 跳過（本機沒有安裝記錄）"; exit 0; }

RC=0
sync_one() {  # $1 plugin 名  $2 原始目錄
  CACHE="$(python3 -c '
import json,sys
r=json.load(open(sys.argv[1]))["plugins"].get(sys.argv[2] + "@cch-lite") or []
print(r[0]["installPath"] if r else "")' "$REC" "$1")"
  [ -n "$CACHE" ] && [ -d "$CACHE" ] || { echo "PLUGIN_SYNC 跳過（$1 沒裝在本機）"; return; }
  # `.in_use` 是 runtime 寫進快取的佔用標記，不是內容——不排除會恆紅。
  DIFF="$(for d in hooks tools; do
            [ -d "$2/$d" ] || [ -d "$CACHE/$d" ] || continue
            diff -rq --exclude=.DS_Store --exclude=.in_use "$2/$d" "$CACHE/$d" 2>&1
          done
          [ "$(ls "$2/commands")" = "$(ls "$CACHE/commands" 2>/dev/null)" ] || \
          echo "commands/ 檔名不同：repo [$(ls "$2/commands" | tr '\n' ' ')] 快取 [$(ls "$CACHE/commands" 2>/dev/null | tr '\n' ' ')]")"
  if [ -n "$DIFF" ]; then
    echo "PLUGIN_SYNC FAIL：$1 裝著的 hook／tools／command 清單與本 repo 不一致——跑著的是舊版"
    printf '%s\n' "$DIFF" | head -20
    echo "→ bump $2/.claude-plugin/plugin.json 的 version，跑 claude plugin update $1@cch-lite，再重開 session"
    RC=1; return
  fi
  echo "PLUGIN_SYNC OK（$1：hooks/、tools/、commands/ 檔名和 $CACHE 一致）"
}
sync_one cch-lite "$ROOT"
exit $RC
