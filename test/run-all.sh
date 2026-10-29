#!/bin/sh
# 本 repo 的快閘（commit 前跑這支）。任何一項紅就整支紅。
# 內容：plugin manifest 嚴格驗證、文件／死指標閘（含英文別名與可設定清單）、開場常駐字數、skill 契約、pre-commit、guard-bash 與計畫核准提醒的單元測試。
set -e
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"
echo "── claude plugin validate --strict ──"
# 兩份 manifest 都要逐檔驗。`validate .` 在兩者都存在時只驗 marketplace，plugin.json 會被跳過。
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin validate .claude-plugin/marketplace.json --strict
echo "── plugin loads ──"
sh tools/check-plugin-loads.sh
echo "── plugin sync ──"
sh tools/check-plugin-sync.sh
echo "── check_docs ──"
python3 tools/check_docs.py .
echo "── session-start ──"
sh test/session-start.test.sh
echo "── check_docs 別名與設定 ──"
sh test/check-docs-config.test.sh
echo "── test_skills ──"
python3 test/test_skills.py
echo "── pre-commit ──"
sh test/pre-commit.test.sh
echo "── harness workflow ──"
sh test/harness-workflow.test.sh
echo "── marketplace-repo ──"
sh test/marketplace-repo.test.sh | tail -1
sh test/marketplace-repo.test.sh >/dev/null
echo "── guard-bash ──"
out=$(node test/guard-bash.test.mjs 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -E "(tests|pass|fail) [0-9]"
echo "── plan-approved ──"
# 管線退出碼取最後一段（sh 沒 pipefail），先存輸出再判退出碼，紅了才不會被 grep 吞掉。
out=$(node test/plan-approved.test.mjs 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -E "(tests|pass|fail) [0-9]"
echo "ALL GREEN"
