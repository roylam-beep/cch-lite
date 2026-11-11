# BACKLOG — 範圍外發現，一件一行

**上限 12 條。** 滿了就由收輪整行搬 `docs/archive/ICEBERG.md` ＋一字理由
（done／stale／absorbed／deferred），不改寫。**一行 ≤120 字、編號不重複**，都由
`tools/check_docs.py` 守（清單列與表格列都算）；日期超過 30 天會印 ⚠️，收輪時照著搬（理由 `stale`）。
**安全相關的發現不准因為滿了就不記**：先搬一條最舊的去 ICEBERG 騰位，再加。

任何 session 都能直接加一行並當輪 commit——這不是收輪專屬的檔。
一行要能自己站住：**做什麼＋在哪個檔＋為什麼**，讀的人不需要回頭找對話。

| # | 一行 | 日期 |
|---|---|---|
| 22 | `README.md`「改 command 本文直接生效」不全對：同 session 已叫過的 skill 再叫仍回舊本文（cc-show 實測），原因未查 | 2026-11-11 |
| 23 | `guard-bash.mjs`：`ssh 主機 '…'` 內文照本機規則判，遠端 `rm -rf` 一律問（清遠端快取也問）；要不要放寬待使用者定 | 2026-11-11 |
| 24 | `tools/install-hooks.sh:12` 直接蓋掉 repo 原有的 pre-commit，只印一行；該先備份或拒絕覆寫 | 2026-11-11 |
| 25 | 文件過時：`plugin.json:4`／`marketplace.json:11` 仍寫「感測 hook」；`README.md:20`「七類」實為六類 | 2026-11-11 |
| 26 | `cc-setup.md:35` 的 `cp … scripts/` 在沒有 `scripts/` 的 repo 會失敗；該先 `mkdir -p scripts` | 2026-11-11 |
| 27 | repo 的 `.claude/settings.json` 有 `language`，與 `templates/README.md:22`「不放個人偏好」矛盾 | 2026-11-11 |
| 28 | `tools/check-plugin-sync.sh:10` 註解仍提已刪的 `hooks/session-start.sh` | 2026-11-11 |
| 29 | `check-plugin-sync.sh`：`installed_plugins.json` 解析失敗時印 traceback 後當成沒裝、退 0；該明講或紅 | 2026-11-11 |
