---
description: 鋪設或體檢當前 repo 的 harness 標準件（留空＝建缺件並自檢；doctor＝唯讀體檢，不寫任何檔）。作用範圍限於當前 repo：repo 外不寫，也不讀帳號層。EN: install or doctor the harness in this repo
argument-hint: "[doctor]"
allowed-tools: Bash, Read, Glob, Grep, Write, Edit
---

模式由 `$ARGUMENTS` 決定：留空 → 第一、二段都跑，第二段 1–3 項發現問題**當場修**；
含 `doctor` → 只跑第二段，**唯讀**，發現問題只回報不修。

## 🔒 寫入邊界（最高優先，覆蓋本檔其餘任何敘述）

**所有寫入必須落在當前 repo 根目錄底下。** repo 外唯一允許的存取，是讀
`${CLAUDE_PLUGIN_ROOT}/`（樣板與 `tools/`）好把骨架複製進來。

**帳號層 `~/.claude/` 一律不碰——不寫也不讀、不比對、不回報缺件。**
帳號 `CLAUDE.md`、`output-styles/`、`claude plugin list` 在不在場不是本 skill 的事，
歪了靠帳號層自己的閘抓。例外一條，唯讀、寫入仍只落在 repo：W4.6 的 `tools/marketplace-repo.sh` 跑 `claude plugin marketplace list` 取本 plugin 的來源。

同樣禁止寫入 `~/.codex/`、`${CLAUDE_PLUGIN_ROOT}/`，以及任何解析後落在當前 repo
之外的路徑——**即使偵測到它缺少或內容不符**。

**每次呼叫 Write／Edit／含 `>`、`>>`、`rm`、`mv`、`ln` 的 Bash 之前先看目標路徑**：
落在 repo 內＝允許；落在 repo 外＝停手，在收尾回報寫明「拒絕寫入 X（越界）」。
repo 外沒有機器守，要自己看。

**禁止指向 repo 外的 symlink**，一律複製成 repo 自有檔（理由見 `templates/README.md`）。

## 第一段：鋪標準件（只加不改；同名檔一律保留）

**照 `${CLAUDE_PLUGIN_ROOT}/templates/README.md` 那張對照表複製**，缺什麼補什麼，
已存在的一律不動。本檔不重述那張表：改樣板不該回頭改本檔。

```bash
sh "${CLAUDE_PLUGIN_ROOT}/tools/install-hooks.sh"        # git hook（非 git repo 略過）
cp "${CLAUDE_PLUGIN_ROOT}/tools/check_docs.py" scripts/  # 沒有 scripts/check_docs.py 才複製
```

複製之後以下各項**不准靜默**（收尾第 2 項逐條明列）：

- **W4.1**：`AGENTS.md` 是剛建的空殼（`使命` 節底下沒有非樣板文字）→ 寫進 `BACKLOG.md` 一行「填寫 AGENTS.md 使命／硬性規則（來源：/cch-lite:cc-setup 安裝）」。
- **W4.2**：`scripts/check_docs.py` 沒裝成 → 判定＝紅，不是 warning。
- **W4.3**：`.claude/rules/implementation.md` 的 frontmatter `paths` 看**被追蹤的檔實際在哪**，不看語言：
  扣掉 harness 自己的與產物目錄，頂層目錄依檔數由多到少取到涵蓋八成，印出來就是 `paths`：

  ```bash
  git ls-files | grep -vE '^(\.claude|\.github|handovers|docs/archive|node_modules|vendor|dist|build)/|^scripts/check_docs\.py$' \
    | grep / | cut -d/ -f1 | sort | uniq -c | sort -rn \
    | awk '{n[NR]=$1; d[NR]=$2; t+=$1} END {for(i=1;i<=NR;i++){s+=n[i]; printf "%s/**%s", d[i], (s*10>=t*8?"\n":", "); if(s*10>=t*8) exit}}'
  ```

  有輸出 → 填進 `paths`、刪掉 `TODO(paths)` 那段，收尾明列「paths＝依檔數推測：X」。沒輸出（空 repo、檔全在根目錄）
  → 留 `TODO(paths)` 不動，列給使用者一個決定。照抄不存在的路徑＝規則永不載入。
