#!/bin/sh
# 把 templates/hooks/ 底下的 git hook 裝進當前 repo 的 .git/hooks/。
# 用複本不用 symlink（原則 5）；已存在且內容相同就跳過；
# 內容不同則先備份成 `<名>.bak`（已有 .bak 就改 `<名>.bak.<時間戳>`，再撞就加 `.1`、`.2`…，不蓋舊備份）
# 並印出備份路徑，再覆寫。
set -e
SRC="${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}/templates/hooks"
ROOT="$(git rev-parse --show-toplevel)"
DST="$(git rev-parse --git-path hooks)"
mkdir -p "$DST"
for f in "$SRC"/*; do
  n="$(basename "$f")"
  if [ -f "$DST/$n" ] && cmp -s "$f" "$DST/$n"; then echo "= $n 已是最新"; continue; fi
  if [ -f "$DST/$n" ]; then
    B="$DST/$n.bak"
    if [ -e "$B" ]; then
      B="$DST/$n.bak.$(date +%Y%m%d%H%M%S)"; I=0; T="$B"
      while [ -e "$T" ]; do I=$((I+1)); T="$B.$I"; done; B="$T"
    fi
    cp "$DST/$n" "$B" || { echo "✘ $n 備份到 $B 失敗，不覆寫"; exit 1; }
    echo "⚠ $n 內容不同，已備份到 $B"
  fi
  rm -f "$DST/$n"  # 原本是 symlink 時換掉連結本身，不寫穿到連結指向的檔
  cp "$f" "$DST/$n" && chmod +x "$DST/$n" && echo "→ 裝上 $n"
done
echo "裝在 $DST（不進版控；真身在 $SRC）"
