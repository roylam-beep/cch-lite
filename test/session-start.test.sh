#!/bin/sh
# hooks/session-start.sh（開場常駐字數）的測試。四項：
#   1. 未超標 → 印合計與上限，exit 0
#   2. 超標 → 多印 ⚠️，仍 exit 0（SessionStart 炸掉會弄壞每個 session 的開場）
#   3. 算的是字元不是位元組（中文差三倍）
#   4. 設了 CLAUDE_CONFIG_DIR → 改讀那裡
#
# 手法：把 HOME 指到臨時目錄，不必為了測試在正式碼開後門。
set -e
unset CLAUDE_CONFIG_DIR   # 使用者環境若有設，前三項會讀錯地方
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()   { echo "  ✔ $1"; }
bad()  { echo "  ✘ $1"; FAIL=1; }
rep() { python3 -c "import sys; sys.stdout.write('規則'*int(sys.argv[1]))" "$1"; }
run() { HOME="$TMP/home" CLAUDE_PROJECT_DIR="$REPO" sh "$ROOT/hooks/session-start.sh"; }

REPO="$TMP/repo"; mkdir -p "$REPO"
SLUG="$(printf '%s' "$REPO" | sed 's/[^A-Za-z0-9]/-/g')"
mkdir -p "$TMP/home/.claude/projects/$SLUG/memory"

# ── 1. 未超標 ──
rep 500 > "$TMP/home/.claude/CLAUDE.md"          # 1,000 字
rep 100 > "$REPO/AGENTS.md"                      #   200 字
rep 50  > "$TMP/home/.claude/projects/$SLUG/memory/MEMORY.md"  # 100 字 → 合計 1,300
OUT="$(run)" && echo "$OUT" | grep -q "＝ 1300 字元／6500" \
  && ok "未超標：印 1300／6500" || bad "未超標：$OUT"

# ── 2. 超標 → 只警告 ──
rep 3200 > "$TMP/home/.claude/CLAUDE.md"          # 6,400 字 → 合計 6,700
OUT="$(run)"; RC=$?
[ "$RC" -eq 0 ] && echo "$OUT" | grep -q "＝ 6700 字元 ⚠️ 超過上限 6500" \
  && ok "超標：印 ⚠️、exit 0" || bad "超標：rc=$RC / $OUT"

# ── 3. 字元不是位元組 ──
echo "$OUT" | grep -q "帳號 CLAUDE.md 6400 " \
  && ok "中文按字元算（6400，不是 19200）" || bad "算成位元組：$OUT"

# ── 4. CLAUDE_CONFIG_DIR ──
mkdir -p "$TMP/cfg/projects/$SLUG/memory"
rep 10 > "$TMP/cfg/CLAUDE.md"; rep 5 > "$TMP/cfg/projects/$SLUG/memory/MEMORY.md"   # 20＋200＋10
OUT="$(CLAUDE_CONFIG_DIR="$TMP/cfg" run)"
echo "$OUT" | grep -q "＝ 230 字元" \
  && ok "CLAUDE_CONFIG_DIR：改讀那裡（230）" || bad "CLAUDE_CONFIG_DIR 沒生效：$OUT"

[ "$FAIL" -eq 0 ] && echo "SESSION_START OK（4 項全過）" && exit 0
echo "SESSION_START FAIL"; exit 1
