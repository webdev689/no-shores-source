#!/bin/bash
# toolkit-data.sh against a local origin: two sessions saving in parallel both keep their work (an edit, a move to the
# archive and a review on one side, a new observation on the other, and lines both append to a log), an observation
# number both take is moved on, the merged log comes back to the container that saved, a log never restored is not
# saved over the branch, an origin out of reach saves and restores nothing, and a restore that failed can be made
# again, but never twice. Exits non-zero naming what failed; check_tools.py runs it.
set -euo pipefail
KIT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
git init -q --bare "$T/origin.git"; git init -q "$T/repo"; cd "$T/repo"
git config user.email test@example.invalid; git config user.name test
git remote add origin "$T/origin.git"; git commit -q --allow-empty -m start; git push -q origin HEAD:refs/heads/main
run() { SHARED_DIR="$T/$1" REPO_DIR="$T/repo" bash "$KIT/toolkit-data.sh" "$2" >/dev/null; }
obs() { mkdir -p "$(dirname "$1")"; printf -- '---\nid: %s\nstatus: %s\n---\n' "$(basename "$1" | cut -c1-4 | sed 's/^0*//')" "$2" > "$1"; }
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
# Both append a line to the scan's log, and both take the next number: both lines kept, one number moved on.
run A save; run B save
echo "a's scan" >> "$A/checkpoints.log"; echo "b's scan" >> "$B/checkpoints.log"
obs "$A/observation-log/0004-from-a.md" open; obs "$B/observation-log/0004-from-b.md" open
mkdir -p "$B/observation-log/archive/.id-claims"; : > "$B/observation-log/archive/.id-claims/0004"
run A save; run B save
git fetch -q origin toolkit-data; tip=$(git rev-parse FETCH_HEAD)
show checkpoints.log | grep -q "a's scan" && show checkpoints.log | grep -q "b's scan" ||
  fail "a parallel save dropped a line the other appended to a log"
show observation-log/0004-from-a.md >/dev/null && show observation-log/0005-from-b.md | grep -q '^id: 5$' ||
  fail "a number both sessions took was not moved on: $(git ls-tree -r --name-only "$tip" | grep 000[45] | tr '\n' ' ')"
[ -f "$B/observation-log/0005-from-b.md" ] || fail "the moved number did not come back to its container"
# A number's claim marker (new-observation.sh) is no observation: it keeps its name.
show observation-log/archive/.id-claims/0004 >/dev/null && ! git ls-tree -r --name-only "$tip" | grep -q -- '-$' ||
  fail "a claim marker was moved as an observation: $(git ls-tree -r --name-only "$tip" | grep -- '-$' | tr '\n' ' ')"
# An origin out of reach: the restore restores nothing and says so, and a save with nothing restored saves nothing.
git clone -q "$T/origin.git" "$T/far"; git -C "$T/far" remote set-url origin "$T/nowhere.git"
far() { SHARED_DIR="$T/D" REPO_DIR="$T/far" bash "$KIT/toolkit-data.sh" "$1" 2>&1; }
far restore | grep -q "could not be reached" || fail "a restore with origin out of reach did not say so"
[ ! -f "$T/D/task-observer/restored-from" ] || fail "a restore with origin out of reach was noted as made"
obs "$T/D/task-observer/skill-observations/observation-log/0001-one.md" template
# Origin that cannot be asked whether it holds the branch, though it answers a fetch and a push: nothing is saved.
mkdir -p "$T/bin"; real=$(command -v git)
printf '#!/bin/bash\nfor a in "$@"; do [ "$a" = ls-remote ] && exit 128; done\nexec %q "$@"\n' "$real" > "$T/bin/git"
chmod +x "$T/bin/git"; before=$(git ls-remote origin refs/heads/toolkit-data)
git -C "$T/far" remote set-url origin "$T/origin.git"
! PATH="$T/bin:$PATH" far save >/dev/null || fail "a save that could not ask origin for the branch went on"
[ "$(git ls-remote origin refs/heads/toolkit-data)" = "$before" ] || fail "a save that could not ask origin changed it"
# Origin back, the restore is made over what a fresh install laid, and the log saves; made again, it restores nothing.
far restore >/dev/null; D="$T/D/task-observer/skill-observations"
grep -q 'status: actioned' "$D/observation-log/0001-one.md" || fail "a restore made late kept a fresh install's file"
far save >/dev/null || fail "a log restored late could not be saved"
mv "$D/observation-log/0003-three.md" "$D/observation-log/archive/"; far restore >/dev/null
[ ! -f "$D/observation-log/0003-three.md" ] || fail "a second restore brought back a file moved to the archive"
echo "toolkit-data-test: passed"
