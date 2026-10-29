---
description: 支線交接——把當前支線任務的執行現場寫成一份交接單，一 session 一份，不覆寫別人那份。這不是收輪，整輪收尾用 /cc-close。EN: hand over, handoff note for a side task
argument-hint: "<slug>（例：dg-audience-fix）"
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git diff:*), Bash(git rev-parse:*), Bash(git add:*), Bash(git commit:*), Bash(ls:*), Bash(grep:*), Read, Glob, Grep, Write, Edit
---

把**當前支線**的執行現場寫成一份交接單，交給下一個 session。$ARGUMENTS

## 約束

- 這不是收輪：歸檔、決策記錄、BACKLOG 排水一律不碰。整輪做完了用 `/cc-close`。
- 只作用於當前 repo，不讀寫 repo 外路徑。
- 只寫查證過的事實：hash、分支、測試結果以指令輸出為準，不確定標 `[需確認]`，沒跑的檢查寫沒跑。
- 自我完備：接手者讀不到本次對話，「如上所述」一律展開。
- 會過期的事實寫成查詢指令，不寫成結論。
- 不屬於本支線的未提交檔照原樣描述，嚴禁動。

## 輸出契約

寫 `handovers/YYYY-MM-DD-<slug>.md`；沒有 `handovers/` 才退回 `docs/archive/handovers/` 同名
（目錄不存在就建）。同名已存在且不是自己這輪寫的，加 `-2`／`-3` 後綴，不覆寫別人那份。

**前兩行逐字固定**——收輪 grep 狀態行對帳、收輪讀基準行定本輪範圍，缺行等於這條
支線從帳上消失：

```
基準：<git rev-parse --short HEAD> @ <ISO 時間>
狀態：open（YYYY-MM-DD 建立）
```

接著四節：

- **支線目標**——一句話，這條支線要交付什麼。
- **做到哪**——已完成（含怎麼驗的）／進行中（卡在什麼、從哪個 `檔案:行號` 接）。
- **工作區**——屬於本支線的未提交檔逐一列、註明綠不綠。
- **驗證狀態**——實際跑過哪些檢查、哪些沒跑。

檔尾放接手用的 kickoff（code fence）：必讀哪幾份、只做什麼、完成定義、不做什麼。
支線有 plan mode 計畫檔時，完成定義只寫計畫檔路徑，不重抄。

**接手者做完只做三件事**：①狀態行改成 `done（YYYY-MM-DD）＋一句話結果＋commit hash`
（放棄則 `abandoned＋一字理由`）②耐久知識一行進 `BACKLOG.md` ③停——不歸檔、不跑 `/cc-close`。
支線成果由主線下次收輪的「收編」吸收。

## 怎麼驗

回報只給三件事：交接檔路徑、支線一句話狀態、接手者第一步。不重貼檔案內容。

## 防什麼

支線做到一半換 session，接手者讀不到對話，只能重查一遍現場。
