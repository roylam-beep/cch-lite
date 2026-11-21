# BACKLOG — 範圍外發現，一件一行

**上限 12 條。** 滿了就由收輪整行搬 `docs/archive/ICEBERG.md` ＋一字理由
（done／stale／absorbed／deferred），不改寫。**一行 ≤120 字、編號不重複**，都由
`tools/check_docs.py` 守（清單列與表格列都算）；日期超過 30 天會印 ⚠️，收輪時照著搬（理由 `stale`）。
**安全相關的發現不准因為滿了就不記**：先搬一條最舊的去 ICEBERG 騰位，再加。

任何 session 都能直接加一行並當輪 commit——這不是收輪專屬的檔。
一行要能自己站住：**做什麼＋在哪個檔＋為什麼**，讀的人不需要回頭找對話。

| # | 一行 | 日期 |
|---|---|---|
| 23 | `guard-bash.mjs`：`ssh 主機 '…'` 內文照本機規則判，遠端 `rm -rf` 一律問（清遠端快取也問）；要不要放寬待使用者定 | 2026-11-11 |
| 30 | `guard-bash.mjs` 仍放行：旗標放變數（`F=-rf; rm $F x`）、`{a,/x}` 大括號、`ssh h <<EOF` 內文、`$SSH` 沒在同條指令設值 | 2026-11-11 |
| 34 | 實測：帳號層從資料夾讀（重開或 /reload-plugins 生效），專案層走 GitHub 快取要 update；README 生效表、check-plugin-sync 照此重寫 | 2026-11-21 |
