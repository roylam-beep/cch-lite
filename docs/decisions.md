# decisions — 已拍板的事，一條一行，不敘述過程

只記「現在是什麼」與「什麼情況會翻案」。過程與理由留在對應的 commit 訊息與 `docs/plans/`。

## 拆出 cch-lite（2026-10-29）

- **2026-10-29**｜**`roylam-beep/cc-harness` 凍結在 0.5.2；輕量版另開 `roylam-beep/cch-lite`（repo 與 plugin 同名，0.6.0 起，乾淨歷史）**，使用者經 `/cc-grill` 定案。
  定位：輕量、多用途（開發／SEO／行銷），流程要快，多留空間給模型發揮。舊 repo 的歷史、review、計畫、交接單都留在舊 repo。
  - **不帶規格總表與工單層**：`SPEC.md`、`spec_merge.py`、`docs/changes/`、`--apply` 全部不進本 repo。
    根因（`/cc-root`）：情境不綁測試、合併只驗格式，`SPEC.md` 會說謊且沒人發現（舊 repo 12 個情境 0 個被測試引用）。
    工單格式跟著派工搬去獨立的 `roylam-beep/rr-dispatcher`，兩個 plugin 互不相關、不互相引用。
  - **規劃用 Claude Code 內建 plan mode 的計畫檔**，不另訂格式、不強制「做完的樣子」節。
  - **驗收（`/cc-gate`）照計畫檔驗**：驗收員自己從計畫抽 3–7 條完成條件再逐條實跑；預設背景子 agent、`sonnet`、不擋使用者，只回報不改檔。
    計畫核准時由 `hooks/plan-approved.mjs`（PostToolUse `ExitPlanMode`）提醒派驗收——只是提醒，模型仍可能忘。
  - 安裝 skill 改名 `cc-harness` → `cc-setup`（避免 `/cch-lite:cc-harness` 這種混名）。
  - 帳號層改裝 cch-lite；已裝舊 cc-harness 的 repo 不動，兩套並存由使用者逐個換。
  **翻案條件**：背景驗收連續 5 次沒被派（計畫核准後無驗收結果）→ 提醒無效，重議觸發方式；或 3 次以上「計畫寫得太散，驗收員抽不出條件」→ 重議強制完成條件節。

## harness 感測與量測

- **2026-09-24**｜**拆掉 skill 使用量層**，使用者定案。拆：`tools/skill-usage.py`、`hooks/log-harness-event.mjs`
  與它掛的三個 hook（UserPromptExpansion／InstructionsLoaded／PreToolUse(Skill)）、SessionStart 第 1 行、
  `harness.log` 的 append、各 command 的使用次數型死法、README 規矩 3（`ALIASES` 改名接回）。
  理由：①只量「有沒有被叫」，不量「有沒有用」；②實績上沒有一條日期型死法真的觸發過退役，P3 A/B 未判即作廢；
  ③cloud 為主力後 container 用完回收，逐字稿跟著消失，要量還得多一套 commit 流程。
  **留下**兩個量品質／信任的數字：常駐字元預算（`check_docs.py` 第 7 類＋SessionStart 那行）、
  `cc-close` 的 `PR 合併 a／退回 b｜gate 缺陷 c`。
  **取代**：每支 command 寫 `## 防什麼`（`test/test_skills.py` 守）；去留見下一條。
- **2026-10-04**｜**拆掉「退役訊號」**，使用者定案：`commands/cc-*.md`、`tools/`、`test/test_skills.py`、`templates/README.md` 檔頭的退役訊號一律刪，
  README 規矩 2 只留 `## 防什麼`。
  理由：首次照字面判就誤觸——`/cc-dispatch` 與驗收的訊號數本 repo 沒用派工器的 change，唯一真派的 `ads-cr-system` 兩樣都有。
  去留改由 `/cc-audit` 審肥肉，不再預寫觸發條件；2026-10-16 起由 `/cc-close` 每輪派（見〈skill 家族成員〉）。
- **2026-09-03**｜`~/.claude/settings.json` **不每輪重插** `UserPromptSubmit` echo（官方指引：每輪重插是舊模型的 retention crutch）。
  原訂 09-10 的 A/B 判定沒做，至今沒加回。**翻案條件**：冰山憲法遵守度明顯變差。
- **2026-09-24**｜`hooks/session-start.sh` 的 `wc -m` 改成先挑實測可用的 UTF-8 locale。
  原本寫死 `LC_ALL=en_US.UTF-8`，cloud container 沒有這個 locale，`wc -m` 靜默退回位元組，
  印出的常駐字元虛報三倍（7,962 對 `check_docs.py` 的 2,654）；`test/check-docs-resident.test.sh` 第 4 項抓到。
  一個可用 locale 都沒有時印「讀不到」，不印錯的數字。

- **2026-09-22**｜〔2026-10-29 起不適用本 repo：spec 層整層移出，見〈拆出 cch-lite〉〕**spec 層**採 OpenSpec 格式子集（`## ADDED／MODIFIED／REMOVED Requirements`、
  `#### Scenario:` ＋ WHEN／THEN、`## 不做`），**不裝其 CLI**、不做 stores、不做 RENAMED、不做 proposal／design。
  主 spec ＝ repo 根單檔 `SPEC.md`（`check_docs.py` 既有的 20,000 字預算），滿了再拆 `docs/specs/`。
  合併由 `tools/spec_merge.py` 做（REMOVED→MODIFIED→ADDED，MODIFIED 縮水即紅）；change 資料夾由 `cc-close` ③ 建，不加新 skill。
  **一條 task ＝ 一個 PR ＝ 最小可獨立變綠的變更**，執行 agent 不改 `tasks.md`，勾依 merged PR 補。
  **新判定不再進 `check_docs.py`**（284/285 行）：各自單檔、pre-commit 迴圈逐支跑。
  Loop engine（派工器、PR 合併／退回計數、`## 學到的` 撈回）**整包下一輪**，等第一個 change 不靠 loop engine、由 LLM 逐步跑通再蓋。
  **死法**：連續 6 輪 `rounds.md` 的「changes 歸檔 N」不變 → 刪 `spec_merge.py` 與 `docs/changes/`；
  第二條死法（歸檔 ≥3 且 SPEC.md 從沒刪過 Requirement）**2026-10-16 成立並執行**：本 repo 的 skill 行為 Requirement 全數拿掉，
  `SPEC.md` 只記工具行為，改 `commands/*.md` 不開 change；`spec_merge.py` 與 `docs/changes/` 留著，被安裝的 repo 照用。
