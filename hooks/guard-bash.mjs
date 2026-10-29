#!/usr/bin/env node
// PreToolUse(Bash) 攔不可逆指令。**這是 plugin 出貨的通用版**，由 hooks/hooks.json 掛上，
// 裝了 plugin 的 repo 全部生效。全域 CLAUDE.md 寫「不可逆操作先取得明確授權」是自律；本檔是機器保證。
// 規則的由來與放寬紀錄在 docs/decisions.md，本檔只寫現在擋什麼、放什麼。
//
// 觸發：每次 Bash 工具呼叫前，stdin 收 {tool_name, tool_input:{command}}。複合指令拆
// `&&`／`;`／`|`／換行逐段判，所以「cd 某處 && 接遞迴刪除」也抓得到。擋下＝exit 2，stderr 含理由＋替代指令。
//   · `git push --force`／`-f`／`--force-with-lease` — 改寫遠端歷史。**無例外**。
//     刪遠端分支（`--delete`／`:branch`）不擋：已合併的分支刪了什麼都沒丟。
//   · `git reset` 帶 mode 旗標（`--hard`／`--soft`／`--mixed`／`--keep`／`--merge`）— 丟改動或抹 commit
//     （共用 worktree，別線 session 可能正在寫）。**放行**不帶 mode 的 `git reset [HEAD] -- <檔>` 與 `git restore`。
//   · `git rebase` — 改寫既有 commit。**放行** `--abort`／`--continue`／`--skip`／`--quit`／`--edit-todo`。
//   · `git commit --amend` — 改寫上一個 commit。
//   · `git branch -D`（含 `--delete --force`）— 丟未合併 commit。**放行** `-d`（git 自己會拒絕刪未合併的）。
//   · `rm` 旗標同時含 r 與 f。**放行**（所有目標都符合才放）：(a) scratchpad（SCRATCHPAD_HINTS）；
//     (b) repo 內可重生目錄（DISPOSABLE_NAMES 與 `.tmp-*` 層名）。絕對路徑與帶 `..` 的相對路徑不吃 (b)。
//   · `git commit --no-verify`／`-n`、`git push --no-verify` — 拆掉 pre-commit／pre-push 那道防線。
//     **放行** `git push -n`（那是 `--dry-run`）。
//   · `git clean` 帶 force — 未追蹤檔救不回來。**放行** `-n`／`--dry-run`、不帶 force、`-X`（只刪 ignore 的
//     build 產物）；小寫 `-x` 照擋。
//   · **遠端寫入**（鍵 `remote-write`）— `rsync` 目的地是 `host:路徑`；`ssh`／`wp --ssh=…`／`wp @別名` 帶
//     `wp db import|reset|drop` 或 `wp search-replace`。**回 `ask` 不擋**（stdout 印 `permissionDecision: "ask"`、
//     exit 0）：部署是日常，要的是使用者看一眼目的地。官方文件寫明 `ask` 在 auto mode 仍會跳確認
//     （https://code.claude.com/docs/en/hooks）。**放行** `rsync -n`、拉回本機、`wp … db export` 這類讀取。
//     **不涵蓋** `scp`、遠端 `rm`／`mysql`、`ssh h < script.sh`、`ssh h bash -s`、`sftp`、`git push`。
//
// **擋下不等於不准做**——是不准由 agent 代下，取得授權後請使用者自己執行，或改用 hint 給的可逆路徑。
// 各類的正反例在 test/guard-bash.test.mjs。
//
// **逃生門 `CC_GUARD_BASH=off`**：整支停用。**只有使用者按得動**：讀 hook 進程自己的 `process.env`
//   （帳號層 `settings.json` 的 `env`，或啟動 Claude Code 時的環境）；agent 在指令前寫 `CC_GUARD_BASH=off`
//   只設到它自己的子 shell，本進程讀不到。設了要**重開 session** 才生效。
// **逐類放行與擴充**（同樣只有使用者設得了、要重開 session）：
//   · `CC_GUARD_BASH_ALLOW`：逗號分隔的類別鍵，列了的那類不擋。鍵：`force-push`、`no-verify`、`clean`、
//     `reset`、`rebase`、`amend`、`branch-force`、`rm`、`remote-write`。擋下訊息會印命中的鍵。
//   · `CC_GUARD_BASH_DISPOSABLE`：追加可重生目錄名（例 `obj,.build,Pods`），內建清單不因此縮小。
//
// **解析失敗一律放行（fail open）**：壞掉時最糟是「攔不到」，而不是「所有 Bash 呼叫都死」。
//
// 純函式 classifyCommand 對外 export，由 test/guard-bash.test.mjs 直接測。

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `a, b,,c` → ['a','b','c']。 */
const parseList = (value) => String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** rm -rf 可放行的第一類：暫存區。 */
export const SCRATCHPAD_HINTS = ['/scratchpad', '/private/tmp/claude-', '/tmp/claude-'];

