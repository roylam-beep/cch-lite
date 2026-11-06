# rounds — 每輪做完了什麼，一輪一段，新的在上

歷史落點。**只寫已發生的事**：改了什麼、驗了什麼、綠或紅、沒跑就寫沒跑。
待辦不寫這裡（那是 `BACKLOG.md`），未完成的交接不寫這裡（那是 `handovers/`）。

## 2026-11-06｜hook 精簡＋cc-trim 改名＋cc-skillcheck 去外部依賴（`5bf6ed8..` 0.7.1）

- `c40c7ee` 刪 `hooks/session-start.sh`、`hooks/plan-approved.mjs` 與測試；`guard-bash.mjs` 命中改印 `permissionDecision: "ask"`、exit 0。
- `63a4d88` `/cc-audit` → `/cc-trim`（`/cc-root` 定案，見 `docs/decisions.md` 〈skill 家族成員〉2026-11-06）。
- `e488624` `cc-skillcheck` 拿掉 SkillEvaluator／uvx 機器打分段，個資改 Grep＋讀檔兩步（另一 session 的 `/cc-root`，使用者在該 session 說「執行」）。
- 驗證：`main` 上 `sh test/run-all.sh` ALL GREEN（含 plugin sync）；已 push `5bf6ed8..e488624`。本機帳號層、`meta-ads` 專案層、本 repo 專案層三份安裝都更新到 0.7.1。
- 檢討：
  - A `claude plugin update` 不帶 `--scope` 只更新當前目錄的專案層 → README〈改了 command 就生效〉表格。
  - C zsh 把行首 `=word` 當指令路徑展開（`echo =====` 報 not found）；BSD `grep -o` 在逐字稿長行上抓不到，改用 `python3 -I` 解析。
  - C 逐字稿只數 `<command-name>` 會漏掉經 Skill 工具叫起的次數（`cc-skillcheck` 分析時發現）。

教訓升格：A 1／B 0／C 2｜退格 1