- **2026-09-17**｜`guard-bash.mjs` 有**總開關** `CC_GUARD_BASH=off`（設在
  `~/.claude/settings.json` 的 `env`，重開 session 生效）｜使用者決定：這支已因誤擋被放寬三次，
  逐條追趕追不完，而誤擋現場沒有出口時，agent 會改用 python 寫檔之類的手段**完全繞過守衛**
  （BACKLOG 9 就是這個現象），那比一個明確、可稽核的開關更糟。
  **只有使用者按得動**：讀 hook 進程自己的 `process.env`，agent 在 Bash 指令前面塞
  `CC_GUARD_BASH=off <指令>` 是設在它的子 shell，本進程讀不到。
  同日一併放寬三條誤擋：`git push --delete`（刪遠端分支，跟 force push 是兩件事）、
  `git branch -d`（git 自己就會拒絕未合併的，`-D` 照擋）、`git clean -fdX`（只刪被
  `.gitignore` 忽略的檔，`-x` 照擋）。`git reset --hard` **不放寬**——沒有可靠的判斷依據
  （clean tree 也擋不住 `--hard HEAD~3` 丟 commit），交給總開關。
  **死法**：開關被設成 `off` 常駐超過 30 天＝這支 hook 沒人要，整支拆掉；
  或任一次因為開關開著而真的丟了資料，改成單次授權制（一次放行一條指令）。
- **2026-09-16**｜四支寫入型 skill（`cc-close`／`cc-gate`／`cc-handover`／`cc-harness`）**解除
  `disable-model-invocation: true`**｜使用者決定：硬擋連「使用者在對話裡說收輪」都擋，agent 只能
  請使用者改打 `/cc-harness:cc-close` 全名，太卡。自派的防線改由被安裝 repo 的 `AGENTS.md`
  「`/cc-close`／`/cc-gate`／`/cc-handover` 使用者叫才跑」承擔；`test_skills.py` 的
  `check_side_effect_grade` 對寫入型不再斷言該欄位（斷言註解保留，可一鍵恢復）。
  **死法**：任一寫入型 skill 再出現「使用者沒叫、agent 自派」產出孤兒檔 ≥2 次，把欄位與斷言加回。
  **2026-10-16 例外**：`/cc-gate` 改成 agent 該自派（見〈skill 家族成員〉同日條）；自派模式不寫檔，不會產孤兒檔。
- **2026-09-03**｜`UserPromptExpansion` hook 事件**存在且 payload 帶 skill 名**。
  實測自 Claude Code 2.1.259 的 `HOOK_EVENT_REGISTRY`（`strings` 抽二進位檔）：
  summary 是「When a user-typed slash command expands into a prompt」，欄位
  `expansion_type`／`command_name`／`command_args`／`command_source`／`prompt`，
  matcher 比對 `command_name`。**所以不必退回只用 `PreToolUse` 記。**
  計畫 P1 那條 `[需確認]` 由此結案。
- **2026-09-03**｜`InstructionsLoaded` 事件存在，欄位 `file_path`／
  `memory_type`(User\|Project\|Local\|Managed)／`load_reason`(session_start\|
  nested_traversal\|path_glob_match\|include\|compact)／`globs?`／`trigger_file_path?`／
  `parent_file_path?`，每載入一個指令檔觸發一次。P6 的常駐總量分子直接從它取，
  不必自己加字元。
- **2026-10-29**｜**歷史文件清理**（工單 harness-slim-split 2.3）：刪 10 份交接單（8 份已 closed／done／superseded；
  `r5-p6` 的 gate 積壓與 P3 A/B 已被 10-16～10-20 的 gate 改制與 A/B 作廢取代；`cloud-env-effort` 的 `/cc-cloud-env` 10-18 已刪、主線在 BACKLOG #15）。
  留 6 份仍有未驗項的 open 交接單。已完成的計畫 `harness-optimize`、`loop-engine` 與目標已移除的 `cursor-guard-userlevel-kickoff`
  搬 `docs/archive/plans/`；`cloud-orchestrator`（R3–R4 未開始）留在 `docs/plans/`。`docs/ab/` 刪。
- **2026-10-29**｜**`hooks/guard-bash.mjs` 檔頭拿掉歷史**（工單 harness-slim-split 2.1）：只留現在擋什麼、放什麼；負向驗證清單刪（與測試重複）。
  搬出來的由來：前景 `wait-for-run.js` 那類 2026-09-23 加（近 30 天 4 次「Command timed out after 10m」全是它）；
  push gate 那類 2026-10-20 移除（`git show 4f5bacd`）；遠端寫入 2026-10-26 加，同日收窄拿掉 `scp`、`rm -r/-f`、`mysql … <`、`wp db query`
  （日常上傳圖片每張跳兩次確認，使用者因此把整支 guard 關掉），出處 `docs/reviews/2026-10-21-blog-audit-session-postmortem.md`；
  `CC_GUARD_BASH=off` 逃生門的理由：這支已因誤擋放寬三次，與其逼出「改用 python 寫檔」繞過，不如給可稽核的總開關。
- **2026-10-29**｜**常駐載入只算一次：`check_docs.py` 第 7 類移除，上限 6,500 與 ⚠️ 搬進 `hooks/session-start.sh`**（`/cc-audit`，工單 harness-slim-split 2.2）。
  理由：兩邊同一份公式、第 7 類只警告不紅，開場那行每個 session 都看得到；拿掉後 `check_docs.py` 從 283 降到 249 行，BACKLOG 新檢查才放得下。
  測試改成 `test/session-start.test.sh`。下面 10-18、09-04 兩條講第 7 類的，上限數字與推導仍有效，守的位置改成 session-start。
