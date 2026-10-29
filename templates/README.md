# templates/ — `/cch-lite:cc-setup` 安裝時複製進 repo 的骨架

**這裡是骨架的 SSOT**（原則 6：一條規則只能有一份）。`/cch-lite:cc-setup` 只複製，不重打字。
複製一律 per-repo 實體檔，**不 symlink**（原則 5）——symlink 讓「編輯本 repo」變成
「編輯所有 repo」，且斷鏈時不會報錯。

| 樣板 | 複製到 | 已存在時 |
|---|---|---|
| `CLAUDE.md` | `<repo>/CLAUDE.md` | 不動 |
| `AGENTS.md` | `<repo>/AGENTS.md` | 不動 |
| `BACKLOG.md` | `<repo>/BACKLOG.md` | 不動 |
| `handovers/README.md` | `<repo>/handovers/README.md` | 不動 |
| `docs/archive/rounds.md` | `<repo>/docs/archive/rounds.md` | 不動 |
| `docs/archive/ICEBERG.md` | `<repo>/docs/archive/ICEBERG.md` | 不動 |
| `.claude/rules/implementation.md` | 同路徑 | 不動 |
| `.claude/settings.json` | 同路徑 | 不動（見 W4.4） |
| `hooks/pre-commit` | `<repo>/.git/hooks/pre-commit` | 不動 |
| `../tools/check_docs.py` | `<repo>/scripts/check_docs.py` | 不動 |
| `.github/workflows/harness.yml` | 同路徑 | 不動（ruleset 見 W4.5） |

`.claude/settings.json` 只宣告 plugin 來源（`extraKnownMarketplaces` + `enabledPlugins`），
**不放 hook，也不放 `language` 等個人偏好**（這檔會 commit 進 repo，整個團隊都吃到）。它存在的唯一理由是
cloud session：cloud 是另一台機器，看不到你本機的帳號層，只看得到 repo 裡 commit 過的檔——沒有這張紙條，
cc-* 那幾支在 cloud 不存在。
來源寫 `github`＋`<owner>/<repo>`，由 `/cch-lite:cc-setup` 安裝時跑 `tools/marketplace-repo.sh` 從本機的
marketplace 來源推出來（fork 的人就指向自己的 fork）；**不是**本機那份的 `directory`＋絕對路徑——
絕對路徑在 cloud 必然解析失敗。推不出來就留佔位，記一筆 BACKLOG（cc-setup.md W4.6）。

`<…>` 是待填佔位。**建了空殼＝一筆待辦**：`/cch-lite:cc-setup` 收尾要明列，並寫進
`BACKLOG.md` 一行，不准靜默（cc-setup.md W4.1）。
