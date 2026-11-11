#!/usr/bin/env node
// PreToolUse(Bash) 不可逆指令先跳確認框。**這是 plugin 出貨的通用版**，由 hooks/hooks.json 掛上，
// 裝了 plugin 的 repo 全部生效。全域 CLAUDE.md 寫「不可逆操作先取得明確授權」是自律；本檔是機器保證。
// 規則的由來與放寬紀錄在 docs/decisions.md，本檔只寫現在攔什麼、放什麼。
//
// 觸發：每次 Bash 工具呼叫前，stdin 收 {tool_name, tool_input:{command}}。
// **照 shell 的讀法拆指令再判**（parseShell）：引號裡的字是資料不是指令、反斜線換行接成同一行、
// `&&`／`;`／`|`／`&`／換行／`( )`／`{ }` 各自成段，`$(…)`／反引號／`<(…)` 裡的指令也拆出來判。
// 判的是**排在指令位置的那個字**：前面的 `FOO=1`、`sudo -u root`、`env`、`xargs -n 1`、`nice -n 10`、
// `timeout 5` 這類外包先剝掉，`/bin/rm` 只看檔名；`bash -c '…'`、`eval …`、`bash <<EOF`、`ssh 主機 '…'` 的內文再拆一層。
// 所以 `echo git push --force`、commit 訊息裡提到 `--amend` 不會命中（那些字不在指令位置）。
// 命中＝stdout 印 `permissionDecision: "ask"`、exit 0：跳確認框，理由＋替代做法寫在框裡，**使用者按允許才執行**、
// 按拒絕就不跑。官方文件寫明 `ask` 在 auto mode 仍會跳確認（https://code.claude.com/docs/en/hooks）。
//   · `git push --force`／`-f`／`--force-with-lease`／`--mirror`／refspec 前面帶 `+`（`+main`）— 改寫遠端歷史。
//     **無例外**。刪遠端分支（`--delete`／`:branch`）不擋：已合併的分支刪了什麼都沒丟。
//   · `git reset` 帶 mode 旗標（`--hard`／`--soft`／`--mixed`／`--keep`／`--merge`）— 丟改動或抹 commit
//     （共用 worktree，別線 session 可能正在寫）。**放行**不帶 mode 的 `git reset [HEAD] -- <檔>` 與 `git restore`。
//   · `git rebase` — 改寫既有 commit。**放行** `--abort`／`--continue`／`--skip`／`--quit`／`--edit-todo`。
//   · `git commit --amend` — 改寫上一個 commit。
//   · `git branch -D`（含 `--delete --force`）— 丟未合併 commit。**放行** `-d`（git 自己會拒絕刪未合併的）。
//   · `rm` 旗標同時含 r 與 f。**放行**（所有目標都符合才放）：(a) 暫存區——路徑先代入變數、解掉 `..`，
//     再看是不是以 SCRATCHPAD_PREFIXES 開頭，或有一層**剛好**叫 `scratchpad`；
//     (b) repo 內可重生目錄（DISPOSABLE_NAMES 與 `.tmp-*` 層名）。絕對路徑與帶 `..` 的相對路徑不吃 (b)。
//     路徑裡的變數：**只代同一條指令裡寫死的**（`D=/tmp/claude-1/x; rm -rf "$D"`），不讀環境變數。
//     同一個名字設過好幾次就每個值都要過關；被 `for`／`read`／`unset`／`source`／`eval` 動過、沒設過、
//     空字串、`$(…)`、`$HOME`、`~` 一律問——不知道刪的是哪裡。子 shell 裡設的值出不來。
//   · `git commit --no-verify`／`-n`（含併寫 `-nm`）、`git push --no-verify` — 拆掉 pre-commit／pre-push 那道防線。
//     **放行** `git push -n`（那是 `--dry-run`）。
//   · `git clean` 帶 force — 未追蹤檔救不回來。**放行** `-n`／`--dry-run`、不帶 force、`-X`（只刪 ignore 的
//     build 產物）；小寫 `-x` 照擋。
//   · **遠端寫入**（鍵 `remote-write`）— `rsync` 目的地是 `host:路徑`；`ssh`／`wp --ssh=…`／`wp @別名` 帶
//     `wp db import|reset|drop` 或 `wp search-replace`。要的是使用者看一眼目的地。
//     **放行** `rsync -n`、拉回本機、`wp … db export` 這類讀取。
//     **不涵蓋** `scp`、遠端 `mysql`、`ssh h < script.sh`、`ssh h bash -s`、`sftp`、`git push`。
//     遠端的 `rm -rf` 不算這一類，但 `ssh 主機 '…'` 的內文會照上面各類再判一次，所以照 `rm` 那類問；`rm -f` 放行。
//   · git 的長旗標接受唯一縮寫（`--amen`＝`--amend`），會擋的那幾個旗標連縮寫一起認。
//
// **拆不到的地方（照樣放行）**：script 檔的內容（`bash x.sh`）、別名與 shell 函式、管線餵給 shell 的字串
// （`echo … | sh`）、`find -exec`／`-delete`、其他語言的一行程式（`python -c`）。
//
// **確認框就是授權**：使用者當場按允許＝當輪明確授權，不必再由使用者自己下指令。
// 各類的正反例在 test/guard-bash.test.mjs。
//
// **逃生門 `CC_GUARD_BASH=off`**：整支停用。**只有使用者按得動**：讀 hook 進程自己的 `process.env`
//   （帳號層 `settings.json` 的 `env`，或啟動 Claude Code 時的環境）；agent 在指令前寫 `CC_GUARD_BASH=off`
//   只設到它自己的子 shell，本進程讀不到。設了要**重開 session** 才生效。
// **逐類放行與擴充**（同樣只有使用者設得了、要重開 session）：
//   · `CC_GUARD_BASH_ALLOW`：逗號分隔的類別鍵，列了的那類不跳確認框。鍵：`force-push`、`no-verify`、`clean`、
//     `reset`、`rebase`、`amend`、`branch-force`、`rm`、`remote-write`。確認框會印命中的鍵。
//   · `CC_GUARD_BASH_DISPOSABLE`：追加可重生目錄名（例 `obj,.build,Pods`），內建清單不因此縮小。
//
// **解析失敗一律放行（fail open）**：壞掉時最糟是「攔不到」，而不是「所有 Bash 呼叫都死」。
//
// 純函式 classifyCommand 對外 export，由 test/guard-bash.test.mjs 直接測。