/**
 * rm -rf 可放行的第二類：**可重生目錄**。刪掉它們損失的是機器產物，
 * 一道 build／install 就長回來，不是人寫的東西——擋它只是逼 agent 繞路，
 * 沒保護到任何東西。比對路徑裡的**任一層**（所以 `dist/*`、
 * `node_modules/.cache` 也算），不是只比最後一層。
 */
export const DISPOSABLE_NAMES = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.turbo', '.cache', '.parcel-cache', '.svelte-kit',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',
  '.venv', 'venv', 'target', '.gradle', '.tox',
]);

/** `.tmp-size`／`tmp`／`temp-out` 這種一看就是暫存的層名，比照可重生目錄放行。 */
const TMP_SEGMENT = /^\.?(tmp|temp)([-_.].*)?$/i;

const SEGMENT_SPLIT = /(?:&&|\|\||[;\n|])/;

/** 會把真正的指令包在後面的外包指令，判定前先剝掉。 */
export const WRAPPERS = new Set(['sudo', 'xargs', 'env', 'time', 'nohup', 'nice', 'command', 'exec', '-0', '-n1', '-I{}']);

/** git reset 的 mode 旗標。帶其中任一＝動 HEAD 或動工作區，不是單純 unstage。 */
const RESET_MODES = new Set(['--hard', '--soft', '--mixed', '--keep', '--merge']);

/** rebase 進行中的收拾動作。擋這些等於把人鎖死在 rebase 中途，一律放行。 */
const REBASE_ESCAPES = new Set(['--abort', '--continue', '--skip', '--quit', '--edit-todo', '--show-current-patch']);

/**
 * 取 git 子命令：第一個非旗標的 token。`git -C <path> commit`／`git -c k=v commit`
 * 這些前置旗標會吃掉下一個 token，不跳過的話會把路徑當成子命令。
 * 回 null＝這段不是 git 指令。
 */
export function gitSubcommand(tokens) {
  const idx = tokens.findIndex((t) => t === 'git' || t.endsWith('/git'));
  if (idx === -1) return null;
  for (let i = idx + 1; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t === '-c' || t === '-C' || t === '--git-dir' || t === '--work-tree') {
      i += 1;
      continue;
    }
    if (t.startsWith('-')) continue;
    return t;
  }
  return null;
}

/** 短旗標（單一 `-` 開頭、只有字母）裡是否含指定字母。`--show-current` 這種長旗標不算。 */
function hasShortFlag(tokens, letters) {
  return tokens.some((t) => /^-[A-Za-z]+$/.test(t) && [...letters].some((c) => t.includes(c)));
}

function looksScratchpad(arg) {
  return SCRATCHPAD_HINTS.some((hint) => arg.includes(hint));
}

/**
 * 這個 rm 目標可不可以放行。scratchpad ＝可以；repo 內的可重生目錄＝可以；其餘擋。
 *
 * **絕對路徑與帶 `..` 的相對路徑不吃名字白名單**：`/var/tmp`、`../../node_modules`
 * 的層名雖然在清單裡，但目標在當前 repo 外，那是另一回事。
 */
export function disposableTarget(arg, extra = []) {
  if (looksScratchpad(arg)) return true;
  if (arg.startsWith('/') || arg.startsWith('~')) return false;
  const segments = arg.replace(/\/+$/, '').split('/').filter(Boolean);
  if (segments.includes('..')) return false;
  return segments.some((seg) => DISPOSABLE_NAMES.has(seg) || extra.includes(seg) || TMP_SEGMENT.test(seg));
}