- **2026-10-18**｜**常駐載入預算（`check_docs.py` 第 7 類）改成只警告不紅**，使用者定案（寫死值掃描 §1c）。
  理由：它複製進下游 pre-commit 後讀的是**提交者本人**的帳號 CLAUDE.md＋MEMORY.md，個人檔一大就在每個裝了 harness 的 repo 都 commit 不了；
  repo 自己的那份已由第 1 類 `AGENTS.md` 4,000 上限擋。上限數字、公式、SessionStart 那行不變。同批：pre-commit 找不到 `python3` 改放行（CI 仍跑）。
  **翻案條件**：常駐總量連續 3 輪收輪都超 6,500 且沒人處理 → 改回本 repo 限定的紅燈。
- **2026-09-04（P6）**｜**常駐載入上限＝6,500 字元**，由 `tools/check_docs.py` 第 7 類守。
  範圍：帳號 `~/.claude/CLAUDE.md` ＋ repo `AGENTS.md`（沒有才看 `CLAUDE.md`）
  ＋ `~/.claude/projects/<dir>/memory/MEMORY.md`。
  **不用中位數，用目標形態構造**：帳號 `CLAUDE.md` 1,500 ＋ `AGENTS.md` 4,000
  （＝`CHAR_BUDGETS` 既有那條）＋ `MEMORY.md` 1,000 ＝ 6,500。三個數字自此互相自洽，
  改任一個要同時檢查另外兩個。
  **為什麼放棄計畫寫的「中位數 ×1.1」**：實測樣本（`harness.log` 去重後最近 5 個 session，
  N ＝ 16,698／4,436／3,585／4,436／4,436）裡有 4 個來自**沒有 `AGENTS.md`** 的 repo，
  中位數 4,436 × 1.1 ＝ 4,879 因此涵蓋不了 `AGENTS.md`：`templates/AGENTS.md` 骨架 460 字
  就吃掉一半餘裕，`MEMORY.md` 長到 835 字即破——新裝 plugin 的 repo 幾個 session 內必紅。
  分母取錯不是把上限調高的理由，是重訂分母。
  **4,879 → 6,500 是取樣修正，不是放寬，不構成調高上限的先例。之後仍然只降不升。**
  **相依**：帳號 `CLAUDE.md` 現況 3,585，比這個分配裡的 1,500 多 2,085。
  在它降下來之前，6,500 的餘裕是被借走的（見 `BACKLOG.md`）。
  公式與 `hooks/session-start.sh` 是同一份，`test/check-docs-resident.test.sh`
  第 4 項比對兩邊的 N，分岔就紅。
  帳號 `CLAUDE.md` 不存在（CI、新 clone）＝整類跳過，不當紅。
  死法：連續 6 輪沒紅，且改任何一個常駐檔都要先算它 → 改成只印不擋。
- **2026-09-04（P6）**｜`check_docs.py` 單檔行數上限 **250 → 285**（現況 282）。
  理由：安裝是 `cp tools/check_docs.py scripts/` 單檔複製，`commands/cc-harness.md`
  與 `templates/hooks/pre-commit` 兩處都寫死單檔，拆檔要同時改那兩處＝比第 7 類本身還大。
  翻案條件：下次再需要加判定時，先拆檔再加，不再調高這個數字。

- **2026-09-03**｜`commands/*.md` **吃** frontmatter 的 `allowed-tools`／`argument-hint`／
  `disable-model-invocation`（計畫 P3 那條 `[需確認]` 由此結案）。兩種證據：
  （a）二進位檔 2.1.259 的 `TXo()` 載入 `~/.claude/commands` 與 `<repo>/.claude/commands`，
  對每個 `.md` 呼叫 **`FWe(frontmatter, content, name, "Custom command")`**——與 `SKILL.md`
  同一支解析器，欄位表含 `name`／`description`／`model`／`allowed-tools`／`disallowed-tools`／
  `argument-hint`／`arguments`／`disable-model-invocation`／`user-invocable`／`effort`／`shell`；
  （b）headless 實測（臨時檔已刪）。
  **但三個欄位的實際語意不同，白名單要挑對欄位**：
  - `disable-model-invocation: true` **有效且是硬擋**。實測錯誤原文：
    `Skill <name> cannot be used with Skill tool due to disable-model-invocation.`
    使用者自己打 `/<name>` 不受影響。
  - `disallowed-tools: Bash` **有效**，工具被移除，實測回 `Permission to use Bash has been denied.`
  - `allowed-tools: Read` **不收斂工具**——實測該指令內 Bash 照跑。它是「預先放行」不是白名單。
    **所以 P3「allowed-tools 收成逐條」要改用 `disallowed-tools`**，或接受 allowed-tools 只是文件用途。
  - `argument-hint` 只是 UI placeholder（解析路徑已確認，無執行期行為可黑箱測）。
  順帶實測：`~/.claude/commands/` 與 `.claude/commands/` 在 2.1.259 內部標記
  `loadedFrom: "commands_DEPRECATED"`——官方在推 `skills/`，強化 P5 搬 plugin 的方向。

## 帳號層規則

- **2026-10-18**｜**帳號 `~/.claude/CLAUDE.md` 只寫平台設定管不到的**，使用者定案（`/cc-root` 推薦的 L3）。
  刪：仲裁序、語言節（留「只管對話回覆」一句）、冰山第 5、6 條、〈問題就只是問題〉（併入第 4 條）、
  〈帳號層寫入邊界〉（權威改為 `hooks/guard-userlevel.mjs` 檔頭）、Direct Mode 的「跑 gate」、commit 節的 lint 句；
  `eli5.md` 刪語言段與「3 行摘要」段。4,012 → 2,842 字。
  理由：同一偏好有 3–4 份（組織指令、`settings.language`、本檔、`eli5.md`），衝突靠仲裁序在讀取時解，C1／C5／C10 掛著沒人修。
  前提實測：desktop 開的 `claude -p` 子程序看得到組織指令與 `# Language` 區塊；**純終端機與 cloud 沒驗**。
  **翻案條件**：任一入口實測缺組織指令或 `# Language`，把對應的那段加回帳號 `CLAUDE.md`。
