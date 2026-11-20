#!/bin/bash
# toolkit-data.sh against a local origin: two sessions saving in parallel both keep their work (an edit, a move to the
# archive and a review on one side, a new observation on the other), the merged log comes back to the container that
# saved, and a log never restored is not saved over the branch. Exits non-zero naming what failed; check_tools.py runs it.
set -euo pipefail
KIT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
git init -q --bare "$T/origin.git"; git init -q "$T/repo"; cd "$T/repo"
git config user.email test@example.invalid; git config user.name test
git remote add origin "$T/origin.git"; git commit -q --allow-empty -m start; git push -q origin HEAD:refs/heads/main
run() { SHARED_DIR="$T/$1" REPO_DIR="$T/repo" bash "$KIT/toolkit-data.sh" "$2" >/dev/null; }
obs() { mkdir -p "$(dirname "$1")"; printf -- '---\nstatus: %s\n---\n' "$2" > "$1"; }
fail() { echo "toolkit-data-test: $1" >&2; exit 1; }
A="$T/A/task-observer/skill-observations"; B="$T/B/task-observer/skill-observations"
obs "$A/observation-log/0001-one.md" open; obs "$A/observation-log/0002-two.md" open; mkdir -p "$A/observation-log/archive"
run A save; run B restore
[ -f "$B/observation-log/0002-two.md" ] || fail "a fresh container did not restore the log"
# A reviews: marks 0001 actioned, archives 0002, keeps its record. B, meanwhile, logs 0003. Both save.
obs "$A/observation-log/0001-one.md" actioned; mv "$A/observation-log/0002-two.md" "$A/observation-log/archive/"
mkdir -p "$A/reviews"; echo review > "$A/reviews/REVIEW.md"; obs "$B/observation-log/0003-three.md" open
run A save; run B save
git fetch -q origin toolkit-data; tip=$(git rev-parse FETCH_HEAD)
show() { git show "$tip:task-observer/skill-observations/$1" 2>/dev/null; }
show observation-log/0001-one.md | grep -q 'status: actioned' || fail "a parallel save undid an edit"
show observation-log/archive/0002-two.md >/dev/null && ! show observation-log/0002-two.md >/dev/null ||
  fail "a parallel save undid a move to the archive"
show reviews/REVIEW.md >/dev/null || fail "a parallel save dropped a review"
show observation-log/0003-three.md >/dev/null || fail "a save dropped the parallel session's observation"
[ -f "$B/reviews/REVIEW.md" ] || fail "the merged log did not come back to the container that saved"
# A container whose restore failed holds a fresh, near-empty log: it is never saved over the branch.
obs "$T/C/task-observer/skill-observations/observation-log/0001-one.md" open
! run C save 2>/dev/null || fail "a log never restored was saved over the branch"
echo "toolkit-data-test: passed"
