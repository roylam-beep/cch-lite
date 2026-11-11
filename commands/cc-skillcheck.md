---
description: 審一支 skill 專用（audit／review／審／分析某支 skill 都走這支）：SkillEvaluator 的 9 項評分標準由 Claude 自己打分（不用 API）＋個資掃描＋查它跟哪支已裝 skill 搶觸發＋查它過去實際怎麼被叫、跟說明對不對得上。唯讀，只回報不改。EN: audit one skill, score a skill, does this skill trigger right, how is it actually used
argument-hint: "<skill 名稱或路徑，例：content-audit、anthropic-skills:skill-auditor、./skills/foo>"
allowed-tools: Read, Glob, Grep, Bash(find:*), Bash(ls:*), Bash(grep:*)
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

## 2. 個資

整支 skill（含同資料夾的 `scripts/`、`references/`）分兩步查：

1. **Grep 掃格式**：email、帶使用者名稱的家目錄（`/Users/<名>/`、`/home/<名>/`）、電話號碼、
   金鑰樣式（`sk-`、`AKIA`、`AIza`、`Bearer `、`api_key=`）。
2. **讀一遍找名稱**：客戶名、品牌名、真實人名、廣告帳號 ID。格式掃不到這類，要靠讀。

命中逐條列 `行號＋原文片段`。輸出的「個資」欄只照這兩步的結果填；讀檔時看到人名或客戶名卻填「通過」＝這段沒做完。

## 3. 撞誰

拿這支的 description 跟本 session skill 清單裡其他 skill 比（清單在你的 context 裡，不另外讀檔）。
只抓一種事：**同一句使用者的話，兩支都會接**。用途相近但觸發句分得開的不算。

## 4. 實際怎麼被叫

寫的人想的用法，跟使用者實際打的字常常對不上；這一步拿紀錄對。

```bash
n=<名稱>
# 手打斜線時帶的參數（出現次數多的在前）
grep -rhoE "$n</command-name>[^<]{0,40}<command-args>[^<]{0,120}" ~/.claude/projects --include='*.jsonl' 2>/dev/null \
  | sed 's/.*<command-args>//' | sort | uniq -c | sort -rn | head -30
# 手打總次數（含不帶參數的）／agent 自己叫的次數
grep -rhoE "$n</command-name>" ~/.claude/projects --include='*.jsonl' 2>/dev/null | wc -l
grep -rhoE "\"skill\": ?\"[^\"]*$n\"" ~/.claude/projects --include='*.jsonl' 2>/dev/null | wc -l
```

續接的 session 會重複計，次數只看相對大小；夾著指令字串的雜訊行略過。沒有逐字稿（cloud 常見）就寫「無紀錄」跳過。
然後對三件事，各一句：

- **參數**：實際打的字，`argument-hint` 與本文接不接得住（例：說明寫「指定一支」，實際打「全 repo 的 skill」）。
- **誰在叫**：說明寫「主動用」卻幾乎都是手打，或設了 `disable-model-invocation` 卻被期待自動接。
- **拿到的答案**：使用者的下一句是照做，還是追問、重講、罵——後者＝輸出格式對不上他要的。

## 輸出

```
審：<路徑>
總分 <N>/100（<通過／不通過>）｜個資 <通過／N 條>｜撞 <N> 支
<九項一項一行：項目 分數/10 — 一句評語 [行號]>
觸發模擬：該接 <5 句，各標 ✓✗>；不該接 <3 句，各標 ✓✗>
實際用法：手打 <N> 次／agent 叫 <N> 次；對不上：<寫的 ↔ 實際打的，最多 3 條，附原句；沒有就寫「無」>
fix：<最該改的，最多 3 條，最嚴重在前，附行號與改法>
撞：/<這支> ↔ /<那支>：「<那句話>」兩邊都接。建議 <哪支 description 加什麼排除語>。
```

「裝了這支，結果有沒有變好」（裝與不裝各跑一次比較）不在這裡做，那要燒好幾倍用量；
要做就用 `skill-creator:skill-creator` 的 eval。

## 邊界

- 唯讀：只回報，不改 skill、不 commit。要改由使用者說一聲。
- 過度工程（能砍什麼）走 `/cc-trim`；正確性 bug 走 `/code-review`；計畫或規則檔怎樣更好走 `/cc-root`。

## 防什麼

skill 寫完沒人量：description 接錯話、步驟斷在半路、漏寫前提、夾帶個資，都要等用的時候才撞到；本支在用之前先量一次。
也防：照設計者想的用法寫，對不上使用者實際打的字，卻沒有任何一步拿紀錄來對。