import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `a, b,,c` → ['a','b','c']。 */
const parseList = (value) => String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** rm -rf 可放行的第一類：暫存區。絕對路徑以這些開頭（**解掉 `..` 之後**才比）。 */
export const SCRATCHPAD_PREFIXES = ['/private/tmp/claude-', '/tmp/claude-'];

/** 路徑裡有一層**剛好**叫這個名字也算暫存區。`scratchpad-notes` 不算——比整層，不比子字串。 */
export const SCRATCHPAD_DIRNAME = 'scratchpad';

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

// ───────────────────────── 把指令照 shell 的讀法拆開 ─────────────────────────

const BLANK = ' \t\r';
const WORD_END = ' \t\r\n;&|()<>';
/** `$(…)`／反引號／`<(…)` 在字裡留下的記號。裡面的指令已另外拆出來判；留 `$` 是讓路徑判定知道「這裡代不出來」。 */
const SUBSTITUTION = '$(…)';
const MAX_NESTING = 40;

/**
 * 把一條 shell 指令拆成「簡單指令」清單。回 `{ commands, bodies, parents }`：
 *   · commands：`[{ words, inputs, scope }]`。words ＝去掉引號後的每個字；inputs ＝餵給這個指令的
 *     heredoc 內文與 here-string（`[{ text }]`）。`$(…)`、反引號、`( )` 裡的指令也各自列一筆。
 *   · bodies：heredoc 內文（含結尾那行）在原字串裡的 `[start, end)`，給 stripHeredocs 用。
 *   · parents：每個指令的 `scope` 是它所在那層的編號；`parents[編號]` ＝外面那層（最外層是 -1）。
 *     `( )`、`$(…)`、反引號、`<(…)` 各開一層——裡面設的變數出不來，外面設的裡面看得到。
 *
 * 不是完整的 shell 文法，只做到「分得出哪個字排在指令位置、哪些字是資料」。遇到看不懂的
 * 寫法就照字面往下走，不丟例外。
 */
