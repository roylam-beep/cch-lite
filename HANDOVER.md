基準：ed4256b @ 2026-11-06T23:09:54+0800

# HANDOVER

## ① 狀態

本輪做完：hook 精簡、`/cc-audit` 改名 `/cc-trim`、`cc-skillcheck` 去外部依賴，已合進 `main`。收輪 commit 未 push（見②）。
未完成：`/cc-trim` 退格回報的一條 ritual 待使用者決定——`docs/decisions.md:14` 的括注與同檔〈hook 精簡（2026-11-06）〉節重講同一件事。
下一輪從 `BACKLOG.md` #17 接。

## ② 工作區

- 分支：`main` 單線。查現況：`git status -sb`、`git log --oneline @{u}..HEAD`。
- 本交接單寫入時：收輪的兩個 commit（歸檔與本檔）在本機，未 push。
- 本機安裝：帳號層與專案層（本 repo、`meta-ads`）都是 0.7.1。查詢：`python3 -c 'import json,os;[print(e["scope"],e.get("projectPath",""),e["version"]) for e in json.load(open(os.path.expanduser("~/.claude/plugins/installed_plugins.json")))["plugins"]["cch-lite@cch-lite"]]'`

## ③ 下一輪 kickoff

```
【開工：修 BACKLOG #17——plugin sync 檢查要比對每一層安裝】一句話背景：cch-lite 是 Claude Code plugin（cc-* skill＋guard-bash hook）；上輪收在 0.7.1，hook 精簡、cc-trim 改名已上 main。
開場先跑：git rev-parse --short HEAD / git log --oneline origin/HEAD -1 / git status --short
  本 kickoff 產生於 ed4256b 之後；與實際不符以實際為準，並在回報點名差異。
動程式碼的輪次：開工前先跑 sh test/run-all.sh 拿基線；紅了先停、不帶病開工。
必讀：HANDOVER.md、BACKLOG.md、tools/check-plugin-sync.sh｜只做：BACKLOG #17
完成定義：
- tools/check-plugin-sync.sh 逐一比對 installed_plugins.json 裡 cch-lite@cch-lite 的每一筆安裝（帳號層＋各專案層），任一份與 repo 不一致就紅並印出哪一層、哪個專案路徑
- 專案路徑已不存在的那筆安裝只印提示、不紅
- 有一條測試證明「帳號層一致、某專案層舊版」會紅
- sh test/run-all.sh ALL GREEN；改了 tools/ 照 README bump 版本
- BACKLOG #17 移除（做完）
不做：拿掉其他 repo 的 .claude/settings.json 專案層啟用（已否決：雲端 clone 靠它自動裝 plugin）｜約束：範圍外發現→BACKLOG.md 一行並當輪 commit
```
