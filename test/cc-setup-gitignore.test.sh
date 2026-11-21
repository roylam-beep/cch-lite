#!/bin/sh
# commands/cc-setup.md W4.7（標準件被 .gitignore 排除）的測試：從 markdown 抽出該程式碼區塊，在暫存 git repo 真的跑。
#   1. 只排除 .claude/settings.json
#   2. 排除整個 .claude/（目錄）
#   3. .claude/* 排除（settings 與 rules/ 都要救回）
#   4. 整個 .claude/ 被排除時，settings.local.json 仍維持被 ignore
#   5. 沒被排除 → .gitignore 不動
#   6. 救回的檔 git status 看得到、且沒用 add -f（未 staged）
#   7. cc-setup.md 不含 git add -f 當解法
set -e
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✔ $1"; }
bad() { echo "  ✘ $1"; FAIL=1; }
CMD="$(awk '/^ *```/{if(inb){inb=0; if(has) printf "%s",buf; buf="";has=0} else inb=1; next} inb{buf=buf $0 "\n"; if($0 ~ /# W4\.7/) has=1}' "$ROOT/commands/cc-setup.md")"
[ -n "$CMD" ] || { echo "  ✘ cc-setup.md 找不到 W4.7 程式碼區塊"; exit 1; }

mk() {  # $1=dir $2=.gitignore 內容（空字串＝不建）
  mkdir -p "$1/.claude/rules" "$1/scripts"
  (cd "$1" && git init -q)
  echo '{}' > "$1/.claude/settings.json"; echo r > "$1/.claude/rules/implementation.md"
  echo l > "$1/.claude/settings.local.json"; echo '#' > "$1/CLAUDE.md"; echo c > "$1/scripts/check_docs.py"
  [ -z "$2" ] || printf '%s\n' "$2" > "$1/.gitignore"
}
run() { (cd "$1" && sh -c "$CMD") >"$1/.out" 2>&1; }
ignored() { (cd "$1" && git check-ignore -q "$2"); }
clean() {  # 要進版控的檔都不再被 ignore
  for f in .claude/settings.json .claude/rules/implementation.md CLAUDE.md scripts/check_docs.py; do
    ! ignored "$1" "$f" || return 1
  done
}

mk "$TMP/a" '.claude/settings.json'
ignored "$TMP/a" .claude/settings.json || bad "前置：a 應被 ignore"
run "$TMP/a" && clean "$TMP/a" && grep -q '^!/.claude/settings.json$' "$TMP/a/.gitignore" \
  && ok "只排除 settings.json → 補 ! 例外" || bad "只排除 settings.json"

mk "$TMP/b" '.claude/'
ignored "$TMP/b" .claude/settings.json || bad "前置：b 應被 ignore"
run "$TMP/b" && clean "$TMP/b" \
  && ok "排除整個 .claude/ → 檔都救回" || bad "排除整個 .claude/"

mk "$TMP/c" '.claude/*'
run "$TMP/c" && clean "$TMP/c" \
  && ok ".claude/* → settings 與 rules/ 救回" || bad ".claude/*"

ignored "$TMP/b" .claude/settings.local.json \
  && ok "整個 .claude/ 被排除後，settings.local.json 仍被 ignore" || bad "settings.local.json 被一併放出來"

mk "$TMP/d" 'node_modules/'
cp "$TMP/d/.gitignore" "$TMP/d.before"
run "$TMP/d" && cmp -s "$TMP/d.before" "$TMP/d/.gitignore" \
  && ok "沒被排除 → .gitignore 不動" || bad ".gitignore 被改了"

(cd "$TMP/b" && git status --porcelain -uall | grep -q '\.claude/settings.json') \
  && ! (cd "$TMP/b" && git diff --cached --name-only | grep -q .) \
  && ok "救回的檔 git status 看得到、沒 staged（沒用 add -f）" || bad "git status 看不到或被 staged"

grep -q 'git add -f' "$ROOT/commands/cc-setup.md" && ! grep -E 'git add -f' "$ROOT/commands/cc-setup.md" | grep -qv '不准' \
  && ok "git add -f 只以「不准」出現" || bad "cc-setup.md 把 git add -f 當解法"

[ "$FAIL" = 0 ] && echo "CC_SETUP_GITIGNORE_TEST OK（7 項）" || { echo "CC_SETUP_GITIGNORE_TEST FAIL"; exit 1; }
