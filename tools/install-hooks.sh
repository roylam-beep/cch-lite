#!/bin/sh
# 把 templates/hooks/ 底下的 git hook 裝進當前 repo 的 .git/hooks/。
# 用複本不用 symlink（原則 5）；已存在且內容相同就跳過，不同則覆寫並印出來。
set -e
SRC="${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}/templates/hooks"
ROOT="$(git rev-parse --show-toplevel)"
DST="$(git rev-parse --git-path hooks)"
mkdir -p "$DST"
for f in "$SRC"/*; do
  n="$(basename "$f")"
  if [ -f "$DST/$n" ] && cmp -s "$f" "$DST/$n"; then echo "= $n 已是最新"; continue; fi
  cp "$f" "$DST/$n" && chmod +x "$DST/$n" && echo "→ 裝上 $n"
done
echo "裝在 $DST（不進版控；真身在 $SRC）"
