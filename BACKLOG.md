# BACKLOG — 範圍外發現，一件一行

**上限 12 條。** 滿了就由收輪整行搬 `docs/archive/ICEBERG.md` ＋一字理由
（done／stale／absorbed／deferred），不改寫。**一行 ≤120 字、編號不重複**，都由
`tools/check_docs.py` 守（清單列與表格列都算）；日期超過 30 天會印 ⚠️，收輪時照著搬（理由 `stale`）。
**安全相關的發現不准因為滿了就不記**：先搬一條最舊的去 ICEBERG 騰位，再加。

任何 session 都能直接加一行並當輪 commit——這不是收輪專屬的檔。
一行要能自己站住：**做什麼＋在哪個檔＋為什麼**，讀的人不需要回頭找對話。

| # | 一行 | 日期 |
|---|---|---|
| 8 | `hooks/guard-bash.mjs` 展不開變數：`rm -rf $T`（$T 在 scratchpad）被 fail-closed 誤擋 | 2026-09-04 |
| 9 | `.claude/**` 被當敏感路徑擋 Edit，連 repo 層也擋，逼 agent 改用 python 寫入＝完全繞過守衛 | 2026-09-04 |
| 17 | 本 repo 的 project-scope 安裝 0.3.4 蓋過 user 0.4.3，hook 跑舊版；`check-plugin-sync.sh` 只比 user→假綠 | 2026-09-28 |
| 20 | `cc-setup.md` 沒寫 `.claude/` 被 `.gitignore` 排除時怎麼辦；brag 安裝靠 agent 臨場 `git add -f` 才進版控 | 2026-10-04 |