/** rm 的旗標同時含 r 與 f（含 -rf／-fr／-r -f／--recursive --force）才算不可逆遞迴刪除。 */
function recursiveForce(tokens) {
  let recursive = false;
  let force = false;
  for (const t of tokens) {
    if (t === '--recursive') recursive = true;
    else if (t === '--force') force = true;
    else if (/^-[A-Za-z]+$/.test(t)) {
      if (t.includes('r') || t.includes('R')) recursive = true;
      if (t.includes('f')) force = true;
    }
  }
  return recursive && force;
}

/**
 * 判一段（單一）指令該不該擋。回 null＝放行。
 * 回 { rule, why, hint } ＝擋，三個欄位都會進 stderr 給模型看。
 */
export function classifySegment(segment, opts = {}) {
  const cmd = segment.trim();
  if (!cmd) return null;
  const tokens = cmd.split(/\s+/);
  const allow = opts.allow ?? new Set();
  // 使用者在 CC_GUARD_BASH_ALLOW 放行的類別直接跳過，繼續判下一類（同一段可能同時命中兩類）。
  const block = (key, hit) => (allow.has(key) ? null : { key, ...hit });

  const sub = gitSubcommand(tokens);
  const AUTHORIZE = '要做請先取得使用者**當輪**明確授權，並由使用者自己下這道指令';

  // 1. 遠端不可逆變更：強制推送（刪遠端分支不擋，見檔頭）
  if (sub === 'push') {
    const hit = tokens.some((t) => t === '--force' || t.startsWith('--force-with-lease') || /^-[A-Za-z]*f[A-Za-z]*$/.test(t))
      && block('force-push', {
        rule: 'git push --force',
        why: '改寫遠端歷史，別線 session 已 pull 的 commit 會憑空消失，且無法從本地還原。',
        hint: `${AUTHORIZE}。想撤回內容改用 \`git revert\` 疊新 commit。`,
      });
    if (hit) return hit;
  }

  // 2. 繞過閘：--no-verify。commit 的 `-n` 是它的簡寫，push 的 `-n` 是 --dry-run（放行）。
  if (sub === 'commit' || sub === 'push') {
    const noVerify = tokens.includes('--no-verify') || (sub === 'commit' && tokens.includes('-n'));
    const hit = noVerify && block('no-verify', {
        rule: `git ${sub} --no-verify`,
        why: '繞過 pre-commit／pre-push 閘，等於把該 repo 的文件與測試防線整條關掉，而且事後看不出這個 commit 沒過閘。',
        hint: `閘紅就修紅的那件事，或把它拆成過得了閘的小 commit。閘本身壞了（誤判、環境缺件）就修閘並在收尾點名。真要跳過，${AUTHORIZE}。`,
      });
    if (hit) return hit;
  }

  // 3. git clean 帶 force：刪未追蹤檔，git 救不回來。
  if (sub === 'clean') {
    // -n 可能併在合旗標裡（`-fdn`），git 自己也是 dry-run 勝出，所以用 hasShortFlag 而非 includes。
    const dryRun = tokens.includes('--dry-run') || hasShortFlag(tokens, 'n');
    const forced = tokens.includes('--force') || hasShortFlag(tokens, 'f');
    // **`-X` 放行**：大寫 X ＝只刪被 .gitignore 忽略的檔，那就是 build／install 產物，
    // 跟已經放行的 `rm -rf node_modules`／`dist` 同一類，擋它只是逼 agent 改用 rm 繞路。
    // **小寫 `-x` 不放行**：它是「忽略 ignore 規則」，刪得比預設更多，意思剛好相反。
    // `-X` 沒有長旗標（`git clean -h` 實測），所以只比短旗標，且 hasShortFlag 區分大小寫。
    const ignoredOnly = hasShortFlag(tokens, 'X');
    const hit = forced && !dryRun && !ignoredOnly && block('clean', {
        rule: 'git clean -f',
        why: '刪掉未追蹤檔案，它們從來沒進 git object store，所以 git 救不回來；本 repo 是共用 worktree，那些檔可能是別線 session 還沒 add 的產出。',
        hint: `先看會刪什麼：\`git clean -n -d\`（只列不刪，本 hook 放行）。只想清 build 產物用 \`git clean -fdX\`（只刪被 .gitignore 忽略的檔，本 hook 放行）。真要整包刪，${AUTHORIZE}。`,
      });
    if (hit) return hit;
  }

  // 4. git reset 帶 mode 旗標。不帶＝純 unstage，放行。
  if (sub === 'reset') {
    const mode = tokens.find((t) => RESET_MODES.has(t));
    const hit = (mode === '--hard' || mode === '--merge' || mode === '--keep')
      ? block('reset', {
        rule: `git reset ${mode}`,
        why: '會丟掉未提交的工作區改動，而工作區可能有別線 session 正在寫的檔（本 repo 是共用 worktree）。',
        hint: `先看有什麼會被丟：\`git status --short\`。只想丟單檔用 \`git restore -- <檔>\`。真要整包丟，${AUTHORIZE}。`,
      })
      : mode && block('reset', {
        rule: `git reset ${mode}`,
        why: '移動 HEAD 會抹掉既有 commit，別線 session 可能已經以它為基準（本 repo 是共用 worktree）。',
        hint: `想撤回已 commit 的內容用 \`git revert\` 疊新 commit；只想 unstage 用 \`git reset -- <檔>\`（不帶 mode 旗標，本 hook 放行）。真要動 HEAD，${AUTHORIZE}。`,
      });
    if (hit) return hit;
  }

  // 5. git rebase（中途收拾動作放行）
  if (sub === 'rebase' && !tokens.some((t) => REBASE_ESCAPES.has(t))) {
    const hit = block('rebase', {
      rule: 'git rebase',
      why: '改寫既有 commit 的 SHA，別線 session 或已推出去的分支會對不上（本 repo 是共用 worktree）。',
      hint: `要併歷史用 \`git merge\`；要改內容疊新 commit。真要 rebase，${AUTHORIZE}。（\`--abort\`／\`--continue\`／\`--skip\` 本 hook 放行）`,
    });
    if (hit) return hit;
  }

  // 6. 改寫上一個 commit
  if (sub === 'commit' && tokens.includes('--amend')) {
    const hit = block('amend', {
      rule: 'git commit --amend',
      why: '改寫上一個 commit 的 SHA，若它已推出去或已被別線 session 當基準就會對不上。',
      hint: `補內容或修訊息就多打一個 commit（\`fixup:\` 前綴）。真要改寫，${AUTHORIZE}。`,
    });
    if (hit) return hit;
  }

  // 7. 強制刪本地分支。
  // **`-d`／`--delete` 放行**：git 自己就會拒絕刪未合併的分支（`error: the branch 'x' is not
  // fully merged`），所以「可能丟掉未合併 commit」這個風險 git 已經守住了，本 hook 再擋一次
  // 只是把清 merged 分支這種日常動作卡死。**`-D`／`--delete --force` 照擋**——那正是叫 git
  // 別守的寫法。`git branch -d -r origin/x` 只刪遠端追蹤參照（本地快取），不碰遠端，同樣放行。
  const branchForced = hasShortFlag(tokens, 'D')
    || (tokens.includes('--delete') && (tokens.includes('--force') || hasShortFlag(tokens, 'f')));
  if (sub === 'branch' && branchForced) {
    const hit = block('branch-force', {
      rule: 'git branch -D',
      why: '強制刪分支會連帶丟掉只存在該分支上的未合併 commit——`-D` 就是叫 git 跳過「未合併」那道檢查。',
      hint: `先確認已合併：\`git branch --merged\`。已合併的用 \`git branch -d\`（本 hook 放行，git 自己會守住未合併的）。真要強制刪，${AUTHORIZE}。`,
    });
    if (hit) return hit;
  }

  // 8. rm -rf（scratchpad 放行）
  // 先剝掉外包指令：`xargs rm -rf …`／`sudo rm -rf …` 的第一個 token 不是 rm，
  // 只看 tokens[0] 會整個漏掉（本檔測試第一次跑就是漏在 `ls | xargs rm -rf /x`）。
  const bare = tokens.filter((t) => !WRAPPERS.has(t));
  if (bare[0] === 'rm') {
    if (recursiveForce(bare)) {
      const targets = bare.slice(1).filter((t) => !t.startsWith('-'));
      const extra = opts.disposable ?? [];
      const allDisposable = targets.length > 0 && targets.every((t) => disposableTarget(t, extra));
      if (!allDisposable) {
        const blocked = targets.filter((t) => !disposableTarget(t, extra));
        const hit = block('rm', {
          rule: 'rm -rf',
          why: `不可逆遞迴刪除，目標既不在 scratchpad 也不是可重生目錄（${blocked.join(' ') || '未指定路徑'}）。`,
          hint: `暫存檔放 scratchpad（路徑含 ${SCRATCHPAD_HINTS.join(' 或 ')}）或取名 \`.tmp-*\`，本 hook 放行；\`node_modules\`／\`dist\` 這類可重生目錄也放行。版控檔用 \`git rm\`。其餘先問使用者。`,
        });
        if (hit) return hit;
      }
    }
  }

  return null;
}

