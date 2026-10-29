// guard-bash.mjs 的直接測試（harness W7.3）
// 這支 hook 擋在**每一次** Bash 呼叫前面，所以「該放行的放行」比「該擋的擋住」更關鍵：
// 誤擋會弄壞整個 session，而且被擋的人沒有繞路可走。

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { classifyCommand, classifyToolInput, stripHeredocs, SCRATCHPAD_HINTS } from "../hooks/guard-bash.mjs";

const SCRATCH = "/private/tmp/claude-501/proj/session/scratchpad";

test("擋 force push（三種寫法）", () => {
  for (const cmd of [
    "git push --force origin main",
    "git push -f",
    "git push --force-with-lease origin main",
  ]) {
    const hit = classifyCommand(cmd);
    assert.ok(hit, `未擋：${cmd}`);
    assert.equal(hit.rule, "git push --force");
    assert.ok(hit.hint.length > 0, "擋下時必須指路，不能只說不行");
  }
});

test("git reset 帶 mode 旗標一律擋，純 unstage 放行", () => {
  // 2026-08-23 收緊：原本只擋 --hard。帳號層政策把 reset 整體列入「要當輪授權」，
  // 因為 --soft／--mixed 移動 HEAD 就抹掉既有 commit，而本 repo 是共用 worktree。
  for (const [cmd, rule] of [
    ["git reset --hard HEAD~3", "git reset --hard"],
    ["git reset --soft HEAD~1", "git reset --soft"],
    ["git reset --mixed HEAD", "git reset --mixed"],
    ["git reset --keep HEAD~1", "git reset --keep"],
    ["git reset --merge", "git reset --merge"],
  ]) {
    const hit = classifyCommand(cmd);
    assert.equal(hit?.rule, rule, `未擋：${cmd}`);
    assert.ok(hit.hint.length > 0, "擋下時必須指路，不能只說不行");
  }
  // 不帶 mode 旗標＝只動 index，是每天都在用的 unstage，擋它會逼人繞路。
  assert.equal(classifyCommand("git reset HEAD -- src/x.ts"), null);
  assert.equal(classifyCommand("git reset -- src/x.ts"), null);
  assert.equal(classifyCommand("git restore -- src/x.ts"), null);
});

test("擋改寫既有工作的 git 動作（rebase／amend／刪本地分支）", () => {
  for (const [cmd, rule] of [
    ["git rebase -i main", "git rebase"],
    ["git rebase --onto main feat", "git rebase"],
    ["git commit --amend -m x", "git commit --amend"],
    ["git commit --amend --no-edit", "git commit --amend"],
    ["git branch -D unmerged", "git branch -D"],
    ["git branch --delete --force old", "git branch -D"],
  ]) {
    const hit = classifyCommand(cmd);
    assert.equal(hit?.rule, rule, `未擋：${cmd}`);
    assert.ok(hit.hint.length > 0, "擋下時必須指路，不能只說不行");
  }
});

test("刪遠端分支放行（2026-09-17 退役）", () => {
  // 刪一條已合併的分支什麼都沒丟（commit 已在 main 裡），跟 force push 不是同一件事。
  // 綁在同一條「遠端不可逆」是分類錯誤，實測每次清 PR 分支都被誤擋。
  for (const cmd of [
    "git push origin --delete stale",
    "git push origin -d stale",
    "git push origin :stale",
  ]) {
    assert.equal(classifyCommand(cmd), null, `誤擋：${cmd}`);
  }
  // 但 force push 照擋——同一支 git push，別退役過頭。
  assert.equal(classifyCommand("git push -f origin main")?.rule, "git push --force");
});

test("git branch -d 放行，-D 照擋（2026-09-17 放寬）", () => {
  // git 自己就會拒絕刪未合併的分支，那道檢查不需要本 hook 再做一次；
  // 擋它只是把「清掉已合併的 PR 分支」這種日常動作卡死。-D 是叫 git 別守，照擋。
  for (const cmd of [
    "git branch -d merged",
    "git branch --delete merged",
    "git branch -d -r origin/gone",
  ]) {
    assert.equal(classifyCommand(cmd), null, `誤擋：${cmd}`);
  }
  for (const cmd of ["git branch -D unmerged", "git branch --delete --force x", "git branch --delete -f x"]) {
    assert.equal(classifyCommand(cmd)?.rule, "git branch -D", `未擋：${cmd}`);
  }
});

test("擋繞過閘：--no-verify（commit 的 -n 是它的簡寫）", () => {
  for (const [cmd, rule] of [
    ["git commit --no-verify -m x", "git commit --no-verify"],
    ["git commit -n -m x", "git commit --no-verify"],
    ["git push --no-verify origin main", "git push --no-verify"],
  ]) {
    const hit = classifyCommand(cmd);
    assert.equal(hit?.rule, rule, `未擋：${cmd}`);
    assert.ok(hit.hint.length > 0, "擋下時必須指路，不能只說不行");
  }
});

