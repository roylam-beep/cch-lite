#!/bin/sh
# 負向測試：description 含「空白＋#」時 test_skills.py 必須紅，拿掉 # 後必須綠。
set -e
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
T="$(mktemp -d)"
trap 'rm -r "$T"' EXIT
cat > "$T/cc-bad.md" <<'EOF'
---
description: 示範 #這段會被 YAML 當註解吃掉
---

## 防什麼

測試用。
EOF
if CC_HARNESS_COMMANDS="$T" python3 "$ROOT/test/test_skills.py" > "$T/out" 2>&1; then
  echo "TEST_SKILLS_HASH FAIL：含「空白＋#」卻沒紅"; cat "$T/out"; exit 1
fi
grep -q "空白＋#" "$T/out" || { echo "TEST_SKILLS_HASH FAIL：紅了但不是這一類"; cat "$T/out"; exit 1; }
sed -i.bak 's/ #/ /' "$T/cc-bad.md"
CC_HARNESS_COMMANDS="$T" python3 "$ROOT/test/test_skills.py" > "$T/out" 2>&1 ||
  { echo "TEST_SKILLS_HASH FAIL：拿掉 # 還是紅"; cat "$T/out"; exit 1; }
echo "TEST_SKILLS_HASH OK（2 項全過）"