/**
 * 去掉 heredoc 的**內容**，只留開頭那行。
 *
 * 為什麼需要：heredoc body 是資料不是指令。本檔第一次上線就被自己擋下——
 * 當時在寫 hook 說明文件，內文舉例寫了一段被擋指令的字面文字，
 * heredoc body 被當成指令解析、當場命中。這類誤判會逼人用 --no-verify 或繞路，
 * 等於把閘拆了，所以修在解析層而不是放寬規則。
 */
export function stripHeredocs(command) {
  const lines = String(command ?? '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    out.push(line);
    const opener = /<<-?\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
    i += 1;
    if (!opener) continue;
    const delim = opener[2];
    while (i < lines.length && lines[i].trim() !== delim) i += 1;
    if (i < lines.length) i += 1; // 跳過結尾的 delimiter 行本身
  }
  return out.join('\n');
}

/** 拆複合指令逐段判——`cd x && <遞迴刪除>` 這種靠只看首個 token 是抓不到的。 */
export function classifyCommand(command, opts = {}) {
  for (const segment of stripHeredocs(command).split(SEGMENT_SPLIT)) {
    const hit = classifySegment(segment, opts);
    if (hit) return hit;
  }
  return null;
}

/**
 * 整個 tool_input 一起判：先跑逐段的 classifyCommand，再跑整條判的遠端寫入。
 * 回 null＝放行；回 { rule, why, hint }＝擋；帶 `decision: 'ask'`＝要使用者確認。
 */