test("git push -n 是 dry-run 不是 no-verify，放行", () => {
  // 同一個 -n 在 commit 與 push 意思相反。混在一起擋會誤擋每天在用的預演。
  assert.equal(classifyCommand("git push -n origin main"), null);
  assert.equal(classifyCommand("git push --dry-run origin main"), null);
});

test("git clean 帶 force 擋，dry-run 與不帶 force 放行", () => {
  for (const cmd of ["git clean -f", "git clean -fd", "git clean -fdx", "git clean --force -d"]) {
    const hit = classifyCommand(cmd);
    assert.equal(hit?.rule, "git clean -f", `未擋：${cmd}`);
    assert.ok(hit.hint.includes("git clean -n -d"), "必須指出可逆的預演路徑");
  }
  // -n 勝出（git 自己也是這個語意）；不帶 force 時 git 本來就會拒絕執行。
  assert.equal(classifyCommand("git clean -n -d"), null);
  assert.equal(classifyCommand("git clean -fdn"), null);
  assert.equal(classifyCommand("git clean --dry-run -fd"), null);
  assert.equal(classifyCommand("git clean -d"), null);
});

test("git clean -X 放行，-x 照擋（2026-09-17 放寬）", () => {
  // 大寫 X ＝只刪被 .gitignore 忽略的檔（build 產物），跟已放行的 `rm -rf dist` 同一類。
  // 小寫 x 意思相反：連 ignore 規則都不管，刪得比預設更多。只差一個大小寫，所以要有測試釘住。
  assert.equal(classifyCommand("git clean -fdX"), null);
  assert.equal(classifyCommand("git clean -f -X"), null);
  assert.equal(classifyCommand("git clean -fdx")?.rule, "git clean -f");
});

test("rebase 中途的收拾動作放行（擋了會把人鎖死在 rebase 裡）", () => {
  for (const flag of ["--abort", "--continue", "--skip", "--quit", "--edit-todo"]) {
    assert.equal(classifyCommand(`git rebase ${flag}`), null, `誤擋：git rebase ${flag}`);
  }
});

test("git 的前置旗標不影響子命令判定", () => {
  // `git -C <path> …`／`git -c k=v …` 會吃掉下一個 token；不跳過就會把路徑當子命令，
  // 於是 `git -C /x rebase main` 整條漏掉。
  assert.equal(classifyCommand("git -C /tmp/r rebase main")?.rule, "git rebase");
  assert.equal(classifyCommand("git -c commit.gpgsign=false commit --amend")?.rule, "git commit --amend");
  assert.equal(classifyCommand("git -C /tmp/r commit -m x"), null);
  assert.equal(classifyCommand("git -c commit.gpgsign=false commit -m x"), null);
});

test("擋遞迴強制刪除，四種旗標寫法都要抓到", () => {
  for (const flags of ["-rf", "-fr", "-r -f", "--recursive --force"]) {
    assert.ok(classifyCommand(`rm ${flags} docs/`), `未擋：rm ${flags}`);
  }
  assert.ok(classifyCommand("sudo rm -rf /etc"), "sudo 包一層仍要擋");
});

test("scratchpad 內的遞迴刪除放行，混了非 scratchpad 路徑就擋", () => {
  assert.equal(classifyCommand(`rm -rf ${SCRATCH}/tmp`), null);
  assert.equal(classifyCommand(`rm -rf ${SCRATCH}/a ${SCRATCH}/b`), null);
  assert.ok(
    classifyCommand(`rm -rf ${SCRATCH}/a docs/`),
    "一個目標在 scratchpad 不代表整條指令安全",
  );
  assert.ok(classifyCommand("rm -rf"), "沒指定路徑也擋（可能是變數展開成空字串）");
  for (const hint of SCRATCHPAD_HINTS) {
    assert.equal(classifyCommand(`rm -rf ${hint}x/tmp`), null, `${hint} 應放行`);
  }
});

test("repo 內的可重生目錄放行（誤擋這類等於天天擋）", () => {
  for (const cmd of [
    "rm -rf .tmp-size",
    "rm -rf node_modules",
    "rm -rf dist/*",
    "rm -rf packages/web/node_modules",
    "rm -rf build/ coverage/",
    "rm -rf .next .turbo",
    "rm -rf __pycache__",
    "rm -rf tmp",
  ]) {
    assert.equal(classifyCommand(cmd), null, `應放行：${cmd}`);
  }
});

test("可重生的名字不能當成逃生門：repo 外與 .. 一律擋", () => {
  for (const cmd of [
    "rm -rf /var/tmp",
    "rm -rf ~/tmp",
    "rm -rf ../../node_modules",
    "rm -rf .git",
    "rm -rf .",
    "rm -rf src",
    "rm -rf node_modules docs/",
  ]) {
    assert.ok(classifyCommand(cmd), `應擋：${cmd}`);
  }
});