- **2026-10-20**｜**`eli5.md` 的「精簡＋長內容寫檔、回覆給路徑＋3 行摘要」段加回**（部分翻案上一條）。
  理由：組織指令只寫「依複雜度調整長度」，不等於精簡上限；刪掉後回覆變長，使用者回報「動不動就一頁」。
  實測：session「GTM MCP 伺服器整合評估」問一句「能不能合進來」回 956 字／20 行，下一題回 1,826 字／30 行。
- **2026-10-20**｜**帳號 `CLAUDE.md` 的 10-18 瘦身回溯**（翻案 2026-10-18 那條的刪除部分），使用者定案。
  補回：仲裁序、冰山第 1 條「預設精簡」、第 5 條「明說完整／詳細才全文」、第 6 條「結尾不接反問或新提案」、
  〈帳號層寫入邊界〉（原替代品 `guard-userlevel` 已刪）。10-18 之後的新條文保留（wrap_up 規則改為第 7 條）。
  理由：使用者回報 10-18 後 agent 發散、好奇亂做、動不動輸出兩頁。觸發的不是 10-18 寫的語言翻案條件。
  dotclaude commit `7ae3d83`。行為差異要新 session 才看得到，未實測。
- **2026-10-26**｜**冰山第 6 條縮小、第 7 條改向、仲裁序補宿主工具一句**（對帳 10-18「刪第 6 條」與 10-20「補回第 6 條」），使用者對診斷 A2 說 fix all。
  第 6 條只禁開放式反問與範圍外新提案；已指派工作還有一個要拍板的決定時，用 `wrap_up` 問題＋按鈕問一題。
  第 7 條改成 `wrap_up` 先叫、正文寫在之後（原文方向相反，app 工具說明是後寫）。仲裁序：宿主工具的呼叫順序／欄位格式不算規則衝突。
  理由：10-20 後回覆下方的下一步方塊消失（`prompt_suggestions` 是 On），推論是第 6 條讓收尾不帶 `ask`——**未驗證**。
  `wrap_up` 不帶 `ask` 時之後的正文會顯示（本 session 使用者引用過）；**帶 `ask` 時沒實測**。dotclaude commit `ca19f6b`。
  **翻案條件**：新規則下 agent 又出現結尾亂提案／發散 → 拿掉例外句；實測帶 `ask` 後正文不顯示 → 第 7 條改回先寫正文。

## memory 寫入規則

- **2026-09-03**｜`~/.claude/CLAUDE.md`「帳號層寫入邊界」節加兩條 memory 內容規則
  （使用者當輪核准，commit 在 `dotclaude` repo）：①repo 已有 SSOT 的事實
  （`registry.json`／`docs/ops-facts.md`／`docs/decisions.md`／專案 rules）不進 memory，
  只留一行指標；②每條 `type: feedback` 帶一行 `失效條件：<可判定的條件>`，條件成立時
  下次 `consolidate-memory` 直接刪、不留「已失效」註記。
  官方事實修正：memory **索引有硬上限**（每 session 只載入 `MEMORY.md` 前 200 行或 25 KB），
  內容檔沒有上限；所以問題不是總量而是重複與失效。
  **死法**：兩條規則上線後 memory 仍每月新增 >5 條重複 → 規則無效，改用 hook 擋寫入路徑。
- **2026-09-03**｜`google-meta-ads-ga4-mcp` 的 memory 照這兩條整理過一次：
  **20 條 → 7 條**，`MEMORY.md` 3,930 → 2,030 字元。動作四類：3 條 Ads 紀律合併成
  `gads-analysis-discipline`；`render-paid-no-coldstart` 搬進該 repo
  `docs/ops-facts.md`〈部署（Render）〉；`hermes-live-account-testing` 的 repo-safe 部分
  2026-09-01 已在〈live 壓測鏈路〉故刪除原條（只把「證據範圍界線」併進 Ads 紀律第 4 節）；
  `polish-phase-propose-first` 已失效（2026-08-31 進入直接做模式）故刪。
  另有 **7 條 harness 治理類搬到本 repo 的 memory**（原本躺在那邊只因當時 harness 工作在那做）。
  實例佐證規則①：原 `account-layer-write-permission-split` 抄了一份路徑清單，且已與
  CLAUDE.md 走針（它寫 `commands/`／`output-styles/` 可寫，CLAUDE.md 寫的是未經核准不得改）。

- **2026-09-03**｜**內建 `/goal` 不取代帳號層「做完才叫做完」那段**（P1→P3→P4 順延三次，本輪定案）。
  實測（2.1.259 `strings`）：`/goal` 存在，機制是「使用者設一個完成條件 → 每輪後由另一個
  evaluator 判定是否達成 → 沒達成就繼續做」（原文：`Approving sets this as the session goal,
  like running /goal: after each turn a separate check decides whether the condition is met,
  and Claude keeps working until it is.`），另有 `Goal achieved`／`Goal could not be achieved`、
  `restoreGoalFromTranscript`／`tengu_goal_restored_on_resume`（resume 會還原）、
  `CLAUDE_CODE_GOAL_CHECKIN_MINUTES`（閒置時注入 check-in）、`modelProposedGoals` 設定。
  **不能取代的理由**：`/goal` 是 **session 級、要人當場設**的一次性條件，`claude --goal` 實測
  **不存在**（`error: unknown option '--goal'`），所以 harness 無法讓它自動常駐；
  而「做完才叫做完」要在**每個 session、沒人設條件時**就生效。兩者是不同層：
  規則是預設值，`/goal` 是單輪加碼。
  **翻案條件**：出現可在設定檔或 CLI 常駐指定 goal 的官方介面（`--goal` 或 settings 鍵可用）
  → 那段散文改成「開輪時設 `/goal`」＋保留一句底線。

## plugin 化（P5）

