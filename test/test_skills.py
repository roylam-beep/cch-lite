#!/usr/bin/env python3
"""test_skills.py — commands/cc-*.md 的機械檢查（P5）。跑法：`python3 test/test_skills.py`

只驗**機器能算的契約**，不驗寫得好不好。每一類都對應一個實際踩過的坑，坑寫在該類的 docstring。
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# CC_HARNESS_COMMANDS 只為了本檔的負向測試（證明每一類真的會紅），正常跑不設。
CMD_DIR = os.environ.get("CC_HARNESS_COMMANDS")
CMD_DIRS = [CMD_DIR or os.path.join(ROOT, "commands")]
# 已退役的 cc-* 名字（cross-ref 指到它們不算死指標）。預設是維護者帳號層的 retired-commands/，
# 不存在就跳過；別處用 CC_RETIRED_COMMANDS 指定。
_CFG = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude")
RETIRED_DIR = os.environ.get("CC_RETIRED_COMMANDS") or os.path.join(_CFG, "retired-commands")

# 已知缺口白名單。key = (skill, 檢查代號)，value = 理由（含解除條件）。
# 列在這裡的**降級成 warning，不是消失**——每次跑都會印出來。
# 反向也守：列了卻已經不再發生 → 直接紅（陳舊的豁免比沒有豁免更危險）。
KNOWN_GAPS = {}

# 宣告唯讀的 skill 必須真的擋掉寫入工具。allowed-tools 實測不收斂工具（見 docs/decisions.md），
# 所以唯讀要靠 disallowed-tools。
READONLY = {"cc-audit", "cc-grill", "cc-root", "cc-show", "cc-explain", "cc-skillcheck"}
WRITE_TOOLS = ("Write", "Edit")


def add(fails, name, check, msg):
    """記一筆。(skill, check) 在 KNOWN_GAPS 裡就只是 warning，不是紅燈。"""
    fails.append((name[:-3] if name.endswith(".md") else name, check, f"{name}: {msg}"))


def load(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def split_frontmatter(text):
    """回 (frontmatter dict, body)。解析不出來回 (None, text)。
    只支援 `key: value` 單層——skill frontmatter 實際就只有單層。"""
    m = re.match(r"---\r?\n(.*?)\r?\n---\r?\n?(.*)", text, re.S)
    if not m:
        return None, text
    fm = {}
    for line in m.group(1).split("\n"):
        line = line.rstrip("\r")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        kv = re.match(r"([A-Za-z0-9_-]+):[ \t]*(.*)$", line)
        if not kv:
            return None, m.group(2)
        fm[kv.group(1)] = kv.group(2).strip().strip("\"'")
    return fm, m.group(2)


def skills():
    """回 [(目錄, 檔名)]。"""
    return sorted((d, f) for d in CMD_DIRS if os.path.isdir(d)
                  for f in os.listdir(d) if f.startswith("cc-") and f.endswith(".md"))


def check_frontmatter(name, fm, body, fails):
    """坑：frontmatter 解析失敗時 Claude Code 不報錯，整個 YAML 區塊被當正文吃掉，
    描述與工具設定全部靜默失效。所以「可解析」本身就是一道閘。"""
    if fm is None:
        add(fails, name, "frontmatter", "frontmatter 解析失敗（缺 --- 包夾，或有非 `key: value` 的行）")
        return
    if not fm.get("description"):
        add(fails, name, "frontmatter", "frontmatter 缺 description（沒有它 agent 無從判斷何時該用）")


def check_no_dates(name, text, fails):
    """坑（R2 的 B 類教訓）：規則本文寫「X 已於 <日期> 退役」會讓規則變成歷史敘述，
    讀者要先分辨哪句還有效。退役史唯一落點是 ~/.claude 的 git 歷史。
    以前死法段的未來期限可以寫日期；使用量死法拆掉後沒有例外了（docs/decisions.md）。"""
    for i, line in enumerate(text.split("\n"), 1):
        if re.search(r"20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]", line):
            add(fails, name, "dates", f"L{i} 出現日期 → {line.strip()[:60]}")


def check_has_purpose(name, body, fails):
    """坑：說不出防哪個失敗的 skill，每季 /cc-audit 無從判斷它還該不該活（README 規矩 2）。
    只看 body 的 `## 防什麼` 標題——description 裡順口提到不算。"""
    if re.search(r"^## 防什麼\s*$", body, re.M):
        return
    add(fails, name, "purpose", "沒有 `## 防什麼` 段（README 規矩 2：說不出防哪個失敗就不進）")


def check_argument_contract(name, fm, body, fails):
    """坑：argument-hint 只是 UI placeholder（實測，見 docs/decisions.md），本文沒有 $ARGUMENTS
    的話使用者打的參數會整段被丟掉——提示了卻收不到，比不提示更糟。反向同理。"""
    if fm is None:
        return
    has_hint = bool(fm.get("argument-hint"))
    has_args = "$ARGUMENTS" in body
    if has_hint and not has_args:
        add(fails, name, "argument", "有 argument-hint 但本文沒用 $ARGUMENTS（使用者打的參數會被丟掉）")
    if has_args and not has_hint:
        add(fails, name, "argument", "本文用了 $ARGUMENTS 但沒有 argument-hint（使用者不知道要打什麼）")


def check_cross_refs(name, text, fails, known):
    """坑：改名／退役後別支還指著舊名，使用者照著打會得到 unknown command。"""
    for ref in sorted(set(re.findall(r"/(cc-[a-z0-9-]+)", text))):
        if ref in known:
            continue
        add(fails, name, "crossref", f"指向不存在的 skill /{ref}（commands/ 與 retired-commands/ 都沒有）")


def check_side_effect_grade(name, fm, fails):
    """坑：有副作用的 workflow 被 agent 自派（實測 cc-handover 被自派 22 次，產出孤兒交接單）。
    2026-09-03～09-16 用 disable-model-invocation: true 硬擋；2026-09-16 使用者裁決解除
    （硬擋連「使用者在對話裡說收輪」都擋，每次要改打全名斜線指令，太卡）。自派的防線改由
    被安裝 repo 的 AGENTS.md「使用者叫才跑」承擔（見 docs/decisions.md 2026-09-16）。
    本函式現在只守唯讀那批：要 disallowed-tools 真的移除寫入工具。寫入型 skill 若又出現
    自派孤兒檔（≥2 次），把下面註解掉的斷言加回來。"""
    if fm is None:
        return
    stem = name[:-3]
    tools = fm.get("allowed-tools", "")
    denied = fm.get("disallowed-tools", "")
    can_write = tools.strip() == "Bash" or any(
        re.search(rf"(^|[,\s]){t}([,\s]|$)", tools) for t in WRITE_TOOLS)
    if stem in READONLY:
        missing = [t for t in WRITE_TOOLS if not re.search(rf"(^|[,\s]){t}([,\s]|$)", denied)]
        if missing:
            add(fails, name, "sideeffect", f"宣告唯讀卻沒有 disallowed-tools: {'/'.join(missing)}"
                "（allowed-tools 實測不收斂工具，唯讀擋不住）")
        return
    # 2026-09-16 解除（見 docstring）。要恢復硬擋就把這三行放回來：
    # if can_write and fm.get("disable-model-invocation") != "true":
    #     add(fails, name, "sideeffect", "會寫檔卻沒有 disable-model-invocation: true"
    #         "（會被 agent 自派，產出沒人認領的檔）")
    del can_write


# Claude Code 第一次用到才建的目錄：沒用過 plan mode 的機器沒有 ~/.claude/plans。
ON_DEMAND_DIRS = {"~/.claude/plans"}


def check_referenced_home_paths(name, text, fails):
    """坑：skill 本文寫 `~/...` 絕對路徑，路徑搬走後不會報錯，只會在執行時撲空。
    只驗 `~` 開頭的（那些是真實可驗的機器路徑）；repo 相對路徑指的是**被安裝的 repo**，
    在本 repo 驗不了，不驗。
    cloud session（CLAUDE_CODE_REMOTE 有值）的 `~` 是 container，不是使用者本機——跳過並在 main 印一行，不當紅。"""
    if os.environ.get("CLAUDE_CODE_REMOTE"):
        return
    for ref in sorted(set(re.findall(r"`(~/[A-Za-z0-9_./-]+)`", text))):
        p = os.path.expanduser(ref)
        top = os.path.expanduser("~/" + ref[2:].split("/")[0])
        # 那個工具根本沒裝（例如沒有 ~/.codex）、或是 CLI 用到才建的目錄：不是「路徑搬走」，不驗。
        if not os.path.exists(top) or ref.rstrip("/") in ON_DEMAND_DIRS:
            continue
        if not os.path.exists(p):
            add(fails, name, "homepath", f"引用不存在的路徑 `{ref}`")


def main():
    names = skills()
    if not names:
        print("FAIL: commands/ 底下沒有 cc-*.md")
        return 1
    known = {n[:-3] for _, n in names}
    if os.path.isdir(RETIRED_DIR):
        known |= {f[:-3] for f in os.listdir(RETIRED_DIR) if f.startswith("cc-") and f.endswith(".md")}
    fails = []
    for cmd_dir, name in names:
        text = load(os.path.join(cmd_dir, name))
        fm, body = split_frontmatter(text)
        check_frontmatter(name, fm, body, fails)
        check_no_dates(name, text, fails)
        check_has_purpose(name, body, fails)
        check_argument_contract(name, fm, body, fails)
        check_cross_refs(name, text, fails, known)
        check_side_effect_grade(name, fm, fails)
        check_referenced_home_paths(name, text, fails)

    hit = {(stem, check) for stem, check, _ in fails}
    hard = [m for stem, check, m in fails if (stem, check) not in KNOWN_GAPS]
    warn = [(k, m) for stem, check, m in fails for k in [(stem, check)] if k in KNOWN_GAPS]
    stale = sorted(k for k in KNOWN_GAPS if k not in hit)

    if os.environ.get("CLAUDE_CODE_REMOTE"):
        print("⚠️  ~ 路徑存在未檢查（cloud session 的 ~ 不是本機）")
    for key, msg in warn:
        print(f"⚠️  已知缺口 {key[0]}/{key[1]}：{msg}\n    理由：{KNOWN_GAPS[key]}")
    for stem, check in stale:
        hard.append(f"KNOWN_GAPS 有 ({stem}, {check}) 但這一輪沒再發生"
                    "——修好了就把該行刪掉，陳舊的豁免會遮住下一次真的壞掉")
    if hard:
        print(f"TEST_SKILLS FAIL（{len(hard)} 項）:")
        for x in hard:
            print(" -", x)
        return 1
    print(f"TEST_SKILLS OK（{len(names)} 支 × 7 類：frontmatter、無日期、有防什麼、"
          f"argument 契約、cross-ref、副作用分級、~ 路徑存在；已知缺口 {len(warn)} 項見上）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