test("放行日常指令（誤擋比漏擋貴）", () => {
  for (const cmd of [
    "git push origin main",
    "git push --follow-tags origin main",
    "git commit -m 'x'",
    "git branch --show-current",
    "git branch -a",
    "git branch --merged",
    "git branch --list 'feat/*'",
    "git rebase --abort",
    "git reset -- README.md",
    "rm -f note.txt",
    "rm docs/a.md",
    "npm run verify",
    "rmdir empty",
    "git log --oneline -5",
  ]) {
    assert.equal(classifyCommand(cmd), null, `誤擋：${cmd}`);
  }
});

test("複合指令逐段判", () => {
  assert.ok(classifyCommand("cd /tmp && rm -rf /var/data"));
  assert.ok(classifyCommand("echo start; git push --force"));
  assert.ok(classifyCommand("ls | xargs rm -rf /x"));
  assert.equal(classifyCommand("cd /tmp && ls && git status"), null);
});

test("heredoc body 是資料不是指令", () => {
  // 本檔第一次上線就被自己擋下：寫 hook 說明時內文提到被擋指令的字面文字，
  // heredoc body 被當指令解析。修在解析層，不是放寬規則。
  const cmd = ["cat > doc.md <<'EOD'", "說明：rm -rf / 會被擋", "EOD"].join("\n");
  assert.equal(classifyCommand(cmd), null);

  // 但 heredoc 結束後的真指令仍要抓到
  const after = ["cat <<EOD", "x", "EOD", "rm -rf docs/"].join("\n");
  assert.ok(classifyCommand(after));

  assert.ok(!stripHeredocs(cmd).includes("說明"), "heredoc 內容應被剝除");
});

test("非字串／空輸入放行（fail open）", () => {
  assert.equal(classifyCommand(undefined), null);
  assert.equal(classifyCommand(""), null);
  assert.equal(classifyCommand("   "), null);
});


test("逃生門 CC_GUARD_BASH=off：設了整支停用，沒設照擋", () => {
  // 這條只能端對端測——開關在 main()，不在純函式裡。
  // 設計重點：讀的是 **hook 進程自己的 env**，所以 agent 在 Bash 指令裡塞
  // `CC_GUARD_BASH=off …` 沒有用（那是它子 shell 的環境），不構成繞過路徑。
  const hook = new URL("../hooks/guard-bash.mjs", import.meta.url).pathname;
  const payload = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push --force origin main" } });
  const run = (env) => spawnSync(process.execPath, [hook], { input: payload, env: { ...process.env, ...env } }).status;

  assert.equal(run({ CC_GUARD_BASH: undefined }), 2, "沒設開關時 force push 要照擋");
  assert.equal(run({ CC_GUARD_BASH: "off" }), 0, "設了 off 要整支停用");
  assert.equal(run({ CC_GUARD_BASH: "on" }), 2, "只有字面 off 才停用，其他值一律照擋");
});

test("classifyToolInput：逐段規則優先，空輸入放行", () => {
  assert.equal(classifyToolInput({ command: "git push --force && git status" }).rule, "git push --force");
  assert.equal(classifyToolInput({ command: "git status" }), null);
  assert.equal(classifyToolInput({}), null);
  assert.equal(classifyToolInput(undefined), null);
});

import { configFromEnv } from "../hooks/guard-bash.mjs";
test("沒設任何環境變數＝預設行為（opts 全空）", () => {
  const o = configFromEnv({});
  assert.equal(o.allow.size, 0);
  assert.deepEqual(o.disposable, []);
  assert.equal(classifyCommand("git rebase main", o)?.key, "rebase");
  assert.equal(classifyCommand("rm -rf Pods", o)?.key, "rm", "內建清單沒有 Pods，預設照擋");
});

test("CC_GUARD_BASH_ALLOW 逐類放行，其他類照擋", () => {
  const o = configFromEnv({ CC_GUARD_BASH_ALLOW: " rebase , amend " });
  assert.equal(classifyCommand("git rebase main", o), null);
  assert.equal(classifyCommand("git commit --amend -m x", o), null);
  assert.equal(classifyCommand("git reset --hard", o)?.key, "reset", "沒列的類別照擋");
  assert.equal(classifyCommand("git push --force", o)?.key, "force-push");
  // 同一段命中兩類：放行一類後還要判到另一類
  assert.equal(classifyCommand("git commit --amend --no-verify", configFromEnv({ CC_GUARD_BASH_ALLOW: "no-verify" }))?.key, "amend");
  // 每一類都有鍵，擋下訊息才印得出要放行哪一類
  for (const [cmd, key] of [
    ["git push -f", "force-push"], ["git commit -n -m x", "no-verify"], ["git clean -fd", "clean"],
    ["git reset --soft HEAD~1", "reset"], ["git branch -D x", "branch-force"], ["rm -rf docs", "rm"],
  ]) {
    assert.equal(classifyCommand(cmd)?.key, key, cmd);
    assert.equal(classifyCommand(cmd, configFromEnv({ CC_GUARD_BASH_ALLOW: key })), null, `${cmd} 放行 ${key}`);
  }
});

