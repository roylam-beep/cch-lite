---
description: 指定一支 skill 做體檢：SkillEvaluator 的 9 項評分標準由 Claude 自己打分（不用 API）＋機器規則打分與個資掃描＋查它跟哪支已裝 skill 搶觸發。唯讀，只回報不改。EN: audit one skill, score a skill, does this skill trigger right
argument-hint: "<skill 名稱或路徑，例：content-audit、anthropic-skills:skill-auditor、./skills/foo>"
allowed-tools: Read, Glob, Grep, Bash(find:*), Bash(uvx:*), Bash(mktemp:*), Bash(mkdir:*), Bash(cp:*), Bash(ls:*)
disallowed-tools: Write, Edit, NotebookEdit
disable-model-invocation: true
---

體檢 $ARGUMENTS 指定的**那一支** skill。沒給就回一句「要審哪支？給名稱或路徑」然後停，不自己挑、不整批掃。

## 0. 找到那支

給的是路徑：直接用（資料夾要含 `SKILL.md`；單檔 `.md` 也收）。
給的是名稱：去掉 `外掛名:` 前綴（`anthropic-skills:skill-auditor` → `skill-auditor`），找：

```bash
n=<名稱>
find . ~/.claude/skills ~/.claude/commands ~/.claude/plugins/cache \
  \( -path "*/$n/SKILL.md" -o -path "*/commands/$n.md" \) -not -path '*/node_modules/*' 2>/dev/null
```

多個結果：當前 repo 裡的優先；其餘是同一支的多個快取版本就取版本號最大（不是版本號就取最新修改）的那份；
是不同外掛的同名 skill 就列出來問使用者，停。找不到就照實說，停。
回報第一行寫實際審的檔案路徑。

## 1. 九項評分（Claude 自己打，不用 API）

評分標準取自 SkillEvaluator 的 `rubric-eval`（原本要付費 API 當評審，這裡由你當評審）。
讀完整支 skill（含同資料夾的 `scripts/`、`references/`），每項 0–10 分，**7 分以上算過**：

| 權重 | 項目 | 看什麼 |
|---|---|---|
| 3 | 描述清楚 | description 具體，講得出**什麼時候**該用 |
| 3 | 步驟好跟 | 指示有明確動作，照著做不用猜 |
| 3 | 例子 | 例子有用，且涵蓋使用者多種講法 |
| 3 | 觸發模擬 | 自己寫 5 句**該**觸發、3 句**不該**觸發的使用者講法，逐句判 description 會不會接對 |
| 3 | 流程完整 | 從頭到尾哪一步之後會不知道下一步做什麼 |
| 2 | 資訊齊全 | 目的、腳本、參數、前提（要 `gh`、MCP、外部 CLI 卻沒寫＝扣） |
| 2 | 範圍明確 | 邊界清楚，不太寬也不太窄 |
| 2 | 錯誤處理 | 寫到的錯誤情境真實、解法可用，不是套話 |
| 1 | 語氣格式 | 一致、專業 |

總分＝加權平均 ×10；**60 分以上且每項都 ≥7** 才算通過。每項評語要指出 skill 裡的行號或原句，
說不出依據就不給低分。觸發模擬那 8 句要寫進報告。

## 2. 機器打分＋個資掃描（不呼叫模型）

前提：PATH 上有 `uv`。沒有就跳過這段，報告寫一句「沒有 uv，第 2 段沒跑」。
第一次跑會下載建置 SkillEvaluator，約十幾秒到一分鐘。報告放暫存目錄，不寫進 repo：

```bash
T=$(mktemp -d "${TMPDIR:-/tmp}/cc-skillcheck.XXXX"); mkdir -p "$T/s/<名稱>"
cp <單檔 .md> "$T/s/<名稱>/SKILL.md"      # 資料夾就改成 cp -R <資料夾>/. "$T/s/<名稱>/"
se() { uvx -q --python 3.13 --from git+https://github.com/roylam-beep/SkillEvaluator@c9d170e77bdef0b32a4811fb9b14484578559b2e skillevaluator "$@"; }
se quality-check "$T/s" -r cli -r json -o "$T/q"
se pii-scan "$T/s" -r cli -r json -o "$T/p"
```

用 function 不用 `SE="uvx …"; $SE`：zsh 不拆變數裡的空格，實測 exit 127。版本釘在 commit，升版要重驗下面這條過濾。

`quality-check` 對中文 skill 的扣分幾乎全是英文標題比對（缺 `## Purpose`／`## Limitations`／
`## Troubleshooting`…），實測沒有訊號：**不逐條列**，收成一行 `略過 <N> 條英文標題比對`；
那些資訊是不是真的缺，第 1 段已經判過。提到 `run_script`／`activate_skill` 的也略過：那是 NVIDIA 執行環境的工具名，
Claude Code 用不到。其餘 finding 與 `pii-scan` 全部照列。
`pii-scan` 實測抓得到 email 與帶使用者名稱的家目錄路徑；抓不到電話與 API key，不要宣稱查過。

## 3. 撞誰

拿這支的 description 跟本 session skill 清單裡其他 skill 比（清單在你的 context 裡，不另外讀檔）。
只抓一種事：**同一句使用者的話，兩支都會接**。用途相近但觸發句分得開的不算。

## 輸出

```
審：<路徑>
總分 <N>/100（<通過／不通過>）｜機器分 <N>｜個資 <PASS／N 條>｜撞 <N> 支
<九項一項一行：項目 分數/10 — 一句評語 [行號]>
觸發模擬：該接 <5 句，各標 ✓✗>；不該接 <3 句，各標 ✓✗>
fix：<最該改的，最多 3 條，最嚴重在前，附行號與改法>
撞：/<這支> ↔ /<那支>：「<那句話>」兩邊都接。建議 <哪支 description 加什麼排除語>。
略過 <N> 條英文標題比對；完整機器報告：$T
```

「裝了這支，結果有沒有變好」（裝與不裝各跑一次比較）不在這裡做，那要燒好幾倍用量；
要做就用 `skill-creator:skill-creator` 的 eval。

## 邊界

- 唯讀：只回報，不改 skill、不 commit。要改由使用者說一聲。
- 過度工程（能砍什麼）走 `/cc-audit`；正確性 bug 走 `/code-review`。

## 防什麼

skill 寫完沒人量：description 接錯話、步驟斷在半路、漏寫前提、夾帶個資，都要等用的時候才撞到；本支在用之前先量一次。