- **2026-10-17**｜**新增 mod `hooks/cc-watch.tsx`（plugin 第一個 hooks module，與 settings hooks 同在 `hooks/hooks.json`）**：
  回合結束時，若改了程式檔（`.md`／`.txt`、暫存、memory 不算）之後沒有測試／lint／build、子 agent、gate skill 或瀏覽器呼叫，
  就提醒（對話插一行系統訊息＋toast＋狀態列 ⚠；`turn.complete` 回傳 text 在 Desktop 不顯示，實測過；
  不論回合怎麼結束都檢查，另掛 `classic.Stop` 備援，一回合只報一次）；
  只標示不擋，子 agent 的回報不動。輸入框上方常駐一行狀態：
  本 session 改過未 commit 的檔數、領先／落後、BACKLOG 條數，領先 >0 且有 upstream 時顯示 Push 鍵、未 commit >0 時顯示 Commit 鍵（外框）；
  兩鍵都只把字填進輸入框、使用者按 Enter 才送（`prompt.submit` 排隊約 5 秒，比手打慢，實測後改）；
  「詳細」鍵或 `/cc-watch` 才開面板（Desktop 把面板塞在右側欄、位置不能指定，所以不自動開）。
  2026-10-18 擴充（使用者定案）：狀態列加目前分支 PR 與檢查結果（`gh`，60 秒；gh 不能用就不顯示）；顏色只用黑白灰＋紅（紅＝要處理：未 commit、落後、檢查失敗、⚠；反白＝執行中；使用者否決多色）；面板補 context％、花費、我開著的 PR。
  **不做**：金鑰遮罩、危險指令確認、回合進度（秒數與內建的重複且有延遲，實測後拿掉）——使用者否決。
  依據 `docs/reviews/2026-10-17-mods-hooks.md` §5 的 A、B。設計 skill 提醒（同報告 A 列）延後。
  **翻案條件**：一週內使用者說提醒是誤報 ≥3 次 → 收窄「改程式」或放寬「驗證」的判斷；面板沒人看 → 拿掉面板，只留提醒。
  **2026-10-20 停用**（使用者定案，0.4.53）：`hooks.json` 拿掉 `modules`。
  理由：回合結束塞進對話的「⚠ 沒跑測試」系統訊息，疑似讓下一輪 agent 自己跑去驗證、多做事（10 個 session 出現過）；與帳號 `CLAUDE.md` 瘦身回溯同一批。
  **2026-10-29 移除原始碼**（`/cc-audit`，工單 harness-slim-split 1.1）：`cc-watch.tsx`、`cc-watch-logic.ts`、`code-path.mjs`、`types/`、測試一起刪。
  要恢復從 git 撈 `ab701cc` 之前的版本，再把 `"modules": ["./cc-watch.tsx"]` 加回 `hooks/hooks.json`。

- **2026-10-17**｜**新增 `hooks/guard-userlevel.mjs`：寫入帳號層（`~/.claude/**`、`~/.claude.json`、`~/.agents/**`）前回 `ask`**，
  使用者定案。放行 `~/.claude/projects/*/memory/**`、`~/.claude/plans/**`；讀一律放行。是 ask 不是 block（多點一下，不是不准）。
  Bash 判斷照字面路徑，heredoc 內文不剝（直譯器內文要「整個字串字面值就是帳號層路徑」＋寫入跡象才算）。
  回放近 30 天 42,249 次工具呼叫：會問 448 次（1.06%），抽查近乎全為真的寫帳號層（邊角：python 改 repo 檔、內文含 `'~/.claude.json'` 字面值），專案內一般 coding 不問。
  總開關 `CC_GUARD_USERLEVEL=off`。**翻案條件**：一週內使用者因誤問按「允許」≥5 次 → 收窄判斷；
  發現漏網的帳號層寫入 → 補規則並加進 `test/guard-userlevel.test.mjs`。

- **2026-09-04**｜**沒有 `$ARGUMENTS` 的 command，使用者打的參數會被整段丟掉**，不是接在後面。
  實測（2.1.259，headless，臨時 command 已刪）：同一支 command 本文要求回報「這段之後看到什麼」，
  `argument-hint` 有、`$ARGUMENTS` 無 → 回 `SAW:NONE`；把本文改成 `SAW:$ARGUMENTS` 後
  打同一句 → 回 `SAW:BANANA777`。
  `test/test_skills.py` 的 `check_argument_contract` 守兩邊對得上。

- **2026-09-04**｜`claude plugin validate <path> --strict` 是 P5 的驗收指令，**存在且會擋**。
  實測：`commands`／`hooks` 指到不存在的路徑時 exit 1 並指名；補上後 `✔ Validation passed`。
  `claude plugin details <name>` 需要先安裝（沒有 `--plugin-dir`），所以 token 成本投影
  要等實裝那步才有。

- **2026-09-04（輪 2，兩次修正後的定稿）**｜**command 走原始 repo，hook 走安裝快取——
  同一個 plugin 兩種行為。** 輪 1 記成「全部走快取，不 bump 等於沒改」是錯的；
  輪 2 第一次更正記成「全部走原始目錄」也是錯的。實測三次才收斂：
  - **command 走 repo**：改一支 plugin command 的本文、不 bump、直接 headless 呼叫
    → 新本文生效；同一支印出 `CLAUDE_PLUGIN_ROOT=~/Documents/3.AGENT/cc-harness`。
  - **hook 走快取**：PreToolUse 的錯誤訊息印出
    `…/plugins/cache/cc-harness/cc-harness/0.1.3/hooks/guard-bash.mjs`，當時 repo 已是 0.1.4；
    再在 `hooks/session-start.sh` 插一行標記、不 bump、開新 session → 標記**沒有**出現。
    版本在 **session 開始時釘住**，所以 update 完還要重開 session。
  - `installed_plugins.json` 的 `installPath` 指快取，`known_marketplaces.json` 的
    `installLocation` 指 repo——兩個路徑同時存在，這就是兩種行為的來源。
  **後果**：改 `hooks/`／`tools/` 要 bump＋`claude plugin update`＋重開 session；
  改 `commands/`／`templates/` 不用。`tools/check-plugin-sync.sh` 因此只比前兩個目錄。
  **教訓**：輪 1 只看到「快取沒變」就推論「快取是載入來源」，輪 2 只看到「command 是活的」
  就推論「全部都是活的」。兩次都是拿一個元件的觀察去蓋全部。