export function parseShell(source) {
  const src = String(source ?? '');
  const n = src.length;
  const commands = [];
  const bodies = [];
  let pending = []; // 看到 `<<EOF` 了、等下一個換行才讀內文的 heredoc
  const parents = [-1];
  let scope = 0;
  let nesting = 0;
  let i = 0;

  const skipBlanks = () => {
    while (i < n) {
      if (BLANK.includes(src[i])) i += 1;
      else if (src[i] === '\\' && src[i + 1] === '\n') i += 2;
      else break;
    }
  };

  /** i 指在 `(`，跳到對應的 `)` 之後。算式 `(( … ))`／`$(( … ))` 用：裡面的 `<<` 是位移不是 heredoc。 */
  const skipBalanced = () => {
    let level = 0;
    while (i < n) {
      if (src[i] === '(') level += 1;
      else if (src[i] === ')') {
        level -= 1;
        if (level <= 0) { i += 1; return; }
      }
      i += 1;
    }
  };

  /** `$'…'`：i 指在開頭引號之後。 */
  const ansiQuote = () => {
    let text = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\' && i + 1 < n) { text += src[i + 1]; i += 2; continue; }
      i += 1;
      if (c === "'") break;
      text += c;
    }
    return text;
  };

  /** 雙引號：i 指在開頭引號之後。裡面的 `$(…)` 與反引號照樣會執行，拆出來。 */
  const doubleQuote = () => {
    let text = '';
    while (i < n) {
      const c = src[i];
      if (c === '"') { i += 1; break; }
      if (c === '\\') {
        const d = src[i + 1];
        if (d === '\n') { i += 2; continue; }
        if (d !== undefined && '$`"\\'.includes(d)) { text += d; i += 2; continue; }
        text += c; i += 1; continue;
      }
      if (c === '`') { i += 1; list('`'); text += SUBSTITUTION; continue; }
      if (c === '$' && src[i + 1] === '(') {
        if (src[i + 2] === '(') { const start = i; i += 1; skipBalanced(); text += src.slice(start, i); continue; }
        i += 2; list(')'); text += SUBSTITUTION; continue;
      }
      text += c; i += 1;
    }
    return text;
  };

  /** 讀一個字（去引號）。停在沒被引號包住的空白或運算符號。 */
  const word = (closer) => {
    let text = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\') {
        if (src[i + 1] === '\n') { i += 2; continue; } // 反斜線換行＝接成同一行
        if (i + 1 < n) text += src[i + 1];
        i += 2; continue;
      }
      if (c === "'") {
        const close = src.indexOf("'", i + 1);
        const end = close === -1 ? n : close;
        text += src.slice(i + 1, end);
        i = Math.min(end + 1, n); continue;
      }
      if (c === '"') { i += 1; text += doubleQuote(); continue; }
      if (c === '`') {
        if (closer === '`') break;
        i += 1; list('`'); text += SUBSTITUTION; continue;
      }
      if (c === '$') {
        const d = src[i + 1];
        if (d === '(' && src[i + 2] === '(') { const start = i; i += 1; skipBalanced(); text += src.slice(start, i); continue; }
        if (d === '(') { i += 2; list(')'); text += SUBSTITUTION; continue; }
        if (d === "'") { i += 2; text += ansiQuote(); continue; }
        if (d === '{') {
          const close = src.indexOf('}', i);
          const end = close === -1 ? n : close + 1;
          text += src.slice(i, end); i = end; continue;
        }
        text += c; i += 1; continue;
      }
      if ((c === '<' || c === '>') && src[i + 1] === '(') { i += 2; list(')'); text += SUBSTITUTION; continue; }
      if (WORD_END.includes(c)) break;
      text += c; i += 1;
    }
    return text;
  };

  /** heredoc 內文沒加引號的 delimiter：內文裡的 `$(…)` 與反引號照樣會執行，拆出來。 */
  const scanSubstitutions = (start, end) => {
    let p = start;
    while (p < end) {
      const c = src[p];
      if (c === '\\') { p += 2; continue; }
      if (c === '$' && src[p + 1] === '(' && src[p + 2] !== '(') { i = p + 2; list(')'); p = Math.max(i, p + 2); continue; }
      if (c === '`') { i = p + 1; list('`'); p = Math.max(i, p + 1); continue; }
      p += 1;
    }
  };

  /** 剛吃掉一個換行：把排隊中的 heredoc 內文讀完。內文是資料，整段跳過不當指令拆。 */
  const readBodies = () => {
    const docs = pending;
    pending = [];
    for (const doc of docs) {
      const start = i;
      let end = n;
      let next = n;
      let pos = i;
      while (pos < n) {
        let eol = src.indexOf('\n', pos);
        if (eol === -1) eol = n;
        let line = src.slice(pos, eol);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (doc.stripTabs) line = line.replace(/^\t+/, '');
        if (line === doc.delim) { end = pos; next = Math.min(eol + 1, n); break; }
        pos = eol + 1;
      }
      bodies.push([start, next]);
      doc.command.inputs.push({ text: src.slice(start, end) });
      if (!doc.quoted) scanSubstitutions(start, end);
      i = next;
    }
  };

  /** i 指在 `<` 或 `>`：吃掉整個轉向（含目標），heredoc 與 here-string 記在這個指令上。 */
  const redirect = (cur, closer) => {
    if (src.startsWith('<<<', i)) { // here-string：後面那個字是資料，不是 heredoc 開頭
      i += 3; skipBlanks();
      cur.inputs.push({ text: word(closer) });
      return;
    }
    if (src.startsWith('<<', i)) {
      i += 2;
      const stripTabs = src[i] === '-';
      if (stripTabs) i += 1;
      skipBlanks();
      const start = i;
      const delim = word(closer);
      if (i > start) {
        pending.push({ delim, stripTabs, quoted: /['"\\]/.test(src.slice(start, i)), command: cur });
        cur.docs += 1;
      }
      return;
    }
    i += 1;
    while (i < n && '>|&'.includes(src[i])) i += 1;
    skipBlanks();
    word(closer); // 轉向目標：不是指令的參數，丟掉（裡面的 $(…) 仍會被拆出來）
  };

  /** 讀一串指令，直到 closer（`)` 或反引號）或結尾。 */
  function list(closer) {
    nesting += 1;
    const outer = scope;
    if (closer) { parents.push(scope); scope = parents.length - 1; }
    let cur = { words: [], inputs: [], docs: 0, scope };
    const flush = () => {
      if (cur.words.length || cur.inputs.length || cur.docs) commands.push(cur);
      cur = { words: [], inputs: [], docs: 0, scope };
    };
    while (i < n && nesting <= MAX_NESTING) {
      const c = src[i];
      if (closer && c === closer) { i += 1; break; }
      if (c === '\n') { i += 1; flush(); readBodies(); continue; }
      if (BLANK.includes(c)) { i += 1; continue; }
      if (c === '\\' && src[i + 1] === '\n') { i += 2; continue; }
      if (c === '#') { while (i < n && src[i] !== '\n') i += 1; continue; }
      if (c === ';') { i += 1; flush(); continue; }
      if (c === '&') {
        if (src[i + 1] === '>') { i += 2; if (src[i] === '>') i += 1; skipBlanks(); word(closer); continue; }
        i += src[i + 1] === '&' ? 2 : 1; flush(); continue;
      }
      if (c === '|') { i += (src[i + 1] === '|' || src[i + 1] === '&') ? 2 : 1; flush(); continue; }
      if (c === '(') {
        flush();
        if (src[i + 1] === '(') { skipBalanced(); continue; }
        i += 1; list(')'); continue;
      }
      if (c === ')') { i += 1; flush(); continue; }
      if ((c === '<' || c === '>') && src[i + 1] !== '(') { redirect(cur, closer); continue; }
      const before = i;
      const text = word(closer);
      if (i === before) { i += 1; continue; } // 沒前進就硬跳一格，保證不會卡死
      // `2>&1` 的 2 是檔案代號，不是參數
      if (/^\d+$/.test(text) && (src[i] === '<' || src[i] === '>') && src[i + 1] !== '(') { redirect(cur, closer); continue; }
      cur.words.push(text);
    }
    flush();
    scope = outer;
    nesting -= 1;
  }

  list(null);
  return { commands, bodies, parents };
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
  const src = String(command ?? '');
  const ranges = parseShell(src).bodies.sort((a, b) => a[0] - b[0]);
  let out = '';
  let at = 0;
  for (const [start, end] of ranges) {
    if (start < at) continue; // 內文裡又拆出來的巢狀範圍，外層已經整段去掉了
    out += src.slice(at, start);
    at = end;
  }
  return out + src.slice(at);
}

// ───────────────────────── 找出排在指令位置的那個字 ─────────────────────────

const baseName = (word) => String(word ?? '').split('/').pop();

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)(\+?)=([\s\S]*)$/;
/** `S[0]=x`：陣列的一格。不追陣列內容，只知道這個名字被動過。 */
const ARRAY_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)\[[^\]]*\]\+?=/;

