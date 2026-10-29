#!/bin/sh
# SessionStart hook：開場印一行本 session 的常駐載入字元數，不印別的。
#
# 為什麼只有一行：SessionStart 的 stdout 會被注入 session context，每個 session 都付這個
# 成本。這支刻意不做 git 對帳（那是 repo 自己的 session-start，兩支可並存、內容不重疊）。
#
# 印什麼：帳號 CLAUDE.md（`$CLAUDE_CONFIG_DIR`，沒設＝`~/.claude`）＋ repo AGENTS.md（沒有才看 CLAUDE.md）＋ MEMORY.md 的字元數。
# 上限 6,500 的推導見 docs/decisions.md（2026-09-04 P6）。超標只多印 ⚠️，不擋。
#
# **恆 exit 0**：SessionStart 炸掉會弄壞每個 session 的開場，比印不出東西糟得多。
#
# 防什麼：常駐檔慢慢長胖，context 與壓縮品質一起變差，卻沒人看得到數字。

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
PROJ_DIR="$CFG/projects/$(printf '%s' "$ROOT" | sed 's/[^A-Za-z0-9]/-/g')"

# wc -m 算字元不是位元組——規則本文是中文，位元組會虛報三倍。
# locale 不存在時 wc -m 會靜默退回位元組（cloud container 只有 C.UTF-8，沒有 en_US.UTF-8），
# 所以先挑一個實測「規則」＝2 字元的 locale；一個都沒有就不印數字，不印錯的數字。
U8=""
for L in C.UTF-8 en_US.UTF-8 UTF-8; do
  if [ "$(printf '規則' | LC_ALL=$L wc -m 2>/dev/null | tr -d ' ')" = 2 ]; then U8=$L; break; fi
done
if [ -z "$U8" ]; then
  echo "本 session 常駐載入：讀不到（沒有可用的 UTF-8 locale，wc -m 會算成位元組）"
  exit 0
fi
chars() { [ -f "$1" ] && LC_ALL=$U8 wc -m < "$1" | tr -d ' ' || echo 0; }

A="$(chars "$CFG/CLAUDE.md")"
if [ -f "$ROOT/AGENTS.md" ]; then B_NAME="AGENTS.md"; else B_NAME="CLAUDE.md"; fi
B="$(chars "$ROOT/$B_NAME")"
C="$(chars "$PROJ_DIR/memory/MEMORY.md")"
T=$((A + B + C)); BUDGET=6500
[ "$T" -gt "$BUDGET" ] && W=" ⚠️ 超過上限 ${BUDGET}" || W="／${BUDGET}"
echo "本 session 常駐載入：帳號 CLAUDE.md ${A} ＋ repo ${B_NAME} ${B} ＋ MEMORY.md ${C} ＝ ${T} 字元${W}"

exit 0