- **2026-09-04**｜**`plugin.json` 不要宣告 `hooks`——`hooks/hooks.json` 是標準路徑，會自動載入。**
  兩邊都有 → `Duplicate hooks file detected` → **整個 plugin `failed to load`**，
  四個 hook 全部沒跑。`claude plugin validate --strict` **驗不出來**（加回去重測，仍回
  `✔ Validation passed`），唯一看得見的地方是 `claude plugin list` 的 Status。
  這個 bug 從輪 1 實裝起活了一整輪，被第二個 repo 的 `/cc-harness doctor` 抓到。
  對策：`tools/check-plugin-loads.sh` 進 `test/run-all.sh`，讀 `plugin list` 的 Status。
  **死法**：官方哪天讓 `validate` 自己驗載入期錯誤，這支就多餘，拆掉。

- **2026-09-04**｜**`plugin.json` 不吃 `env`**，所以計畫 P5 那條「plugin settings 帶
  `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`／`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`」
  **做不到**。實測：加上去 `--strict` 回 `Unknown field 'env'. Claude Code ignores it at load time.`
  唯一落點是 `~/.claude/settings.json` 的 `env` 區塊——但那是**全帳號行為改動**，
  與「不做跨專案共用產物：定義可全帳號，行為只作用當前 repo」相衝，所以**不做**，
  留 BACKLOG 一行等使用者拍板；拍板後由 LLM 改 `~/.claude/settings.json` 並在 `~/.claude` commit（帳號 `CLAUDE.md` 寫入邊界的但書）。

- **2026-09-04**｜`CLAUDE_PLUGIN_ROOT` 在 command 本文的 Bash 區塊會展開，
  且 `directory` source 時等於**原始 repo 路徑**。所以 `cc-harness.md` 直接寫
  `${CLAUDE_PLUGIN_ROOT}/templates/`、`${CLAUDE_PLUGIN_ROOT}/tools/check_docs.py`，
  不再需要 `~/claude-harness/` 那條死路徑。

- **2026-09-04**｜實裝時**必須同時移除 `~/.claude/settings.json` 的四個 harness hook**。
  它們與 plugin 的 `hooks.json` 指到同兩支腳本，兩邊都在＝每個事件跑兩次，
  `harness.log` 雙倍計數、開場那兩行印兩遍。已移除（`hooks` 鍵整個沒了），
  guard-bash 這第五個 hook 只由 plugin 提供。

- **2026-09-04**｜`claude plugin validate .` 在 `plugin.json` 與 `marketplace.json` 都存在時
  **只驗 marketplace，plugin.json 被跳過**。所以 `test/run-all.sh` 改成逐檔驗兩份。

- **2026-09-04**｜兩處落點偏離計畫的目標形態，**刻意**：
  `check_docs.py` 放 `tools/` 不放 `scripts/`（plugin 出貨的都在 `tools/`；per-repo 複本
  才叫 `scripts/check_docs.py`，`templates/hooks/pre-commit` 兩個路徑都找）；
  測試放既有的 `test/` 不新開 `tests/`（一個目錄勝過兩個）。
  **死法**：下一輪若有人找不到這兩支而重建一份，就是落點選錯，改回計畫寫的路徑。

- **2026-09-04**｜`tools/check_docs.py` 的 BACKLOG 條數上限**以 `BACKLOG.md` 檔頭自己寫的
  「上限 N 條」為準**，檔頭沒寫才用預設 20。理由：本 repo 檔頭寫 12、腳本預設 20，
  兩份事實且使用者只會讀到檔頭那份。

- **2026-09-04**｜`check_docs.py` 的 BACKLOG 判定原本**對表格式 BACKLOG 完全失效**：
  項目 regex 只認 `- x`／`1. x`，本 repo 的 BACKLOG 是 markdown 表格，所以條數與行長兩項
  都在報綠卻什麼都沒驗。補上「第一格是純數字的表格列」後立刻抓到 5 條超長（含 R2／R3 就寫進去的）。
  教訓：閘寫完要餵一份**確定該紅**的輸入，綠燈本身不是證據。

- **2026-09-06**｜`/cc-harness` 的作用範圍**收斂到當前 repo**：拿掉第二段第 4 項
  「唯讀比對全域層」（帳號 `CLAUDE.md`／`output-styles/eli5.md`／`claude plugin list` 在場與否）。
  理由：本 skill 是 repo 骨架的閘，帳號層歪掉要靠帳號層自己的閘抓，一支 skill 同時管兩層
  等於在 repo 的體檢報告裡混進使用者當下不能處理的東西。唯一保留的跨層讀取是
  `check_docs.py` 第 7 類（常駐載入預算），它需要帳號 `CLAUDE.md` 與 `MEMORY.md` 當分子。
  **翻案條件**：出現「帳號層缺件導致 repo 端 harness 靜默失效」的實例，且沒有其他閘會抓到。

- **2026-09-13**｜新增 `templates/.claude/settings.json`：只宣告 `extraKnownMarketplaces`
  （`source: github`／`roylam-beep/cc-harness`）＋ `enabledPlugins`，**不放 hook**。
  理由：cloud session 是另一台機器，只讀 repo 內 commit 過的檔，`~/.claude/` 拿不到；
  沒有這張紙條，cc-* 在 cloud 不存在。來源不可寫本機那份的 `directory`＋絕對路徑。
  既有 `.claude/settings.json` 依表不動、不合併 JSON，缺宣告改由 **W4.4** 報。
  ~~**[需確認]**：private marketplace 能不能裝~~ → 2026-10-03 實測結案，見本節末條。
- **2026-09-28**｜本機 project scope 卡舊版的修法是**逐 repo 跑 `claude plugin update cc-harness --scope project`**，
  不是 `uninstall --scope project`。實測四個 repo（0.2.9／0.3.4 → 0.4.4）版控檔零變動。
  `uninstall` 預期會一起拿掉 repo 版控裡 `.claude/settings.json` 的 `enabledPlugins`（未實測），等於拆掉上一條的 cloud 紙條。
  `claude plugin update` 不帶 `--scope` 只更新 user scope。