/** 排在真正指令前面的 shell 關鍵字，剝掉再判（`then rm -rf …`、`{ rm -rf …; }`）。 */
const KEYWORDS = new Set(['if', 'then', 'elif', 'else', 'while', 'until', 'do', '!', '{', '}']);

/** `export A=1` 這類只設變數、不跑別的指令的內建。 */
const DECLARES = new Set(['export', 'local', 'declare', 'typeset', 'readonly']);

/**
 * 會把真正的指令包在後面的外包指令，判定前先剝掉。
 * valued ＝「值寫在下一個字」的選項（`sudo -u root`、`xargs -n 1`），要連值一起跳；
 * positional ＝選項之後還要跳幾個字（`timeout 5 rm …` 的 5）。
 */
export const WRAPPERS = {
  sudo: { valued: ['-u', '-g', '-h', '-p', '-U', '-C', '-D', '-R', '-T', '-r', '-t', '--user', '--group', '--host', '--prompt', '--chdir', '--chroot'] },
  doas: { valued: ['-u', '-C'] },
  env: { valued: ['-u', '-C', '-P', '-S', '--unset', '--chdir'] },
  xargs: { valued: ['-n', '-I', '-P', '-L', '-s', '-E', '-d', '-a', '-J', '-R', '-S'] },
  nice: { valued: ['-n'] },
  time: { valued: ['-f', '-o'] },
  timeout: { valued: ['-s', '-k'], positional: 1 },
  gtimeout: { valued: ['-s', '-k'], positional: 1 },
  stdbuf: { valued: ['-i', '-o', '-e'] },
  ionice: { valued: ['-c', '-n', '-p'] },
  caffeinate: { valued: ['-t', '-w'] },
  exec: { valued: ['-a'] },
  nohup: {}, command: {}, builtin: {}, noglob: {}, setsid: {},
};

/** 會把字串當指令跑的 shell。`-c` 後面的字串、餵進去的 heredoc 都要再拆一層。 */
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish']);

/** ssh 自己的選項裡，值寫在下一個字的那幾個。跳過它們才找得到主機名，主機名後面就是要在那頭跑的指令。 */
const SSH_VALUED = new Set(['-B', '-b', '-c', '-D', '-E', '-e', '-F', '-I', '-i', '-J', '-L', '-l', '-m', '-O', '-o', '-p', '-Q', '-R', '-S', '-W', '-w']);

/** `bash -c "bash -c '…'"` 最多往裡拆幾層。 */
const MAX_DEPTH = 4;

/** shell 自己會改的變數：寫死也不算數（`cd` 之後 `$PWD` 就變了）。 */
const SHELL_OWNED = new Set(['PWD', 'OLDPWD', 'REPLY', 'OPTARG', 'OPTIND', 'RANDOM', 'SECONDS', 'LINENO', '_']);

/** 會把外面來的值塞進變數的內建。塞進去的值看不到，那個名字從此代不出來。 */
const REBINDERS = new Set(['read', 'unset', 'mapfile', 'readarray', 'getopts']);

/** 會跑一段看不到的內容（可能改任何變數）的內建。之後這一層的變數全部不代。 */
const OPAQUE = new Set(['source', '.', 'eval']);

/**
 * 一層 shell 裡看得到的變數。**只記同一條指令裡寫死的**（`S=/tmp/claude-1/x`），不讀環境變數——
 * hook 進程的環境不等於那條指令跑的時候的環境，而代錯的方向是「該問的沒問」。
 *
 * 一個名字記的是**所有設過的值**，不是最後一個：`[ -n "$X" ] && S=/a` 這種有條件的設值，
 * 看字面分不出哪一個生效，所以每個可能都要過關才放行。null ＝這個名字有一次代不出來
 * （`for S in …`、`read S`、`unset S`）。子 shell 往外看得到外層的值，自己設的不會流出去。
 */
class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.values = new Map();
    this.opaque = false;
  }

  /** 這個名字所有可能的值；回 null＝沒設過，或這一層跑過看不到內容的東西。 */
  candidates(name) {
    if (SHELL_OWNED.has(name)) return null;
    let found = null;
    for (let s = this; s; s = s.parent) {
      if (s.opaque) return null;
      const own = s.values.get(name);
      if (own) found = found ? [...found, ...own] : [...own];
    }
    return found;
  }

  add(name, values) {
    this.values.set(name, [...new Set([...(this.values.get(name) ?? []), ...values])]);
  }

  forget(name) { this.add(name, [null]); }
}

/** 整個字就是一個變數（`$SSH`、`${SSH}`）。 */
const WHOLE_VARIABLE = /^\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)$/;

const VARIABLE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * 把字裡的 `$NAME`／`${NAME}` 代成值，回**所有可能的結果**。回 null＝有變數代不出來
 * （沒設過、空字串、被 for／read 改過），或組合太多。`$1`、`${x:-y}`、`$(…)` 不是這裡認得的寫法，
 * 原樣留在結果裡——呼叫端看到結果還有 `$` 就知道沒代完。
 */
