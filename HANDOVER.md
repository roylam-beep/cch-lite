基準：e4690f3 @ 2026-11-21

# HANDOVER

## ① 狀態

plugin 版本 0.7.13。11-06 後做完：plugin sync 逐層比對（#17，0.7.8）、guard-bash 三輪修補（0.7.7／0.7.9／0.7.10）、cc-gate 改成使用者說了才跑＋能審建議（0.7.11／0.7.12）、
11-21 清 BACKLOG 10 條（文件對齊、安裝與檢查工具、審查類指令收尾，0.7.13）。
未完成：`BACKLOG.md` 剩 #23、#30（都在 `guard-bash.mjs`，要使用者先定是否改用現成 shell parser，見 `docs/decisions.md` 11-11 guard-bash 條翻案條件）。
0.7.13 改了 `tools/`，本機各層安裝要 `claude plugin update` 並重開 session，`PLUGIN_SYNC` 才會綠。

## ② 工作區

- 分支：`main` 單線。查現況：`git status -sb`、`git log --oneline @{u}..HEAD`。
- 是否已 push：[需確認]。
- 本機安裝版本：[需確認]。查詢：`python3 -c 'import json,os;[print(e["scope"],e.get("projectPath",""),e["version"]) for e in json.load(open(os.path.expanduser("~/.claude/plugins/installed_plugins.json")))["plugins"]["cch-lite@cch-lite"]]'`

## ③ 下一輪 kickoff

〔2026-11-21 重寫。上一份指派的 #17 已做完，舊 kickoff 已刪。〕

```
【開工：guard-bash #23／#30——先請使用者定「是否改用現成 shell parser」與「遠端 rm -rf 要不要放寬」】
一句話背景：cch-lite 是 Claude Code plugin（cc-* skill＋guard-bash hook）；目前 0.7.13，BACKLOG 剩 2 條。
開場先跑：git rev-parse --short HEAD / git log --oneline -5 / git status --short
  本 kickoff 產生於 e4690f3；與實際不符以實際為準，並在回報點名差異。
動程式碼的輪次：開工前先跑 sh test/run-all.sh 拿基線；紅了先停、不帶病開工。
必讀：HANDOVER.md、BACKLOG.md、`docs/decisions.md` guard-bash 各條｜只做：#23、#30
完成定義：
- 指定條目修完並有對應測試；sh test/run-all.sh ALL GREEN
- 改了 hooks/ 或 tools/ 照 README bump 版本
- 做完的 BACKLOG 條目移除
不做：guard-bash 以外的檔｜約束：範圍外發現→BACKLOG.md 一行並當輪 commit
```
