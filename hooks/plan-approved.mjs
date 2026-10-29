#!/usr/bin/env node
// PostToolUse(ExitPlanMode)：計畫核准那一刻，提醒模型「照計畫做完要派背景驗收」。由 hooks/hooks.json 掛上。
// 只是提醒、不擋：stdout 印 `hookSpecificOutput.additionalContext`，模型在工具結果旁看到這段話（官方 hooks 文件）。
// 為什麼掛在核准、不掛在回合結束：Stop 事件帶 additionalContext 會讓對話自動續跑一輪，等於擋住使用者。
//
// 輸入：stdin 收 {tool_name, tool_response:{plan, filePath}}。`tool_response` 文件標為 "the approved plan"。
// 實測（2026-10-30，Claude Code desktop）：核准 → 提醒出現且帶計畫檔路徑；拒絕 → 不出現。`plan` 空就不提醒的判斷仍保留當保險。
// **解析失敗一律放行（fail open）**：壞掉時最糟是少一句提醒，不准讓工具呼叫出錯。
//
// 純函式 reminder 對外 export，由 test/plan-approved.test.mjs 直接測。
import { pathToFileURL } from "node:url";

export function reminder(input) {
  if (!input || input.tool_name !== "ExitPlanMode") return null;
  const res = input.tool_response;
  if (!res || typeof res !== "object" || !String(res.plan ?? "").trim()) return null;
  const where = res.filePath ? `計畫檔 ${res.filePath}` : "plan mode 存檔處最新那份計畫";
  return `計畫已核准。照計畫做完、回報使用者之前，派背景驗收：用 Agent 工具（model "sonnet"、run_in_background: true）照 /cch-lite:cc-gate 驗 ${where}，prompt 只給 cc-gate 本文路徑、計畫檔路徑、動過的檔案清單，不轉述經過；派完照常回報，不用等它。`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const text = reminder(JSON.parse(raw));
      if (text) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text } }));
    } catch {}
    process.exit(0);
  });
}