function expansions(text, vars) {
  let results = [''];
  let last = 0;
  for (const m of String(text).matchAll(VARIABLE)) {
    const values = vars?.candidates(m[1] ?? m[2]);
    if (!values || values.some((v) => typeof v !== 'string' || v === '')) return null;
    const literal = text.slice(last, m.index);
    results = results.flatMap((r) => values.map((v) => r + literal + v));
    if (results.length > 32) return null;
    last = m.index + m[0].length;
  }
  return results.map((r) => r + String(text).slice(last));
}

/** `NAME=值` → 記進這一層。`+=` 是接在原本每個可能的值後面；原本沒值就算代不出來。 */
function assign(word, vars) {
  const m = ASSIGNMENT.exec(word);
  if (!m || !vars) return;
  const [, name, plus, raw] = m;
  let values = expansions(raw, vars) ?? [null];
  if (plus) {
    const before = vars.candidates(name);
    values = before && !before.includes(null) && !values.includes(null)
      ? before.flatMap((b) => values.map((v) => b + v)).slice(0, 32)
      : [null];
  }
  vars.add(name, values);
}

/**
 * 剝掉指令前面的東西，回「從真正的指令開始」的字。回空陣列＝這一段沒有要判的指令。
 * 順手記下**整段只有設變數**的那種（`D=/x`、`export D=/x`）到 vars，後面的 `rm -rf "$D"` 才代得出來。
 * `FOO=1 rm …` 的 FOO 只給 rm 當環境，不影響同一行的 `$FOO`，所以不記。
 */
function unwrap(words, vars) {
  let rest = words;
  for (let guard = 0; rest.length && guard < 30; guard += 1) {
    let k = 0;
    while (k < rest.length && (ASSIGNMENT.test(rest[k]) || ARRAY_ASSIGNMENT.test(rest[k]))) k += 1;
    if (k > 0) {
      if (k === rest.length) {
        for (const w of rest) {
          const array = ARRAY_ASSIGNMENT.exec(w);
          if (array) vars?.forget(array[1]);
          else assign(w, vars);
        }
        return [];
      }
      rest = rest.slice(k);
      continue;
    }
    if (KEYWORDS.has(rest[0])) { rest = rest.slice(1); continue; }
    // 指令本身放在變數裡（`SSH="ssh -o X"; $SSH host '…'`、`RM='rm -rf'; $RM docs`）：只有一個可能的值才攤開來判
    if (WHOLE_VARIABLE.test(rest[0])) {
      const values = expansions(rest[0], vars);
      if (values?.length !== 1 || !values[0].trim()) break;
      rest = [...values[0].trim().split(/\s+/), ...rest.slice(1)];
      continue;
    }
    const head = baseName(rest[0]);
    if (DECLARES.has(head)) {
      for (const w of rest.slice(1)) {
        if (ASSIGNMENT.test(w)) assign(w, vars);
        // `local S`／`declare S` 不帶值＝在這裡變成空的；`export S` 不改值
        else if (NAME.test(w) && head !== 'export' && head !== 'readonly') vars?.forget(w);
      }
      return [];
    }
    const spec = Object.hasOwn(WRAPPERS, head) ? WRAPPERS[head] : null;
    if (!spec) break;
    k = 1;
    while (k < rest.length && rest[k].startsWith('-') && rest[k] !== '--') k += spec.valued?.includes(rest[k]) ? 2 : 1;
    if (rest[k] === '--') k += 1;
    rest = rest.slice(k + (spec.positional ?? 0));
  }
  return rest;
}

/** 這個指令會不會改掉變數：會的話把名字標成代不出來，免得後面的 `rm -rf "$S"` 拿舊值去判。 */
function trackRebinding(words, vars) {
  if (!words.length || !vars) return;
  const head = baseName(words[0]);
  const args = words.slice(1);
  if (head === 'for' || head === 'select') { if (args[0]) vars.forget(args[0]); return; }
  if (REBINDERS.has(head)) { for (const a of args) if (NAME.test(a)) vars.forget(a); return; }
  if (head === 'printf') { const at = args.indexOf('-v'); if (at !== -1 && args[at + 1]) vars.forget(args[at + 1]); return; }
  if (OPAQUE.has(head)) vars.opaque = true;
}

// ───────────────────────── 各類規則 ─────────────────────────

/** git reset 的 mode 旗標與它最短的唯一縮寫長度。帶其中任一＝動 HEAD 或動工作區，不是單純 unstage。 */
const RESET_MODES = [['--hard', 3], ['--soft', 3], ['--mixed', 4], ['--merge', 4], ['--keep', 3]];

/** rebase 進行中的收拾動作。擋這些等於把人鎖死在 rebase 中途，一律放行。 */
const REBASE_ESCAPES = new Set(['--abort', '--continue', '--skip', '--quit', '--edit-todo', '--show-current-patch']);

/** git 自己的前置旗標裡，值寫在下一個字的那幾個。不跳過會把路徑當成子命令。 */
const GIT_VALUED = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace']);

/** `git commit` 值寫在下一個字的長旗標。值是資料（commit 訊息），不能拿來比旗標。 */
const COMMIT_VALUED = new Set([
  '--message', '--file', '--reuse-message', '--reedit-message', '--fixup', '--squash',
  '--author', '--date', '--template', '--cleanup', '--trailer', '--pathspec-from-file',
]);

/**
 * 拆出 git 的子命令與它後面的參數。`git -C <path> commit`／`git -c k=v commit` 的前置旗標會吃掉
 * 下一個字，不跳過的話會把路徑當成子命令。回 null＝這段不是 git 指令（git 沒排在指令位置）。
 */