- **2026-10-03**｜**cloud 全新 repo 取得 cc-* 的路：repo 改 public＋cloud 環境 Setup script 安裝**，不靠各 repo 自己宣告。
  Setup script（環境 `ccharness`）：`claude plugin marketplace add roylam-beep/cc-harness`、`claude plugin install cc-harness@cc-harness`，
  各加 `|| true`、外包 `command -v claude`、結尾 `exit 0`；Network 要放行 `github.com`。三條實測：
  ①全新 repo `roylam-beep/brag`（無任何 cc-harness 內容）開場即有 `cc-harness:*`，`/cc-harness:cc-harness` 跑完開 brag#1；
  ②session **中途** `claude plugin install` 回成功，但 Skill 呼叫得 `Unknown skill`——清單開場固定，只能在開場前裝；
  ③沒掛進該 session 的 private repo，git 讀不到（`could not read Username`）——所以 private 時全新 repo 拿不到 plugin，2026-09-27 改 public。
  公開前掃全歷史 53 commit：憑證／帳號 ID／客戶名 0；現行檔本機路徑已清，歷史不改寫。BACKLOG 11 結案。
  連帶：「setup script 只能存在環境設定」與本實測一致；「cloud 不裝 `enabledPlugins`」本輪未驗。
  **翻案條件**：Setup script 安裝在 session 開頭報錯，或 claude.ai 代管 marketplace（`claude plugin marketplace add --claudeai`）能裝 private。

## skill 家族成員

- **2026-09-04**｜`simple-explain` **併入 plugin，改名 `cc-explain`**——推翻計畫
  〈待拍板〉①「不併」那條（原理由：改名會讓 31 次的計數器歸零，違反原則 4）。
  **使用者定案**：計數器可以用 `ALIASES` 同步到最終使用數，「真的只剩一份定義」比避免改名重要。
  做法：`commands/cc-explain.md` 為唯一本文；`~/.claude/skills/simple-explain/` 已刪；
  `~/.claude/output-styles/eli5.md` 的〈重講協議〉改成一行指標。
- **2026-09-28**｜`cc-grill` **由「找碴推翻方案」改成「訪談使用者」**，照 mattpocock/skills 的
  `grilling`（決策樹、前提已定的題目一輪問完、每題附建議答案、事實派子 agent 查）。
  理由：原版往便宜方向收斂，會把深層方案拉回治標（缺口修復 session 實例）；找碴已由 `cc-root` 紅隊承擔。
  **使用者定案**：一輪用 `AskUserQuestion` 最多 4 題，每題 2 個選項（守 ELI5 的「最多兩個選項」）；
  這和冰山憲法第 1、6 條衝突，例外寫在帳號 `CLAUDE.md` 該節（`~/.claude` 的 cc30c1b）。代價：沒有輕量版的單一方案找碴了。
- **2026-10-16**｜**新增 `cc-pr`**，照 mattpocock/skills v1.3 的 `/pr`：PR body 固定三節——
  圖（取代摘要段落，沿用 `cc-show` ①純文字規矩＋mermaid）、`## 驗` 改前改後對照、Merge Danger（單向／雙向門＋影響範圍＋怎麼審）。
  理由：整合分支進 `main` 那支 PR 是使用者唯一親手按合併的 PR，原本 `gh pr create --fill` 拿 commit 訊息湊 body。
  接點只改 `cc-dispatch`〈自動推進〉第 3 步；開頭〈寫進 BASE〉「BASE 是 main 一律走 PR」那支仍 `--fill`（只帶工單檔，不值得）。
  節名沿用 `## 驗`、保留可選 `## 學到的`（`cc-close` ① 會撈）。
  **不宣告唯讀**：產物要寫進 `.git/pr-body.md`，而且 `disallowed-tools` 在被別支用 Skill 工具呼叫後會不會延續到呼叫者，沒實測過——
  若延續，`cc-dispatch` 後續的 Write／Edit 會被擋。
- **2026-10-16**｜**`/cc-close` 收輪先派兩個乾淨子 agent：gate（Opus，動 `src/**` 或寫入治理才派）＋audit（動到規則檔就派）**，〔gate 半 2026-10-18 起作廢〕
  audit 判 `delete`／`dup` 的同一個收輪 commit 砍掉，`rounds.md` 記「退格 n」。`/cc-gate` 不再要求新 session，子 agent 也算乾淨 context，
  驗收改成有界（只驗列出的、反例要觸發得了），與 `/cc-dispatch` 驗收員同一套界線。
  理由：`/cc-root` 追膨脹根因——收輪只有升格（加）的出口，退格靠按需 `/cc-audit`（10-04 那條），15 輪只真瘦身一次；
  `/cc-gate` 因為要另開 session，本機最後一次用在 08-30。這次對話的乾淨 audit 子 agent 有抓到本輪剛加的重複，當作前提的初步證據。
  **翻案條件**：連續 3 輪收輪「退格 0」且同期規則類檔淨增 → audit 子 agent 沒在砍，改回按需並重議。
- **2026-10-16**｜**`/cc-gate` 由 agent 自派**〔2026-10-18 起作廢，改掛 push 前〕：改了 `src/**` 要說完成前，派 Opus 子 agent 驗，只回報、不寫檔，缺陷當場修、最多兩輪。
  觸發寫在 skill 的 description（常駐清單），不另寫進 `templates/AGENTS.md`——Cursor 執行者叫不到 skill，寫了只是重複。
  理由：帳號層 Direct Mode 是預設，多數改動不經 `/cc-close`，收輪派 gate 管不到；使用者定案「沒 gate 沒審一定出事」。
  `/cc-harness doctor` 報舊的「使用者叫才跑」句（本機只有 `google-meta-ads-ga4-mcp` 的 `AGENTS.md` 有）。
  **翻案條件**：自派 gate 連續 5 次「passes with nothing to fix」且沒有一次抓到缺陷 → 成本不值得，改回收輪才派。