test("CC_GUARD_BASH_DISPOSABLE 追加可重生目錄，規則同內建（絕對路徑、.. 不吃）", () => {
  const o = configFromEnv({ CC_GUARD_BASH_DISPOSABLE: "obj,Pods,.dart_tool" });
  assert.equal(classifyCommand("rm -rf obj ios/Pods .dart_tool", o), null);
  assert.ok(classifyCommand("rm -rf /abs/Pods", o), "絕對路徑不吃名字清單");
  assert.ok(classifyCommand("rm -rf ../Pods", o), "帶 .. 不吃名字清單");
  assert.ok(classifyCommand("rm -rf obj src", o), "有一個目標不符就整條擋");
});


import { classifyRemoteWrite } from "../hooks/guard-bash.mjs";

test("遠端寫入：rsync 推上遠端、ssh 跟整批改寫資料庫、wp 遠端寫入 → ask（2026-10-26 加）", () => {
  // 出處：docs/reviews/2026-10-21-blog-audit-session-postmortem.md，auto mode 直接放行這幾種。
  for (const cmd of [
    "rsync -avz --delete dist/ deploy@example.com:/var/www/html/",
    "rsync -avz -e \"ssh -p 2222\" ./site/ host:/srv/site",
    "rsync -a build/ backup::module/path",
    "ssh deploy@example.com 'wp db import /tmp/dump.sql'",
    "ssh -p 2222 host \"cd /srv && wp search-replace old new --all-tables\"",
    "cd site && ssh host 'wp db reset --yes'",
    "wp --ssh=deploy@example.com/srv db import x.sql",
    "wp @prod search-replace http://old https://new",
  ]) {
    const hit = classifyRemoteWrite(cmd);
    assert.equal(hit?.key, "remote-write", `未攔：${cmd}`);
    assert.equal(hit.decision, "ask", "遠端寫入只要求確認，不擋");
    assert.equal(classifyToolInput({ command: cmd })?.decision, "ask", `classifyToolInput 沒接上：${cmd}`);
  }
});

test("遠端寫入：預演、下載、讀取、本機指令放行", () => {
  for (const cmd of [
    "rsync -avzn dist/ deploy@example.com:/var/www/html/",
    "rsync -avz --dry-run dist/ host:/srv",
    "rsync -avz deploy@example.com:/var/www/html/ ./backup/",
    "scp host:/tmp/dump.sql .",
    "rsync -a ./a/ ./b/",
    "ssh host 'wp db export -'",
    "ssh host ls -la /var/www",
    "ssh-keygen -t ed25519 -f k",
    "wp @prod db export x.sql",
    "wp db import local.sql",
    "wp search-replace a b",
    "git push origin main",
    "cp a:b c",
    // 同日收窄：日常上傳圖片那條不再跳框（scp、遠端 rm -f 清暫存、wp media import）
    "scp dump.sql user@10.0.0.5:/tmp/",
    "cp a.webp b.webp && scp -q b.webp web1:/tmp/ && ssh web1 'cd /srv/www && ID=$(wp media import /tmp/b.webp --porcelain) && echo $ID; rm -f /tmp/b.webp'",
    "ssh host 'wp db query \"SELECT 1\"'",
  ]) {
    assert.equal(classifyRemoteWrite(cmd), null, `誤攔：${cmd}`);
  }
  assert.equal(classifyRemoteWrite("ssh h 'wp db import x'", configFromEnv({ CC_GUARD_BASH_ALLOW: "remote-write" })), null, "remote-write 可逐類放行");
});

test("遠端寫入端對端：stdout 印 permissionDecision ask、exit 0；擋下類仍 exit 2", () => {
  const hook = new URL("../hooks/guard-bash.mjs", import.meta.url).pathname;
  const run = (command) => spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    env: { ...process.env, CC_GUARD_BASH: undefined, CC_GUARD_BASH_ALLOW: undefined },
  });
  const r = run("rsync -avz dist/ deploy@example.com:/var/www/");
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout.toString());
  assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  assert.ok(out.hookSpecificOutput.permissionDecisionReason.includes("deploy@example.com"));
  // 同一條指令同時有擋下類：擋下優先
  assert.equal(run("rsync -a x host:/y && git push --force").status, 2);
  assert.equal(run("ls").stdout.toString(), "", "放行時 stdout 不能有東西");
});
