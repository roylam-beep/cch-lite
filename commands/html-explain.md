---
description: 把主題做成一頁離線 HTML 解答：只寫 Markdown 草稿，流程圖、表格、圖表的排版交給內附的 am.mjs，頁面存在當前 repo 的 `.tmp/answers/`。EN: explain as one HTML page
argument-hint: "<主題；留空＝把上一輪的結論做成頁面>"
allowed-tools: Read, Write, Edit, Bash(node:*), Bash(git rev-parse:*), Bash(git check-ignore:*)
disable-model-invocation: true
---

把 $ARGUMENTS 做成一頁 HTML。留空就用上一輪你自己的結論。

`am` ＝ `node "${CLAUDE_PLUGIN_ROOT}/vendor/answer-me-with-html/am.mjs"`；`R` ＝ `git rev-parse --show-toplevel`
（不是 git repo 就用目前資料夾）。**每次跑 `am` 都帶 `AM_HOME="$R/.tmp/answer-me-with-html"`**，產物不出 repo。

1. `git check-ignore -q "$R/.tmp/x"` 失敗就把 `.tmp/` 加一行到 `$R/.git/info/exclude`（不碰 `.gitignore`）。
2. 跑 `am help format`，要用的元件再跑 `am help <元件>`。**不手寫 HTML／CSS／SVG。**
3. 用 Write 寫草稿 `$R/.tmp/answers/<英文短名>.md`：frontmatter 帶 `lang: zh-TW`，第一格或開頭一句給結論。
   專案程式碼用 `src=` `lines=` 引真檔；沒查證的數字不畫 `chart`／`limits`。
4. `am render --no-open -o "$R/.tmp/answers/<英文短名>.html" "$R/.tmp/answers/<英文短名>.md"`
   - `✗ L<行號>`：照 `Correct example` 改草稿那幾行再跑。
   - `STE n warnings`：照建議改，最多重跑 2 次，還有就留最後一版並說一句。
5. 回覆兩行：一句結論＋`[file://<頁面絕對路徑>](file://<頁面絕對路徑>)`。不貼草稿、不貼 HTML。

## 規矩

- **`! Update hint`／`! Cleanup hint` 不理，不跑 `am update`／`am clean`／`am serve`。** 這份是固定版本，
  更新照 README 的 `vendor/` 那行。
- **`node` 被權限擋就停，不繞路。** 告訴使用者：設定加 `Bash(node:*)`，或自己用 `!` 跑第 4 步那行。

## 防什麼

用散文講流程、比較、架構，讀的人看不出誰連到誰；叫模型手寫 HTML 又多花約 8 倍輸出量（上游 README 自測）。