- **W4.4**：`.claude/settings.json` 已存在（依表不動）但 `enabledPlugins` 裡沒有
  `cch-lite@cch-lite` → 寫進 `BACKLOG.md` 一行「補 .claude/settings.json
  的 cch-lite plugin 宣告（來源：/cch-lite:cc-setup 安裝）」。安裝器不合併既有 JSON；靜默過去
  等於這個 repo 在 cloud session 永遠沒有 cc-* 指令。

- **W4.5**：快閘的保證點是 CI＋ruleset，不是 `.git/hooks`（它不隨 clone 走，cloud／Cursor／
  `gh pr merge` 都繞得過）。`.github/workflows/harness.yml` 照表複製；它要**已在 remote 預設分支上**
  （`gh api repos/{owner}/{repo}/contents/.github/workflows/harness.yml` 有回應）才進下一步，
  否則收尾明列「workflow 合進預設分支後重跑 /cch-lite:cc-setup 建 ruleset」。已在 → 查
  `gh api repos/{owner}/{repo}/rules/branches/<預設分支> --jq '[.[].type]'`，沒有
  `required_status_checks` → **問使用者一次**（長期改 GitHub 設定、每個 repo 各問）。同意才建：

  ```bash
  gh api -X POST repos/{owner}/{repo}/rulesets --input - <<'JSON'
  {"name":"harness-gate","target":"branch","enforcement":"active",
   "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
   "rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,
     "required_status_checks":[{"context":"harness-gate"}]}}],"bypass_actors":[]}
  JSON
  ```

  不同意、建失敗（private repo 在 Free 方案不能設）或沒有 `gh` → 寫進 `BACKLOG.md` 一行
  「main 沒有 harness-gate required check，快閘擋不住進 main（來源：/cch-lite:cc-setup 安裝）」。
  建了之後直推 main 會被拒，一律走 PR。

- **W4.6**：`.claude/settings.json` 是剛複製的（有 `<owner>/<repo>` 佔位）→ 跑
  `sh "${CLAUDE_PLUGIN_ROOT}/tools/marketplace-repo.sh"`，有輸出就把佔位換成它、收尾明列「plugin 來源＝X」；
  exit 1 → 佔位不動，寫進 `BACKLOG.md` 一行「填 .claude/settings.json 的 plugin 來源 owner/repo（來源：/cch-lite:cc-setup 安裝）」。
  佔位留著不填，cloud session 一樣沒有 cc-* 指令。

`CLAUDE.md` 已存在但內容是規則本文而非指標時，列出差異給使用者一個決定，不自己改。

## 第二段：自檢

1. 標準件齊全（`CLAUDE.md`／`AGENTS.md`／`handovers/`／`BACKLOG.md`／
   `docs/archive/{rounds,ICEBERG}.md`／`.claude/rules/`／`scripts/`）？
   `AGENTS.md` **要嘛自己寫了收輪／queue／hook／決策四節，要嘛有指到它們本文的路標**——
   **兩者皆可，缺的是「找不到」不是「沒寫在 AGENTS.md 裡」**。
   `handovers/` 裡每份交接單首行都有基準行？
2. `.claude/rules/` 底下每個檔都是**真實檔案**而非 symlink（`test -L` 為真＝舊版外連）？
3. `python3 scripts/check_docs.py "$(pwd)"` 綠？缺檔判定見 W4.2。
   判定類別以 `${CLAUDE_PLUGIN_ROOT}/tools/check_docs.py` 檔頭為準，複製進來的那支缺哪一類就列出來——
   缺的那類等於那道防線在本 repo 不存在。
   W4.5 那兩條 `gh api`：workflow 在預設分支上、ruleset 有 `required_status_checks`？
   缺＝紅，但只回報，**第二段不建 ruleset**（建要走 W4.5 的同意）；沒有 `gh`＝「無法驗」，不當綠。
4. 歪的是規則本身（不是檔案漂移）→ 明說「這要改設計」，不硬修。

## 收尾回報

1. 一句：「建立 X／補 Y／略過 Z（原因）」
2. 一行自檢結果，W4.1／W4.2／W4.3／W4.4／W4.5／W4.6 六種一律明列，不得吞掉。
3. **寫入清單**：逐一列出本次寫入的路徑，末尾聲明「repo 外 0 個檔被寫入」，建了 ruleset 就另列一行。
   有一筆落在 repo 外＝bug，必須明講而不是隱藏。
4. 一句下一步。

不重貼檔案內容。

## 防什麼

每個 repo 的標準件長得不一樣，缺件或漂移沒人發現。