- **2026-10-18**｜**收輪只認 `/cc-close`、不再派 gate；gate 改掛 `git push` 前，由 `hooks/guard-bash.mjs` 第十類擋**，使用者定案（`/cc-root`＋`/cc-grill`）。
  取代 10-16 兩條的 gate 半（收輪派 gate、`/cc-gate` 靠 agent 記得自派）；audit 半不動。
  做法：要推的 commit 動到程式檔（副檔名非 `.md`／`.mdx`／`.txt`，同當時 cc-watch 的 `isCodePath`）且 HEAD 在 `.git/harness-gate` 沒有 `pass`／`skip` 紀錄就擋；
  `skip` 要使用者當輪明說；紀錄是 agent 自己寫，擋的是「不經過 gate 的 push」，不是防偽。
  同批：收輪程序單一來源是 `/cc-close`，repo 的 `docs/round.md`、`AGENTS.md` 收輪節不讀（`google-meta-ads-ga4-mcp` 的 `round.md` 與它多出的兩條規則作廢）；
  統計欄拿掉 `gate 缺陷 c`（取代 09-24 那句）、`PR 合併 a／退回 b` 只在有 `runs.md` 時數；回報拿掉 gate 判定與 meta／產品比。
- **2026-10-20**｜**push 前 gate（guard-bash 第十類）與 `guard-userlevel` 整個移除**〔作廢上一條的 gate 掛 push 前〕，使用者定案。
  理由：每次 push 等 review 十幾二十分鐘；guard-userlevel 做 MCP 時讀 `~/.claude.json` 也一直跳窗，一晚零進度。
  現況：`/cc-gate` 只剩手動叫；帳號層寫入沒有機器守。程式碼見 `git show 4f5bacd`、R16 收輪 commit。
  **翻案條件**：沒 gate 的 push 出現一次「跑得動但語意錯」上線，或 agent 未經同意改壞帳號層設定一次，就重議（先考慮只在 user 明說時才擋的輕量版）。
  理由（逐字稿實測，`/cc-root` 紅隊覆核）：10-16 之後 5 個動過 `src/` 的 session 只有 1 個自派過 gate；cps1-toolkit 兩個 session 自派 0 次、cc-watch 警告三次 agent 沒回應，
  那個 session 收輪派 gate 卡在 Agent 確認 584 秒後被拒絕。
  **未驗證**：hook 擋下後 agent 會照做派 gate；Agent 確認為何在自動模式還跳 [需確認]，push 前派 gate 仍可能卡同一處。
  **不做**（使用者定案）：retro 三個角度加進 `cc-close` ①；`commands/*.md` 字數棘輪（先觀察三輪，`cc-close.md` 現 3,909 字，三輪內淨增就做）。
  **翻案條件**：push 前 gate 連續 5 次「passes with nothing to fix」且沒抓到缺陷 → 改成只提醒不擋；hook 擋下後 3 次 agent 沒派 gate 就寫 pass 或重推 → 紀錄成裝飾，重議。

- **2026-10-18**｜**`cc-next` 的「只給 1 個推薦」改成「一個做法、可含多件事」**，使用者定案。
  實例：寫死值 29 筆要修，推薦只框了 8 筆，使用者回「其他照做」後只做了那 8 筆，要再追一輪才補完。
  候選限定為互斥做法；不互斥、都該做的事全部併進推薦，照做＝推薦列出的全部一次做完。
  **翻案條件**：推薦因為件數多而常被回「不要」或要求拆開 → 改回單件推薦並重議。
- **2026-10-18**｜**新增 `cc-next`**：使用者問「下一步／該選哪個」時給 1 個推薦＋固定五欄（推薦、替代、回頭、工作量、改變推薦的條件），
  結尾用 `AskUserQuestion` 問照不照做，照做就同一輪開做。留空時「階段交界」（繼續／`/compact`／`/clear`／交接／子 agent）也是候選，
  借 mattpocock/skills `ask-matt` 的判斷，先排除「繼續」。`--red` 才派紅隊。`disable-model-invocation: true`（只能手打）。
  與 `cc-grill` 分界：grill＝Claude 問使用者；next＝使用者問 Claude。決策清單由 `/cc-grill` 訪談定案。
  **不宣告唯讀（不進 `READONLY`）**：實測唯讀 skill 一載入，同一輪剩下的 Write 都回 `Permission to use Write has been denied.`
  （本 session 用 Skill 工具叫 `cc-explain` 後寫 scratchpad），按了「照做」也寫不了；唯讀改靠本文「按照做之前不改檔」。
  下一輪（新的使用者訊息）是否還擋**沒實測**。
  結尾那一問與帳號 `CLAUDE.md` 冰山憲法第 6 條「結尾不接反問」衝突；使用者定案刪掉第 6 條，由另一個審憲法的 session 處理，本 repo 不碰帳號層。
  （刪除被 10-20 回溯推翻，10-26 改成縮小版：`wrap_up` 問題＋按鈕不在禁止之列，見〈帳號層規則〉。）

## P3 A/B 作廢

- **2026-09-23**｜P3 三支扛量 skill（cc-handover／cc-close／cc-gate）的 A/B 觀察期**作廢**，使用者決定。
  理由：原訂 2026-09-10 判定沒做；對照組在 `ac3f29d`、`470bab5` 已被改（接 spec 層），after 數字量不出 P3 的效果。
  四段改寫保留現狀，不 revert；基線 `docs/ab/2026-09-03-p3-baseline.md` 不再產 after 檔，2026-10-29 刪除（git 可撈）。

## 規則本文不敘述歷史

- **2026-09-03**｜skill 本文（`~/.claude/commands/cc-*.md`）只寫現行規則，
  不寫「X 已於 <日期> 退役／定案」。退役史的唯一落點是 `~/.claude` 的 git 歷史
  （`retired-commands/` 2026-10-17 已刪，兩張表在 commit `83b88fe` 之前的版本裡）。
  `test/test_skills.py` 守：command 本文一律不得有日期（2026-09-24 起，原本死法段的例外隨使用量死法一起拆掉）。

## 未達標，明列

- **2026-09-03**｜P3 計畫的「allowed-tools 收成逐條白名單」**改成只做半套**。
  理由：實測 allowed-tools 不收斂工具（見上）。唯讀那三支改用 `disallowed-tools` 才真的擋；
  cc-close／cc-gate／cc-handover 這種本來就要寫檔的，工具粒度的白名單給不出保護
  （擋不了「只准寫 docs/plans/**」這種路徑條件），allowed-tools 只留作預先放行減少提示。
  真要擋路徑，落點是 `hooks/guard-bash.mjs` 那類 PreToolUse hook，不是 frontmatter。
