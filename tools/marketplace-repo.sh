#!/bin/sh
# 印出本機 cch-lite marketplace 的 GitHub 來源 `owner/repo`，給 /cch-lite:cc-setup 填進
# templates/.claude/settings.json 的 `<owner>/<repo>` 佔位。
#
# 為什麼不寫死：fork 的人裝了自己的版本，模板卻指回原作者的 repo，cloud session 就裝到別人的 plugin。
# 為什麼不直接抄本機設定：本機來源常是 `directory`＋絕對路徑（開發用，改了立刻生效），cloud 解析不到。
#
# 判法（`claude plugin marketplace list --json` 裡名字是 $1 的那筆，預設 cch-lite）：
#   github    → 直接用它的 repo
#   git       → 從 url 取 github.com/<owner>/<repo>
#   directory → 讀那個目錄的 `git remote get-url origin`，同樣取 owner/repo
# 取不到（沒有這筆、不是 GitHub、claude CLI 不在）→ 不印、exit 1，呼叫端留佔位並記 BACKLOG。
#
# CC_MARKETPLACE_JSON 只為了測試：指到一個 JSON 檔就不跑 claude CLI。
NAME="${1:-cch-lite}"
if [ -n "$CC_MARKETPLACE_JSON" ]; then
  JSON="$(cat "$CC_MARKETPLACE_JSON")" || exit 1
else
  JSON="$(claude plugin marketplace list --json 2>/dev/null)" || exit 1
fi
printf '%s' "$JSON" | node -e '
const { execFileSync } = require("node:child_process");
const name = process.argv[1];
let list;
try { list = JSON.parse(require("node:fs").readFileSync(0, "utf8")); } catch { process.exit(1); }
const m = Array.isArray(list) ? list.find((x) => x && x.name === name) : null;
if (!m) process.exit(1);
const fromUrl = (u) => (/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(String(u || "")) || [])[1];
let repo = m.source === "github" ? m.repo : m.source === "git" ? fromUrl(m.url) : null;
if (!repo && m.source === "directory" && m.path) {
  try { repo = fromUrl(execFileSync("git", ["-C", m.path, "remote", "get-url", "origin"], { encoding: "utf8" }).trim()); } catch {}
}
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) process.exit(1);
console.log(repo);
' "$NAME"
