// guard-bash.mjs 的直接測試（harness W7.3）
// 這支 hook 擋在**每一次** Bash 呼叫前面，所以「該放行的放行」比「該擋的擋住」更關鍵：
// 誤擋會弄壞整個 session，而且被擋的人沒有繞路可走。

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { classifyCommand, classifyToolInput, stripHeredocs, SCRATCHPAD_PREFIXES } from "../hooks/guard-bash.mjs";

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
  for (const hint of SCRATCHPAD_PREFIXES) {
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


test("逃生門 CC_GUARD_BASH=off：設了整支停用，沒設照問", () => {
  // 這條只能端對端測——開關在 main()，不在純函式裡。
  // 設計重點：讀的是 **hook 進程自己的 env**，所以 agent 在 Bash 指令裡塞
  // `CC_GUARD_BASH=off …` 沒有用（那是它子 shell 的環境），不構成繞過路徑。
  const hook = new URL("../hooks/guard-bash.mjs", import.meta.url).pathname;
  const payload = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push --force origin main" } });
  const run = (env) => {
    const r = spawnSync(process.execPath, [hook], { input: payload, env: { ...process.env, CC_GUARD_BASH_ALLOW: undefined, ...env } });
    assert.equal(r.status, 0, "命中也是 exit 0（交給確認框，不硬擋）");
    return r.stdout.toString() ? JSON.parse(r.stdout.toString()).hookSpecificOutput.permissionDecision : "";
  };

  assert.equal(run({ CC_GUARD_BASH: undefined }), "ask", "沒設開關時 force push 要跳確認框");
  assert.equal(run({ CC_GUARD_BASH: "off" }), "", "設了 off 要整支停用");
  assert.equal(run({ CC_GUARD_BASH: "on" }), "ask", "只有字面 off 才停用，其他值一律照問");
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
    assert.equal(hit.key, "remote-write");
    assert.equal(classifyToolInput({ command: cmd })?.key, "remote-write", `classifyToolInput 沒接上：${cmd}`);
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

test("端對端：命中一律 stdout 印 permissionDecision ask、exit 0；放行時 stdout 空", () => {
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
  // 同一條指令同時命中兩類：逐段規則優先，框裡寫的是 force push，並印可逐類放行的鍵
  const both = run("rsync -a x host:/y && git push --force");
  assert.equal(both.status, 0);
  const reason = JSON.parse(both.stdout.toString()).hookSpecificOutput.permissionDecisionReason;
  assert.ok(reason.startsWith("git push --force"), reason);
  assert.ok(reason.includes('"CC_GUARD_BASH_ALLOW": "force-push"'), reason);
  assert.equal(run("ls").stdout.toString(), "", "放行時 stdout 不能有東西");
});

// ───────── 2026-11-11：照 shell 的讀法拆指令（之前用空白切字，下面每一條都漏或誤攔） ─────────

import { parseShell, disposableTarget, resolveRmTargets } from "../hooks/guard-bash.mjs";

const HOME_ENV = configFromEnv({ HOME: "/Users/me" });

test("外包指令帶自己的選項、路徑寫法、設變數開頭：rm 還是排在指令位置", () => {
  for (const cmd of [
    "/bin/rm -rf ~/Documents/x",
    "\\rm -rf docs",
    "FOO=1 rm -rf docs",
    "FOO=1 BAR='a b' rm -rf docs",
    "env FOO=1 rm -rf docs",
    "env -i FOO=1 rm -rf docs",
    "sudo -u root rm -rf /etc",
    "sudo --user root /bin/rm -rf /etc",
    "ls | xargs -n 1 rm -rf",
    "ls | xargs -I {} rm -rf {}",
    "nice -n 10 rm -rf docs",
    "timeout 5 rm -rf docs",
    "nohup rm -rf docs",
    "command rm -rf docs",
    "sudo env FOO=1 nice -n 5 rm -rf docs",
    "rm -rf -- -weird docs",
  ]) {
    assert.equal(classifyCommand(cmd)?.key, "rm", `未擋：${cmd}`);
  }
});

test("子 shell、群組、背景、指令替換、shell 關鍵字後面的指令都要判", () => {
  for (const cmd of [
    "(rm -rf docs)",
    "(cd /x && rm -rf docs)",
    "{ rm -rf docs; }",
    "echo $(rm -rf docs)",
    "echo \"$(rm -rf docs)\"",
    "echo `rm -rf docs`",
    "true & rm -rf docs",
    "if true; then rm -rf docs; fi",
    "for d in a b; do rm -rf \"$d\"; done",
    "diff <(rm -rf docs) x",
    "f() { rm -rf docs; }; f",
    "! rm -rf docs",
  ]) {
    assert.equal(classifyCommand(cmd)?.key, "rm", `未擋：${cmd}`);
  }
  assert.equal(classifyCommand("(git push --force)")?.key, "force-push");
  assert.equal(classifyCommand("x=$(git reset --hard)")?.key, "reset");
});

test("把字串當指令跑的：bash -c、sh -c、eval、餵給 shell 的 heredoc 與 here-string 再拆一層", () => {
  for (const [cmd, key] of [
    ["bash -c \"rm -rf ~/Documents/x\"", "rm"],
    ["sh -c 'git push --force'", "force-push"],
    ["bash -lc 'cd /x && git reset --hard'", "reset"],
    ["zsh -c 'rm -rf docs' arg0", "rm"],
    ["sudo bash -c 'rm -rf /etc'", "rm"],
    ["bash -c \"bash -c 'git commit --amend'\"", "amend"],
    ["eval \"rm -rf docs\"", "rm"],
    ["eval rm -rf docs", "rm"],
    ["bash <<EOF\nrm -rf ~/Documents/x\nEOF", "rm"],
    ["bash <<'EOF'\ngit push --force\nEOF", "force-push"],
    ["sh -s <<EOF\ngit clean -fd\nEOF", "clean"],
    ["bash <<< 'rm -rf docs'", "rm"],
  ]) {
    assert.equal(classifyCommand(cmd)?.key, key, `未擋：${cmd}`);
  }
  // 同樣的字餵給不是 shell 的指令＝資料
  assert.equal(classifyCommand("cat <<EOF\nrm -rf docs\nEOF"), null);
  assert.equal(classifyCommand("python3 - <<'EOF'\nprint('git push --force')\nEOF"), null);
  assert.equal(classifyCommand("bash -c 'ls -la'"), null);
  assert.equal(classifyCommand("bash script.sh"), null);
});

test("反斜線換行＝同一行：旗標被換到下一行照樣抓到", () => {
  for (const [cmd, key] of [
    ["git push \\\n --force origin main", "force-push"],
    ["git push origin main \\\n  --force-with-lease", "force-push"],
    ["rm \\\n -rf ~/Documents/x", "rm"],
    ["rm -rf \\\n ~/Documents/x", "rm"],
    ["git reset \\\n --hard", "reset"],
    ["git commit -m x \\\n  --no-verify", "no-verify"],
    ["rsync -a ./x \\\n deploy@example.com:/var/www/", "remote-write"],
  ]) {
    assert.equal(classifyToolInput({ command: cmd })?.key, key, `未擋：${cmd.replace(/\n/g, "⏎")}`);
  }
  assert.equal(classifyCommand("rm -rf \\\n node_modules \\\n dist"), null, "接續行的可重生目錄照樣放行");
});

test("`<<<` 與算式裡的 `<<` 不是 heredoc：後面幾行不能被吃掉", () => {
  for (const cmd of [
    "cat <<< hello\nrm -rf docs",
    "grep x <<< \"$VAR\"\nrm -rf docs",
    "echo $((1<<X))\nrm -rf docs\nX",
    "(( n = 1 << 3 ))\nrm -rf docs\n3",
    "n=$((1<<EOF))\ngit push --force\nEOF",
  ]) {
    assert.ok(classifyCommand(cmd), `未擋：${cmd.replace(/\n/g, "⏎")}`);
  }
  // 真的 heredoc 照舊：內文是資料，結尾之後的指令照判
  assert.equal(classifyCommand("cat <<-EOF\n\trm -rf docs\n\tEOF\necho ok"), null);
  assert.ok(classifyCommand("cat <<'A' <<'B'\nx\nA\ny\nB\nrm -rf docs"), "兩個 heredoc 之後的指令照判");
});

test("heredoc 沒加引號時，內文裡的 $(…) 與反引號會執行，要判；加了引號＝純資料", () => {
  assert.equal(classifyCommand("cat <<EOF\n$(rm -rf docs)\nEOF")?.key, "rm");
  assert.equal(classifyCommand("cat > f <<EOF\n用 `git push --force` 會…\nEOF")?.key, "force-push");
  assert.equal(classifyCommand("cat <<'EOF'\n$(rm -rf docs) `git push --force`\nEOF"), null);
  assert.equal(classifyCommand("cat <<\\EOF\n$(rm -rf docs)\nEOF"), null);
  // 最常見的 commit 寫法：訊息裡提到被擋的字不算
  const commit = "git commit -m \"$(cat <<'EOF'\nfix: 不再用 git push --force 與 rm -rf docs\n\n改用 --amend 的說明\nEOF\n)\"";
  assert.equal(classifyCommand(commit), null);
  assert.equal(classifyCommand(`${commit} && git push --force`)?.key, "force-push", "heredoc 之後的指令照判");
});

test("force push 的其他寫法：refspec 前面的 +、--mirror、旗標縮寫", () => {
  for (const cmd of [
    "git push origin +main",
    "git push origin +HEAD:main",
    "git push origin '+refs/heads/*:refs/heads/*'",
    "git push --mirror",
    "git push --mirror backup",
    "git push --force-with-lease=main:abc origin main",
    "git push --force-with-l origin main",
    "git push -uf origin main",
    "/usr/bin/git push -f",
    "git -C /repo push origin +main",
  ]) {
    assert.equal(classifyCommand(cmd)?.key, "force-push", `未擋：${cmd}`);
  }
  for (const cmd of ["git push origin main:main", "git push -u origin feat", "git push origin v1.0+build", "git push --follow-tags"]) {
    assert.equal(classifyCommand(cmd), null, `誤擋：${cmd}`);
  }
});

test("commit 的 -n 併在其他短旗標裡也算；排在帶值旗標後面的字母是值", () => {
  for (const cmd of ["git commit -nm msg", "git commit -anm msg", "git commit -an -m msg", "git commit --no-veri -m x", "git commit -m x -n"]) {
    assert.equal(classifyCommand(cmd)?.key, "no-verify", `未擋：${cmd}`);
  }
  for (const cmd of [
    "git commit -mn",                 // 訊息就是 "n"
    "git commit -m -n",               // 訊息是 "-n"
    "git commit -am 'done'",
    "git commit -m 'run with -n'",
    "git commit --message '--no-verify 是什麼'",
    "git commit -F notes-n.txt",
    "git commit -m x -- -n",          // `--` 之後是路徑
  ]) {
    assert.equal(classifyCommand(cmd), null, `誤擋：${cmd}`);
  }
  assert.equal(classifyCommand("git commit --amen -m x")?.key, "amend", "git 接受 --amend 的唯一縮寫");
  assert.equal(classifyCommand("git reset --har")?.rule, "git reset --hard");
});

test("不在指令位置的字是資料：echo、commit 訊息、grep 的樣式、變數值都不命中", () => {
  for (const cmd of [
    "echo git push --force",
    "echo 'rm -rf /'",
    "echo \"git reset --hard 會丟改動\"",
    "git commit -m \"fix: remove --amend usage\"",
    "git commit -m \"docs; rm -rf note\"",
    "git commit -m 'a && git push --force'",
    "git commit -m \"revert --no-verify\" --allow-empty",
    "grep -n 'rm -rf' deploy.sh | head",
    "grep -rE \"git push --force|git clean -fd\" docs/",
    "printf '%s\\n' 'git branch -D x' > notes.txt",
    "MSG='git rebase main'; echo \"$MSG\"",
    "git log --grep='--amend'",
    "gh pr create --title 'ban git push --force' --body 'rm -rf is bad'",
    "ls # rm -rf docs",
    "rm -rf node_modules 2>/dev/null; npm ci",
    "rm -rf \"node_modules\" 'dist'",
  ]) {
    assert.equal(classifyCommand(cmd), null, `誤擋：${cmd}`);
  }
});

test("暫存區比整層名字與開頭，不比子字串；先解掉 .. 再比", () => {
  for (const cmd of [
    "rm -rf ~/Documents/scratchpad-notes",
    "rm -rf /Users/me/my-scratchpad/x",
    "rm -rf /data/scratchpadx/tmp",
    "rm -rf /tmp/claude-x/../../Users/me/Documents",
    "rm -rf /private/tmp/claude-501/../..",
    `rm -rf ${SCRATCH}/../../../../../../Users/me`,
    "rm -rf /x/scratchpad/../../etc",
    "rm -rf /var/tmp/claude-x",
    "rm -rf /tmp/claudex",
  ]) {
    assert.equal(classifyCommand(cmd, HOME_ENV)?.key, "rm", `未擋：${cmd}`);
  }
  for (const cmd of [
    `rm -rf ${SCRATCH}/a/../b`,
    `rm -rf "${SCRATCH}/with space"`,
    "rm -rf /tmp/claude-501/x",
    "rm -rf /work/scratchpad/out",
    "rm -rf scratchpad/out",
  ]) {
    assert.equal(classifyCommand(cmd, HOME_ENV), null, `誤擋：${cmd}`);
  }
  assert.equal(disposableTarget("node_modules/../src"), false, "解掉 .. 之後刪的是 src");
  assert.equal(disposableTarget("./dist/"), true);
});

test("路徑裡的變數：代得出來就照代入後的路徑判，代不出來一律問", () => {
  // 同一條指令裡先寫死的變數（實際用法：真實指令比對裡 200 多條都是這個寫法，舊版全部誤攔）
  for (const cmd of [
    `S=${SCRATCH}; rm -rf "$S/out"`,
    `S=${SCRATCH} && rm -rf $S/a $S/b`,
    `export S=${SCRATCH}\nrm -rf "\${S}/x"`,
    `SP=${SCRATCH}; W=$SP/work; rm -rf $W`,
    `D="${SCRATCH}/v1"; rm -rf "$D" && mkdir -p "$D"`,
  ]) {
    assert.equal(classifyCommand(cmd, HOME_ENV), null, `誤擋：${cmd}`);
  }
  for (const cmd of [
    "rm -rf $HOME/Documents/build",          // 環境變數不代，一律問
    "rm -rf \"$HOME\"/node_modules",
    "rm -rf ${HOME}/tmp",
    "rm -rf $UNKNOWN/build",                 // 代不出來
    "rm -rf \"$DIR\"/node_modules",
    "rm -rf \"$(pwd)/dist\"",
    "D=/Users/me/Documents; rm -rf $D/build",
    "D=; rm -rf \"$D/\"",                     // 空字串：實際刪的是 /
    `S=${SCRATCH}; S=/Users/me; rm -rf $S/x`, // 後寫的蓋掉先寫的
    `S=${SCRATCH} rm -rf $S/x`,               // 這種寫法 S 只給 rm 當環境，$S 代的是舊值
    "for d in a b; do rm -rf $d/node_modules; done",
  ]) {
    assert.equal(classifyCommand(cmd, HOME_ENV)?.key, "rm", `未擋：${cmd}`);
  }
  assert.ok(classifyCommand("rm -rf $UNKNOWN/build").why.includes("代不出來"), "確認框要講是變數代不出來");
  assert.equal(classifyCommand("rm -rf ~/Documents/build", HOME_ENV)?.key, "rm");
});

test("ssh 那頭的指令照同一套規則再判一次", () => {
  for (const [cmd, key] of [
    ["ssh host 'rm -rf ~/public_html/site'", "rm"],
    ["ssh host rm -rf /var/www", "rm"],
    ["ssh -p 2222 -o BatchMode=yes deploy@host \"cd ~/backups; rm -v a.sql; rm -rf old\"", "rm"],
    ["ssh host 'T=$(mktemp -d) && cp x $T && rm -rf $T'", "rm"],      // 那頭的變數這裡看不到
    ["scp a host:/tmp/ && ssh host 'cd /srv && git reset --hard'", "reset"],
    ["ssh host 'cd /srv && wp db import x.sql'", "remote-write"],
  ]) {
    assert.equal(classifyToolInput({ command: cmd })?.key, key, `未擋：${cmd}`);
  }
  for (const cmd of [
    "ssh host ls -la /var/www",
    "ssh host",
    "ssh -p 2222 host 'tail -n 50 log'",
    "ssh host 'rm -f /tmp/b.webp'",                                   // 清單檔照舊放行（2026-10-26 收窄）
    "ssh host 'cd /srv/app && rm -rf node_modules && npm ci'",
    "ssh host 'grep -c \"rm -rf\" deploy.sh'",
    "ssh-keygen -t ed25519 -f k",
  ]) {
    assert.equal(classifyToolInput({ command: cmd }), null, `誤擋：${cmd}`);
  }
});

test("指令本身放在變數裡：只有一個可能的值就攤開來判", () => {
  for (const [cmd, key] of [
    ["RM='rm -rf'; $RM docs", "rm"],
    ["G=git; $G push --force", "force-push"],
    ["SSH=\"ssh -o BatchMode=yes -o ConnectTimeout=12\"; $SSH host 'mkdir -p ~/up' && $SSH host \"cd /srv; rm -rf ~/up\"", "rm"],
    ["CMD=\"sudo rm\"; ${CMD} -rf /etc", "rm"],
  ]) {
    assert.equal(classifyToolInput({ command: cmd })?.key, key, `未擋：${cmd}`);
  }
  for (const cmd of ["X=ls; $X -la", "$UNKNOWN -rf docs", "SSH='ssh -o BatchMode=yes'; $SSH host ls", "PY=python3; $PY -c 'print(1)'"]) {
    assert.equal(classifyToolInput({ command: cmd }), null, `誤擋：${cmd}`);
  }
});

test("變數的值帶空白＝沒加引號時會被切成好幾個路徑，不放行", () => {
  for (const cmd of [
    `S="${SCRATCH}/a /Users/me"; rm -rf $S`,
    `S="${SCRATCH}/a /Users/me"; rm -rf $S/x`,
    `S='node_modules src'; rm -rf $S`,
    `A=${SCRATCH}; S="$A/x /etc"; rm -rf $S`,
  ]) {
    assert.equal(classifyCommand(cmd)?.key, "rm", `未擋：${cmd}`);
  }
  // 路徑字面上有空白（加了引號）照舊放行
  assert.equal(classifyCommand(`rm -rf "${SCRATCH}/with space"`), null);
  assert.equal(classifyCommand(`S=${SCRATCH}; rm -rf "$S/with space"`), null);
});

test("指令放在變數裡而且有好幾個可能的值：每個可能都判", () => {
  for (const [cmd, key] of [
    ["if [ -z \"$K\" ]; then SSH=ssh; else SSH=\"ssh -i k\"; fi; $SSH h 'rm -rf x'", "rm"],
    ["RM='rm -f'; [ -n \"$FORCE\" ] && RM='rm -rf'; $RM docs", "rm"],
    ["G=git; [ -x /opt/git ] && G=/opt/git; $G push --force", "force-push"],
  ]) {
    assert.equal(classifyToolInput({ command: cmd })?.key, key, `未擋：${cmd}`);
  }
  assert.equal(classifyToolInput({ command: "if [ -z \"$K\" ]; then SSH=ssh; else SSH=\"ssh -i k\"; fi; $SSH h 'ls -la'" }), null);
  assert.equal(classifyToolInput({ command: "L=ls; [ -n \"$A\" ] && L='ls -la'; $L docs" }), null);
});

test("環境變數不拿來代：hook 進程的環境不等於指令跑的時候的環境", () => {
  // 代錯的方向是「該問的沒問」，所以就算環境裡的值指向暫存區也不代。
  const env = configFromEnv({ HOME: SCRATCH, TMPDIR: SCRATCH, PWD: SCRATCH, S: SCRATCH });
  for (const cmd of ["rm -rf ~/x", "rm -rf $HOME/x", "rm -rf $TMPDIR/x", "rm -rf $PWD/x", "rm -rf $S/x", "cd /Users/me && rm -rf $PWD/x"]) {
    assert.equal(classifyCommand(cmd, env)?.key, "rm", `未擋：${cmd}`);
  }
  // 連寫死的 PWD 也不代：cd 之後 shell 自己會改它
  assert.equal(classifyCommand(`PWD=${SCRATCH}; cd /Users/me; rm -rf $PWD`)?.key, "rm");
});

test("變數寫死之後又被改掉：不能拿舊值放行", () => {
  for (const cmd of [
    `S=${SCRATCH}; for S in /Users/me/x; do rm -rf "$S"; done`,
    `S=${SCRATCH}; ls | while read S; do rm -rf "$S"; done`,
    `S=${SCRATCH}; read -r S < f; rm -rf "$S"`,
    `S=${SCRATCH}; IFS= read S; rm -rf $S`,
    `S=${SCRATCH}; unset S; rm -rf "$S/"`,
    `S=${SCRATCH}; printf -v S %s /Users/me; rm -rf $S`,
    `S=${SCRATCH}; S[0]=/Users/me; rm -rf $S`,
    `S=${SCRATCH}; f() { local S; rm -rf $S/x; }; f`,
    `S=${SCRATCH}; mapfile -t S < f; rm -rf $S`,
    `S=${SCRATCH}; source ./env.sh; rm -rf $S/x`,
    `S=${SCRATCH}; . ./env.sh; rm -rf $S/x`,
    `S=${SCRATCH}; eval "$(cat env)"; rm -rf $S/x`,
    "D=/Users/me/; D+=tmp; rm -rf $D",                          // += 是接在後面，不是蓋掉
    `S=/Users/me; [ -n "$CI" ] && S=${SCRATCH}; rm -rf $S/x`,   // 有條件的設值：兩個可能都要過關
    `if [ -d x ]; then S=${SCRATCH}; else S=/Users/me; fi; rm -rf $S/x`,
    `if [ -d x ]; then S=/Users/me; else S=${SCRATCH}; fi; rm -rf $S/x`,
    `S=/Users/me; (S=${SCRATCH}; true); rm -rf $S/x`,           // 子 shell 裡設的值出不來
    `(S=${SCRATCH}); rm -rf $S/x`,
    `echo $(S=${SCRATCH}); rm -rf $S/x`,
  ]) {
    assert.equal(classifyCommand(cmd)?.key, "rm", `未擋：${cmd}`);
  }
  for (const cmd of [
    `S=${SCRATCH}; (rm -rf $S/x)`,                               // 外層的值子 shell 看得到
    `S=${SCRATCH}; (S=$S/sub; rm -rf $S/x)`,
    `S=${SCRATCH}; S+=/more; rm -rf $S`,
    `WT=${SCRATCH}/a; rm -rf $WT; WT=${SCRATCH}/b; rm -rf $WT`,  // 設兩次，兩個值都在暫存區
    `S=${SCRATCH}; export S; rm -rf $S/x`,
    `S=${SCRATCH}; for f in a b; do echo $f; done; rm -rf $S/x`, // 迴圈改的是別的名字
    `S=${SCRATCH}; read -r LINE < f; rm -rf $S/x`,
  ]) {
    assert.equal(classifyCommand(cmd), null, `誤擋：${cmd}`);
  }
  assert.deepEqual(resolveRmTargets(`S=${SCRATCH}; rm -rf "$S/a" docs`), [
    { target: "$S/a", paths: [`${SCRATCH}/a`] },
    { target: "docs", paths: ["docs"] },
  ]);
  assert.equal(resolveRmTargets("rm -rf $NOPE/x")[0].paths, null);
});

test("拆不動的怪輸入不丟例外、不卡死", () => {
  for (const cmd of [
    "echo 'unterminated", "echo \"unterminated $(", "echo `", "cat <<", "cat <<EOF", "((", "$((", ")))", "a | | b",
    "\\", "<<<", "x=$(", "${", "'".repeat(999), "(".repeat(500), "$(".repeat(200) + "rm -rf docs",
  ]) {
    assert.doesNotThrow(() => classifyToolInput({ command: cmd }), cmd.slice(0, 20));
  }
  assert.deepEqual(parseShell("a 'b c' \"d $x\" e\\ f").commands[0].words, ["a", "b c", "d $x", "e f"]);
  assert.deepEqual(parseShell("a 2>&1 >out <in | b &> log").commands.map((c) => c.words), [["a"], ["b"]]);
});
