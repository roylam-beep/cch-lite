# cch-lite

Claude Code 專用的**輕量**開發治理層（harness）：skill 家族、hook、閘、安裝器，包成一個 plugin。
開發、SEO、行銷 repo 通用；流程要快，多留空間給模型自己發揮。
目標一句話：**任何 repo 裝上它，開發流程長得一樣，而且每條規則都說得出它防的是哪個失敗。**

前身是 `roylam-beep/cc-harness`（凍結在 0.5.2，歷史與 review 都留在那裡）。2026-10-29 拆出：
不帶規格總表與工單層，規劃用 Claude Code 內建 plan mode，驗收照 plan 在背景跑。
派工另成獨立的 `roylam-beep/rr-dispatcher`，兩者互不相關。

## 目錄

```
.claude-plugin/plugin.json      plugin 宣告（version 是快取的 key，見「改了要 bump」）
.claude-plugin/marketplace.json marketplace 宣告（GitHub 或本機目錄都從這裡裝）
commands/cc-*.md                skill 家族（**唯一一份**，帳號層已清空）
hooks/hooks.json                plugin 掛哪些 hook 以這檔為準
hooks/guard-bash.mjs            PreToolUse(Bash) 不可逆指令與遠端寫入跳確認框，使用者按允許才跑（fail open）
templates/                      /cch-lite:cc-setup 安裝進 repo 的骨架（複製，不 symlink）
tools/check_docs.py             文件水位與死指標六類判定（pre-commit 掛這支）
tools/install-hooks.sh          把 templates/hooks/ 裝進當前 repo 的 .git/hooks/
tools/check-plugin-loads.sh     plugin 真的載入了嗎（validate 驗不出載入期錯誤）
tools/check-plugin-sync.sh      跑著的 hook 是不是當前版本
test/run-all.sh                 本 repo 的整包閘
docs/decisions.md
```

## 安裝（別的機器、別人）

```bash
claude plugin marketplace add roylam-beep/cch-lite
claude plugin install cch-lite@cch-lite
```

裝完重開 session，在要用的 repo 打 `/cch-lite:cc-setup` 鋪骨架。前提：

- macOS 或 Linux（hook 用 POSIX `sh`），PATH 上有 `node`、`git`、`python3`（沒有 `python3` 時 pre-commit 會放行，CI 照跑）。
- 只支援 GitHub：CI 範本用 `gh` 或 GitHub MCP。
- 設了 `CLAUDE_CONFIG_DIR` 的話，hook 與 `check_docs.py` 會改讀那個目錄。

## 怎麼跑

```bash
sh test/run-all.sh                                  # 整包閘（push 前）
python3 tools/check_docs.py .                       # 快閘（已裝成 pre-commit）
sh tools/install-hooks.sh                           # 裝 git hook
```

## 改了 command 通常就生效；改了 hook 要 bump

同一個 plugin 兩種行為（實測，見 `docs/decisions.md`）：

| 改了什麼 | 怎麼生效 |
|---|---|
| `commands/`、`templates/` 的本文 | 通常下一次呼叫就生效；同 session 已叫過的 skill 再叫仍可能是舊本文（2026-11-21 改完 cc-gate 後同 session 第一次叫也是舊的，原因未查）。要保證就重開 session |
| `commands/` **新增或刪除檔** | 同 hook：要 bump（清單從快取列，實測 2026-09-23） |
| `hooks/`、`tools/` | 見下方兩層：帳號層重開 session 或 `/reload-plugins`；專案層要先 push → `claude plugin update --scope project` → 重開 session |

兩層來源不同（2026-11-21 實測 `claude plugin update`）：

| 層 | marketplace 來源 | 怎麼生效 |
|---|---|---|
| 帳號層 | `known_marketplaces.json` 記 `directory`＝本機資料夾 | 改完存檔即可；重開 session 或打 `/reload-plugins`。`claude plugin update … --scope user` 第一次印「updated from 0.7.11 to 0.7.14」，第二次印「read from its folder … nothing to update. Edits there take effect at the next session start or /reload-plugins」 |
| 專案層 | 該專案 `.claude/settings.json` 的 `extraKnownMarketplaces` 指向 GitHub `roylam-beep/cch-lite` | **先 push**，再在該專案目錄跑 `claude plugin update cch-lite@cch-lite --scope project`（印「updated from 0.7.11 to 0.7.14 … Restart to apply changes」），再重開 session。沒 push，這層拿到的還是舊的 |

原因：帳號層的 marketplace 是資料夾，plugin 直接讀它；專案層的 marketplace 是 GitHub，只會抓下來的副本，不看本機資料夾。
更早的實測（2026-09～11）曾記成「hook 走 `~/.claude/plugins/cache/…/<version>/` 複本、版本在 session 開始時釘住」，
那是專案層（或當時帳號層）的行為；**帳號層現在是否仍讀快取，與下面的紀錄互相矛盾，[需確認]**：
`installed_plugins.json` 的帳號層 `installPath` 指向 `cache/cch-lite/cch-lite/0.7.14`，
但 `plugin update` 說它讀資料夾。`sh tools/check-plugin-sync.sh` 仍照 `installPath` 逐筆比對，哪一層的複本跟 repo 不一致就紅，並印出該跑的那一行。
在本 repo 目錄裡不帶 `--scope` 只會更新專案層那份（`.claude/settings.json` 有啟用），帳號層不會動（實測 2026-11-06）。
專案層的 GitHub 副本實際放在哪、`installPath` 是否就是它：[需確認]（`~/.claude/plugins/marketplaces/` 底下沒有 cch-lite）。

## 規矩（本 repo 自己的，四條）

1. 不放憑證、真實帳號 ID、客戶名。
   所以本 repo **可以有 remote**——這是它跟 `~/.claude` 最大的差別。
2. 每支 skill、每道 gate、每條規則進來時寫一節 `## 防什麼`：一句話講它防的失敗。
   說不出來就不進。
   次數只當線索：看的是抓到什麼、使用者下一句，不單看叫了幾次——叫了幾次不等於有沒有用（`docs/decisions.md`）。
3. **欄位語意一律實測，不照文件或名稱推。** frontmatter 欄位、設定鍵、hook 事件，
   要先有一次可重現的實測（headless 跑一遍，或從 binary 讀出程式路徑）才准寫進規則。
   反例：`allowed-tools` 名字像白名單、官方 schema 也寫「Tools available to the model」，
   實測卻完全不收斂工具——照名字推就會做出一個假的閘。
4. **計畫先寫死新增行數上限，超過就停下來砍。** review-loop 沒設上限膨脹到 +2,534 行整條作廢；
   重做設 180 行，實際 +126（`docs/decisions.md` 2026-09-27）。

## 版控

`main` 單線，remote 是 `roylam-beep/cch-lite`（public）。
push 一律當輪問使用者，不延續上一輪的授權。