export function gitParts(words) {
  if (baseName(words[0]) !== 'git') return null;
  for (let k = 1; k < words.length; k += 1) {
    const t = words[k];
    if (GIT_VALUED.has(t)) { k += 1; continue; }
    if (t.startsWith('-')) continue;
    return { sub: t, args: words.slice(k + 1) };
  }
  return null;
}

/** 短旗標（單一 `-` 開頭、只有字母）裡是否含指定字母。`--show-current` 這種長旗標不算。 */
function hasShortFlag(tokens, letters) {
  return tokens.some((t) => /^-[A-Za-z]+$/.test(t) && [...letters].some((c) => t.includes(c)));
}

/** 長旗標，含 git 接受的唯一縮寫（`--amen`）與 `--旗標=值`。min ＝還分得出是它的最短長度（含兩個 `-`）。 */
function hasLongFlag(tokens, full, min = full.length) {
  return tokens.some((t) => {
    const name = t.split('=')[0];
    return name.startsWith('--') && name.length >= min && full.startsWith(name);
  });
}

/**
 * `git commit` 的參數 → 真正的旗標清單（短旗標拆成單一字母、長旗標去掉 `=值`）。
 * 帶值選項的值跳過：`-m "…--amend…"` 的訊息是資料；`-nm msg` 的 n 在 m 前面才是旗標，`-mn` 的 n 是訊息。
 */
function commitFlags(args) {
  const flags = [];
  for (let k = 0; k < args.length; k += 1) {
    const t = args[k];
    if (t === '--') break;
    if (t.startsWith('--')) {
      const [name, value] = t.split(/=(.*)/s);
      flags.push(name);
      if (value === undefined && COMMIT_VALUED.has(name)) k += 1;
      continue;
    }
    if (!/^-[A-Za-z]/.test(t)) continue;
    for (let j = 1; j < t.length; j += 1) {
      const c = t[j];
      if ('mFCct'.includes(c)) { if (j === t.length - 1) k += 1; break; } // 後面（或下一個字）是它的值
      if ('Su'.includes(c)) break; // 值可有可無，有的話黏在後面
      flags.push(`-${c}`);
    }
  }
  return flags;
}

