# BACKLOG — 範圍外發現，一件一行

**上限 12 條。** 滿了就由收輪整行搬 `docs/archive/ICEBERG.md` ＋一字理由
（done／stale／absorbed／deferred），不改寫。**一行 ≤120 字、編號不重複**，都由
`tools/check_docs.py` 守（清單列與表格列都算）；日期超過 30 天會印 ⚠️，收輪時照著搬（理由 `stale`）。
**安全相關的發現不准因為滿了就不記**：先搬一條最舊的去 ICEBERG 騰位，再加。

任何 session 都能直接加一行並當輪 commit——這不是收輪專屬的檔。
一行要能自己站住：**做什麼＋在哪個檔＋為什麼**，讀的人不需要回頭找對話。

| # | 一行 | 日期 |
|---|---|---|
| 34 | check-plugin-sync：帳號層 installPath 指快取、update 卻說讀資料夾；查清後改比對邏輯與 FIX 提示（README 已標[需確認]） | 2026-11-21 |
| 35 | guard-bash：`rm $X /x` 的 `$X` 來自環境（同條指令沒設）照放行，可能是 -rf；要不要改成問待使用者定 | 2026-11-21 |
