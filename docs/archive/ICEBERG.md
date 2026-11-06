# ICEBERG — 從 BACKLOG 逐出的項目

BACKLOG 滿載時整行搬進來，**不改寫**，加一字理由：
`done`（已做）／`stale`（過期）／`absorbed`（被別的改動吸收）／`deferred`（還想做，沒排到）。

**撈回規則**：只有 `deferred` 與 `stale` 可以撈回 BACKLOG，且要重寫成當下仍成立的一行。
`done` 與 `absorbed` 不撈回。

| # | 一行 | 理由 | 逐出日 |
|---|---|---|---|
| 8 | `hooks/guard-bash.mjs` 展不開變數：`rm -rf $T`（$T 在 scratchpad）被 fail-closed 誤擋 | stale | 2026-11-01 |
| 9 | `.claude/**` 被當敏感路徑擋 Edit，連 repo 層也擋，逼 agent 改用 python 寫入＝完全繞過守衛 | stale | 2026-11-01 |
| 20 | `cc-setup.md` 沒寫 `.claude/` 被 `.gitignore` 排除時怎麼辦；brag 安裝靠 agent 臨場 `git add -f` 才進版控 | stale | 2026-11-06 |