function looksScratchpad(path) {
  if (SCRATCHPAD_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  return path.split('/').includes(SCRATCHPAD_DIRNAME);
}

/** 一條**已經代完變數**的路徑可不可以放行。先解掉 `.` 與 `..` 再比。 */
function disposablePath(text, extra) {
  if (/[$`]/.test(text) || text.startsWith('~')) return false; // 還有沒代完的；`~` 一定在 repo 外
  const path = posix.normalize(text);
  if (looksScratchpad(path)) return true;
  if (path.startsWith('/')) return false;
  const segments = path.split('/').filter(Boolean);
  if (segments.includes('..')) return false;
  return segments.some((seg) => DISPOSABLE_NAMES.has(seg) || extra.includes(seg) || TMP_SEGMENT.test(seg));
}

/**
 * 這個 rm 目標可不可以放行。暫存區＝可以；repo 內的可重生目錄＝可以；其餘擋。
 * 先代入變數、解掉 `.` 與 `..` 再比——`/tmp/claude-1/../../Users/x` 實際刪的是 `/Users/x`。
 *
 * **絕對路徑、`~` 開頭、帶 `..` 的相對路徑不吃名字白名單**：`/var/tmp`、`../../node_modules`
 * 的層名雖然在清單裡，但目標在當前 repo 外，那是另一回事。
 * **代不出來的變數一律不放行**：`$DIR/build` 不知道 `$DIR` 是哪裡，空字串時就是 `/build`。
 * 變數有好幾個可能的值時，**每一個**都要過關。vars 不給＝字面上有變數就不放行。
 */
export function disposableTarget(arg, extra = [], vars = null) {
  const paths = expansions(arg, vars);
  return paths !== null && paths.every((path) => disposablePath(path, extra));
}

/** 這個指令是不是 `rm` 帶 r＋f；是就回它要刪的目標（可能是空陣列），不是回 null。 */
function rmTargets(words) {
  if (baseName(words[0]) !== 'rm') return null;
  const rest = words.slice(1);
  const cut = rest.indexOf('--'); // `--` 之後全是路徑，`-` 開頭的也是
  const flags = cut === -1 ? rest : rest.slice(0, cut);
  if (!recursiveForce(flags)) return null;
  return [...flags.filter((t) => !t.startsWith('-')), ...(cut === -1 ? [] : rest.slice(cut + 1))];
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
 * 判一個簡單指令（已拆成字）該不該擋。回 null＝放行。
 * 回 { key, rule, why, hint } ＝要使用者確認，rule／why／hint 都會寫進確認框。
 */
function classifyWords(words, inputs, opts, state) {
  if (!words.length) return null;
  const head = baseName(words[0]);
  const allow = opts.allow ?? new Set();
  // 使用者在 CC_GUARD_BASH_ALLOW 放行的類別直接跳過，繼續判下一類（同一段可能同時命中兩類）。
  const block = (key, hit) => (allow.has(key) ? null : { key, ...hit });

  const git = head === 'git' ? gitParts(words) : null;
  const sub = git?.sub;
  const args = git?.args ?? [];
  const AUTHORIZE = '確定要做就按允許';

  // 1. 遠端不可逆變更：強制推送（刪遠端分支不擋，見檔頭）
  if (sub === 'push') {
    const forced = args.includes('--force') || hasLongFlag(args, '--force-with-lease', 9) || hasShortFlag(args, 'f');
    const mirror = hasLongFlag(args, '--mirror', 5);
    const plusRef = args.find((t) => /^\+./.test(t)); // `+main`／`+HEAD:main`：refspec 前面的 + 就是強制
    const rule = forced ? 'git push --force' : mirror ? 'git push --mirror' : plusRef ? `git push ${plusRef}（＋＝強制）` : null;
    const hit = rule && block('force-push', {
        rule,
        why: '改寫遠端歷史，別線 session 已 pull 的 commit 會憑空消失，且無法從本地還原。',
        hint: `${AUTHORIZE}。想撤回內容改用 \`git revert\` 疊新 commit。`,
      });
    if (hit) return hit;
  }

  // 2. 繞過閘：--no-verify。commit 的 `-n` 是它的簡寫，push 的 `-n` 是 --dry-run（放行）。
  if (sub === 'commit' || sub === 'push') {
    const flags = sub === 'commit' ? commitFlags(args) : args;
    const noVerify = hasLongFlag(flags, '--no-verify', 9) || (sub === 'commit' && flags.includes('-n'));
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
    const dryRun = args.includes('--dry-run') || hasShortFlag(args, 'n');
    const forced = hasLongFlag(args, '--force', 4) || hasShortFlag(args, 'f');
    // **`-X` 放行**：大寫 X ＝只刪被 .gitignore 忽略的檔，那就是 build／install 產物，
    // 跟已經放行的 `rm -rf node_modules`／`dist` 同一類，擋它只是逼 agent 改用 rm 繞路。
    // **小寫 `-x` 不放行**：它是「忽略 ignore 規則」，刪得比預設更多，意思剛好相反。
    // `-X` 沒有長旗標（`git clean -h` 實測），所以只比短旗標，且 hasShortFlag 區分大小寫。
    const ignoredOnly = hasShortFlag(args, 'X');
    const hit = forced && !dryRun && !ignoredOnly && block('clean', {
        rule: 'git clean -f',
        why: '刪掉未追蹤檔案，它們從來沒進 git object store，所以 git 救不回來；本 repo 是共用 worktree，那些檔可能是別線 session 還沒 add 的產出。',
        hint: `先看會刪什麼：\`git clean -n -d\`（只列不刪，本 hook 放行）。只想清 build 產物用 \`git clean -fdX\`（只刪被 .gitignore 忽略的檔，本 hook 放行）。真要整包刪，${AUTHORIZE}。`,
      });
    if (hit) return hit;
  }

  // 4. git reset 帶 mode 旗標。不帶＝純 unstage，放行。
  if (sub === 'reset') {
    const flags = args.includes('--') ? args.slice(0, args.indexOf('--')) : args;
    const mode = RESET_MODES.find(([full, min]) => hasLongFlag(flags, full, min))?.[0];
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
  if (sub === 'rebase' && !args.some((t) => REBASE_ESCAPES.has(t))) {
    const hit = block('rebase', {
      rule: 'git rebase',
      why: '改寫既有 commit 的 SHA，別線 session 或已推出去的分支會對不上（本 repo 是共用 worktree）。',
      hint: `要併歷史用 \`git merge\`；要改內容疊新 commit。真要 rebase，${AUTHORIZE}。（\`--abort\`／\`--continue\`／\`--skip\` 本 hook 放行）`,
    });
    if (hit) return hit;
  }

  // 6. 改寫上一個 commit
  if (sub === 'commit' && hasLongFlag(commitFlags(args), '--amend', 4)) {
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
  const branchForced = hasShortFlag(args, 'D')
    || (hasLongFlag(args, '--delete', 5) && (hasLongFlag(args, '--force', 6) || hasShortFlag(args, 'f')));
  if (sub === 'branch' && branchForced) {
    const hit = block('branch-force', {
      rule: 'git branch -D',
      why: '強制刪分支會連帶丟掉只存在該分支上的未合併 commit——`-D` 就是叫 git 跳過「未合併」那道檢查。',
      hint: `先確認已合併：\`git branch --merged\`。已合併的用 \`git branch -d\`（本 hook 放行，git 自己會守住未合併的）。真要強制刪，${AUTHORIZE}。`,
    });
    if (hit) return hit;
  }

  // 8. rm -rf（暫存區與可重生目錄放行）
  const targets = rmTargets(words);
  if (targets) {
    const extra = opts.disposable ?? [];
    const blocked = targets.filter((t) => !disposableTarget(t, extra, state.vars));
    if (blocked.length > 0 || targets.length === 0) {
      const unknown = blocked.some((t) => (expansions(t, state.vars) ?? ['$']).some((path) => /[$`]/.test(path)));
      const hit = block('rm', {
        rule: 'rm -rf',
        why: `不可逆遞迴刪除，目標既不在 scratchpad 也不是可重生目錄（${blocked.join(' ') || '未指定路徑'}）。${unknown ? '路徑裡有代不出來的變數，判不出刪的是哪裡。' : ''}`,
        hint: `暫存檔放 scratchpad（路徑以 ${SCRATCHPAD_PREFIXES.join(' 或 ')} 開頭，或有一層叫 ${SCRATCHPAD_DIRNAME}）或取名 \`.tmp-*\`，本 hook 放行；\`node_modules\`／\`dist\` 這類可重生目錄也放行。版控檔用 \`git rm\`。其餘先問使用者。`,
      });
      if (hit) return hit;
    }
  }

  // 9. 把字串當指令跑的：`bash -c '…'`、`bash <<EOF`、`eval …`、`ssh 主機 '…'`——內文再拆一層判。
  if (state.depth < MAX_DEPTH) {
    const rest = words.slice(1);
    const scripts = [];
    if (SHELLS.has(head)) {
      const at = rest.findIndex((t) => /^-[A-Za-z]*c[A-Za-z]*$/.test(t));
      const script = at === -1 ? undefined : rest.slice(at + 1).find((t) => !t.startsWith('-'));
      if (script !== undefined) scripts.push(script);
      for (const input of inputs) scripts.push(input.text);
    }
    if (head === 'eval') scripts.push(rest.join(' '));
    if (head === 'ssh') {
      // 那頭的指令照同一套規則判：遠端的 `rm -rf`、`git reset --hard` 本機 git 一樣救不回來。
      // 那頭的變數這裡看不到，所以 `rm -rf $T` 一律問；`rm -f` 清單檔照舊放行。
      let k = 0;
      while (k < rest.length && rest[k].startsWith('-')) k += SSH_VALUED.has(rest[k]) ? 2 : 1;
      if (rest.length > k + 1) scripts.push(rest.slice(k + 1).join(' '));
    }
    for (const script of scripts) {
      const hit = classifyCommand(script, opts, state.depth + 1);
      if (hit) return hit;
    }
  }

  return null;
}

/**
 * 照順序走過一條指令裡的每個簡單指令：剝掉外包、記變數，再把「從真正的指令開始的字」交給 visit。
 * visit 回非 undefined 的值就停下來把它傳回去。
 */
function walkCommands(command, visit) {
  const { commands, parents } = parseShell(command);
  const scopes = [];
  const scopeOf = (id) => (scopes[id] ??= new Scope(parents[id] >= 0 ? scopeOf(parents[id]) : null));
  for (const { words: raw, inputs, scope } of commands) {
    const vars = scopeOf(scope);
    const words = unwrap(raw, vars);
    const result = visit(words, inputs, vars);
    if (result !== undefined && result !== null) return result;
    trackRebinding(words, vars);
  }
  return null;
}

/** 拆複合指令逐段判——`cd x && <遞迴刪除>` 這種靠只看首個 token 是抓不到的。 */
export function classifyCommand(command, opts = {}, depth = 0) {
  if (typeof command !== 'string') return null;
  return walkCommands(command, (words, inputs, vars) => classifyWords(words, inputs, opts, { vars, depth }));
}

/**
 * 給測試與比對工具用：列出這條指令（最外面那一層）每個 `rm -rf` 目標代入變數後所有可能的路徑。
 * paths 是 null＝有變數代不出來。
 */
export function resolveRmTargets(command) {
  const found = [];
  walkCommands(String(command ?? ''), (words, _inputs, vars) => {
    for (const target of rmTargets(words) ?? []) found.push({ target, paths: expansions(target, vars) });
  });
  return found;
}

/**
 * 整個 tool_input 一起判：先跑逐段的 classifyCommand，再跑整條判的遠端寫入。
 * 回 null＝放行；回 { key, rule, why, hint }＝要使用者確認。
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
 * 遠端寫入類（見檔頭）。`rsync`／`wp` 照拆好的字判；`ssh` 整條一起看——`ssh h 'cd x && wp db import y'`
 * 的遠端指令在引號裡是一整個字，從 ssh 那個字看到結尾才不會漏。回 null＝放行；回帶 hit ＝要使用者確認。
 */
export function classifyRemoteWrite(command, opts = {}) {
  if (opts.allow?.has('remote-write')) return null;
  const hit = (rule, target) => ({
    key: 'remote-write',
    rule,
    why: `往別台主機寫入（${target}），寫錯目的地會蓋掉別人的站或資料庫，本機 git 救不回來。`,
    hint: '先確認目的地現況（啟用主題、文章數、最近修改時間）再請使用者按確認；rsync 可先帶 `-n` 預演（本 hook 放行）。',
  });

  for (const command_ of parseShell(command).commands) {
    const tokens = unwrap(command_.words, null);
    const head = baseName(tokens[0]);
    if (head === 'rsync') {
      if (tokens.includes('--dry-run') || hasShortFlag(tokens, 'n')) continue;
      const dest = tokens.slice(1).filter((t) => !t.startsWith('-')).pop();
      if (dest && REMOTE_SPEC.test(dest)) return hit(`${head} → 遠端`, dest);
    }
    if (head === 'wp' && tokens.some((t) => t.startsWith('--ssh=') || /^@[\w.-]+$/.test(t)) && REMOTE_WRITE_ACTION.test(tokens.join(' '))) {
      return hit('wp 遠端寫入', tokens.find((t) => t.startsWith('--ssh=') || t.startsWith('@')));
    }
  }

  // ssh：從 ssh 那個字開始看到結尾，引號內的遠端指令一起算進去。
  // 寧可多問：ssh 之後同一條指令裡的本機寫入也會命中，代價只是按一下確認。
  const text = stripHeredocs(command).replace(/\\\n/g, '');
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

  let hit;
  try {
    const payload = JSON.parse(await readStdin());
    if (typeof payload?.tool_input?.command !== 'string') return 0;
    hit = classifyToolInput(payload.tool_input, configFromEnv(process.env));
  } catch {
    return 0; // fail open，見檔頭
  }
  if (!hit) return 0;

  // 命中一律跳確認框（理由見檔頭）。reason 顯示在框裡給使用者看。
  const home = process.env.HOME;
  const cfg = process.env.CLAUDE_CONFIG_DIR || (home ? join(home, '.claude') : '~/.claude');
  const settings = join(home && cfg.startsWith(`${home}/`) ? `~${cfg.slice(home.length)}` : cfg, 'settings.json');
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `${hit.rule}：${hit.why} ${hit.hint}（這類不想再被問：在 ${settings} 的 env 設 "CC_GUARD_BASH_ALLOW": "${hit.key}"，重開 session 生效）`,
    },
  }));
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code));
}
