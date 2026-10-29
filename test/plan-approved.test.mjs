// plan-approved.mjs 的直接測試：核准才提醒、其他一律安靜，壞輸入不准讓 hook 出錯。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { reminder } from "../hooks/plan-approved.mjs";

const HOOK = new URL("../hooks/plan-approved.mjs", import.meta.url).pathname;
const run = (stdin) => spawnSync("node", [HOOK], { input: stdin, encoding: "utf8" });

test("核准的計畫：提醒帶計畫檔路徑、Sonnet、背景", () => {
  const t = reminder({ tool_name: "ExitPlanMode", tool_response: { plan: "# 計畫\n- 做 A", filePath: "/x/plans/p.md" } });
  assert.match(t, /\/x\/plans\/p\.md/);
  assert.match(t, /sonnet/);
  assert.match(t, /run_in_background: true/);
  assert.match(t, /\/cch-lite:cc-gate/);
});

test("沒有 filePath 也提醒，指向最新那份", () => {
  assert.match(reminder({ tool_name: "ExitPlanMode", tool_response: { plan: "x" } }), /最新那份/);
});

test("計畫是空的（可能是被拒絕）、別的工具：不提醒", () => {
  assert.equal(reminder({ tool_name: "ExitPlanMode", tool_response: { plan: "  " } }), null);
  assert.equal(reminder({ tool_name: "ExitPlanMode" }), null);
  assert.equal(reminder({ tool_name: "Bash", tool_response: { plan: "x" } }), null);
});

test("整支跑：核准印 additionalContext JSON、壞輸入安靜退 0", () => {
  const ok = run(JSON.stringify({ tool_name: "ExitPlanMode", tool_response: { plan: "x", filePath: "/p.md" } }));
  assert.equal(ok.status, 0);
  const out = JSON.parse(ok.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(out.hookSpecificOutput.additionalContext, /\/p\.md/);
  const bad = run("{not json");
  assert.equal(bad.status, 0);
  assert.equal(bad.stdout, "");
});
