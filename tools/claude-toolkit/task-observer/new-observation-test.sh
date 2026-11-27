#!/usr/bin/env bash
# The installed new-observation.sh with the kit's patch: a malformed claim marker (`0125-`) leaves the floor numeric,
# and the new file starts with its `---` and `id:` lines. check-tools runs it.
# usage: bash new-observation-test.sh [path to new-observation.sh]
s=${1:-$HOME/.claude/skills/task-observer/scripts/new-observation.sh}
ws=$(mktemp -d); trap 'rm -rf "$ws"' EXIT
d=$ws/skill-observations/observation-log; mkdir -p "$d/archive/.id-claims"
printf -- '---\nid: 7\n---\n' > "$d/0007-old.md"; : > "$d/archive/.id-claims/0125-"
f=$(bash "$s" new-thing "$ws" 2>/dev/null) || { echo "FAIL: new-observation.sh refused"; exit 1; }
[ "$(head -2 "$f")" = $'---\nid: 8' ] || { echo "FAIL: $f starts with '$(head -2 "$f" | tr '\n' '|')', not ---|id: 8"; exit 1; }
[ "$(cat "$d/archive/.id-floor")" = 8 ] || { echo "FAIL: floor is '$(cat "$d/archive/.id-floor")', not 8"; exit 1; }
echo "ok: id 8 written in the file, floor 8 past a malformed claim"