export function classifyToolInput(toolInput, opts = {}) {
  const command = toolInput?.command;
  if (typeof command !== 'string') return null;
  return classifyCommand(command, opts) ?? classifyRemoteWrite(command, opts);
}

/** `host:路徑`／`user@host:路徑`／`host::module`／`rsync://`。`./a:b`、`/x:y` 這種本機路徑不算。 */
const REMOTE_SPEC = /^(?:rsync:\/\/|(?:[\w.-]+@)?[\w.-]+::?)/;

/** 遠端那頭會整批改寫資料庫的動作。只收事故實際出現過的，不追全部（見檔頭「不涵蓋」）。 */
const REMOTE_WRITE_ACTION = /\bwp\s[^|;&]*?\b(?:db\s+(?:import|reset|drop)|search-replace)\b/;

/**
 * 遠端寫入類（見檔頭）。整條指令一起判：`ssh h 'cd x && wp db import y'` 的引號內容會被
 * SEGMENT_SPLIT 拆散，逐段判會把 `wp db import` 當成本機指令。回 null＝放行；回帶
 * `decision: 'ask'` 的 hit ＝要使用者確認。
 */
export function classifyRemoteWrite(command, opts = {}) {
  if (opts.allow?.has('remote-write')) return null;
  const text = stripHeredocs(command);
  const segments = text.split(SEGMENT_SPLIT);
  const hit = (rule, target) => ({
    key: 'remote-write',
    decision: 'ask',
    rule,
    why: `往別台主機寫入（${target}），寫錯目的地會蓋掉別人的站或資料庫，本機 git 救不回來。`,
    hint: '先確認目的地現況（啟用主題、文章數、最近修改時間）再請使用者按確認；rsync 可先帶 `-n` 預演（本 hook 放行）。',
  });

  for (const segment of segments) {
    const tokens = segment.trim().split(/\s+/).filter((t) => !WRAPPERS.has(t)).map((t) => t.replace(/^["']|["']$/g, ''));
    const head = tokens[0]?.split('/').pop();
    if (head === 'rsync') {
      if (tokens.includes('--dry-run') || hasShortFlag(tokens, 'n')) continue;
      const dest = tokens.slice(1).filter((t) => !t.startsWith('-')).pop();
      if (dest && REMOTE_SPEC.test(dest)) return hit(`${head} → 遠端`, dest);
    }
    if (head === 'wp' && tokens.some((t) => t.startsWith('--ssh=') || /^@[\w.-]+$/.test(t)) && REMOTE_WRITE_ACTION.test(segment)) {
      return hit('wp 遠端寫入', tokens.find((t) => t.startsWith('--ssh=') || t.startsWith('@')));
    }
  }

  // ssh：從 ssh 那個字開始看到結尾，引號內被拆開的遠端指令一起算進去。
  // 寧可多問：ssh 之後同一條指令裡的本機寫入也會命中，代價只是按一下確認。
  const ssh = /(?:^|[\s;&|(])ssh\s([\s\S]*)$/.exec(text);
  if (ssh && REMOTE_WRITE_ACTION.test(ssh[1])) {
    return hit('ssh 遠端寫入', ssh[1].trim().split(/\s+/).find((t) => !t.startsWith('-')) ?? 'ssh');
  }
  return null;
}

/**
 * 使用者設定 → 各 classify 函式的 opts。只讀 hook 進程自己的環境（理由同逃生門，見檔頭）。
 * 全部沒設＝跟以前完全一樣。
 */
export function configFromEnv(env = {}) {
  return {
    allow: new Set(parseList(env.CC_GUARD_BASH_ALLOW)),
    disposable: parseList(env.CC_GUARD_BASH_DISPOSABLE),
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  // 逃生門，見檔頭。**只認 hook 進程自己的環境變數**——agent 在 Bash 指令前面塞
  // `CC_GUARD_BASH=off …` 沒有用，那是它自己那個子 shell 的環境，這支進程讀不到。
  if (process.env.CC_GUARD_BASH === 'off') return 0;

  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    return 0; // fail open，見檔頭
  }
  const command = payload?.tool_input?.command;
  if (typeof command !== 'string') return 0;

  const opts = configFromEnv(process.env);
  const hit = classifyToolInput(payload.tool_input, opts);
  if (!hit) return 0;

  // 遠端寫入類：不擋，交給使用者確認（理由見檔頭）。reason 會顯示在確認框給使用者看。
  if (hit.decision === 'ask') {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: `${hit.rule}：${hit.why} ${hit.hint}`,
      },
    }));
    return 0;
  }

  console.error(`⛔ PreToolUse 擋下：${hit.rule}（harness W7.3）`);
  console.error(`   指令：${command.length > 200 ? `${command.slice(0, 200)}…` : command}`);
  console.error(`   為什麼擋：${hit.why}`);
  console.error(`   怎麼走：${hit.hint}`);
  console.error('   規則出處：本檔檔頭註解。要放寬得改本檔，不是繞過。');
  // 印實際路徑，家目錄縮成 ~；設了 CLAUDE_CONFIG_DIR 就印那個目錄。
  const home = process.env.HOME;
  const cfg = process.env.CLAUDE_CONFIG_DIR || (home ? join(home, '.claude') : '~/.claude');
  const settings = join(home && cfg.startsWith(`${home}/`) ? `~${cfg.slice(home.length)}` : cfg, 'settings.json');
  console.error(`   若這是誤擋：請使用者在 ${settings} 的 env 設 "CC_GUARD_BASH_ALLOW": "${hit.key}"（只放行這一類）或 "CC_GUARD_BASH": "off"（整支停用），並重開 session（只有使用者設得了，agent 設不了）。`);
  return 2; // PreToolUse：exit 2 ＝ 阻擋，stderr 回給模型
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code));
}
