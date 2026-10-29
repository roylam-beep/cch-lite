#!/bin/sh
# tools/marketplace-repo.sh：從本機 marketplace 來源推出 owner/repo（填 templates/.claude/settings.json 用）。
# 防什麼：推錯就把下游 repo 的 cloud session 指到別人的 plugin；推不出來要明確失敗，不能印半截字串。
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✔ $1"; else echo "  ✘ $1：得到「$2」，要「$3」"; FAIL=1; fi; }
mkdir -p "$TMP/dev" && git -C "$TMP/dev" init -q && git -C "$TMP/dev" remote add origin git@github.com:someone/my-fork.git
git -C "$TMP" init -q nogh && git -C "$TMP/nogh" remote add origin https://gitlab.com/a/b.git
cat > "$TMP/m.json" <<JSON
[{"name":"gh","source":"github","repo":"alice/cch-lite"},
 {"name":"giturl","source":"git","url":"https://github.com/bob/cch-lite.git"},
 {"name":"dev","source":"directory","path":"$TMP/dev"},
 {"name":"nogh","source":"directory","path":"$TMP/nogh"}]
JSON
run() { CC_MARKETPLACE_JSON="$TMP/m.json" sh "$ROOT/tools/marketplace-repo.sh" "$1"; echo "rc=$?"; }
check "github 來源直接用 repo" "$(run gh | tr '\n' ' ')" "alice/cch-lite rc=0 "
check "git url 取 owner/repo" "$(run giturl | tr '\n' ' ')" "bob/cch-lite rc=0 "
check "directory 讀 origin（ssh 寫法）" "$(run dev | tr '\n' ' ')" "someone/my-fork rc=0 "
check "origin 不是 GitHub → exit 1、不印" "$(run nogh | tr '\n' ' ')" "rc=1 "
check "沒有這筆 → exit 1" "$(run missing | tr '\n' ' ')" "rc=1 "
[ "$FAIL" -eq 0 ] && echo "MARKETPLACE_REPO OK（5 項）" || { echo "MARKETPLACE_REPO FAIL"; exit 1; }
