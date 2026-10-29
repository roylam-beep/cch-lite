---
description: 把當前主題畫出來取代散文——文字圖（file tree／call tree／diff）、inline widget（SVG／HTML／Mermaid）、或 Artifact 三選一。視覺是取代說明，不是額外附加。使用者說「畫出來」時用；回覆要用文字描述結構、流程、誰呼叫誰／誰連到誰時，也主動用這支，不必等使用者開口。EN: draw it, diagram, visualize instead of prose; use proactively when explaining structure or flow
argument-hint: "<要畫的東西>（可加 widget＝強制用圖、artifact＝要保存或分享的版本）"
allowed-tools: mcp__visualize__read_me, mcp__visualize__show_widget, Artifact, Read, Glob, Grep, Bash(git diff:*), Bash(git log:*), Bash(ls:*), Bash(find:*), Bash(grep:*)
disallowed-tools: Write, Edit, NotebookEdit
---

把 $ARGUMENTS 畫出來。**視覺是取代散文，不是額外附加**——畫了圖就把那段文字刪掉。

## 選媒介：由便宜往貴，能停就停

**① 純文字**（預設）——file tree（誰負責什麼）／call tree（執行順序）／`git diff --stat`／
一張小表。結構簡單、≤15 行、看完就丟的一律用這個。

**② inline widget**（`mcp__visualize__show_widget`）——**只有文字排不出來時才升級**；這個 session 沒有 visualize 工具（純 CLI 常見）就退回①，回覆註明「已降級為文字」：
狀態機、多對多關係、時序交錯、需要顏色編碼分層、需要並排比較的 before／after。
**第一次呼叫前必須先跑 `mcp__visualize__read_me`**（拿 CSS 變數與版式規則），不要跳過，
也不要跟使用者報告你跑了它。widget 是一次性的，不寫檔。

**③ Artifact**——只有兩種情況：使用者說要保存／分享，或這張圖本身就是交付物（要給別人看、
會回頭看第二次）。**寫檔前必須先載入 `artifact-design` skill**，畫圖再加 `artifact-diagramming`；沒有 Artifact 工具或這兩支 skill 就退回①，回覆註明降級。
Artifact 原生吃 Mermaid（```mermaid 圍欄或 `<pre class="mermaid">`），不必自己引 library。

**不要為了炫技升級媒介。** 12 行文字講得完就別開 widget；一次性的東西別發 Artifact。
`$ARGUMENTS` 明講 `widget` 或 `artifact` 就照做，不用再判。

## 畫什麼

**每次回覆最多 2 個視覺**，單一文字視覺 ≤15 行。**只留回答當前問題所需的節點**——
把整棵樹倒出來等於沒畫。

widget 或 Artifact 的圖：節點 ≤9、箭頭 ≤12、強調色 ≤2 個，超過就拆成總覽＋細節兩張。
畫完試著刪：能刪掉一個節點、合併總是一起出現的兩個、或刪一條排版就看得出的線，就刪。

節點與邊要對得上真實的 `檔案:行號`；**沒查證的關係用虛線並標 `[推測]`**。
圖不能造假結構——看起來完整比看起來殘缺危險得多。

## 規矩

- **唯讀。** 不改被畫的東西、不 commit。文字圖與 widget 都不落檔；只有 ③ 會產檔。
- 畫完一句話收尾：**這張圖要你看出的那件事**。看不出來就是畫錯了，重畫或改回文字。

## 防什麼

用長篇散文描述結構，讀的人看不出誰連到誰。
