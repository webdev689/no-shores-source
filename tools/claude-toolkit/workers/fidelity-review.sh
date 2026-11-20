#!/bin/bash
# A change measured against the owner's approval, the same way every time: a headless reviewer with a fixed brief
# (fidelity-brief.md), read-only, writes its report and ends it with a Verdict line. That line, with the findings fixed
# or answered, goes in the pull request's description under "## Fidelity review", which CI's fidelity check requires of
# a pull request that changes a decision.
# usage: fidelity-review.sh <file holding the owner's approval, verbatim> <base>..<head> [report file]
KIT_DIR=${KIT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
set -u
[ $# -ge 2 ] && [ -s "$1" ] && [[ $2 == ?*..?* ]] ||
  { echo "usage: fidelity-review.sh <approval file> <base>..<head> [report file]" >&2; exit 2; }
APPROVAL=$(cd "$(dirname "$1")" && pwd)/$(basename "$1"); RANGE=$2; BASE=${RANGE%%..*}; HEAD=${RANGE##*..}
git rev-parse -q --verify "$BASE^{commit}" >/dev/null && git rev-parse -q --verify "$HEAD^{commit}" >/dev/null ||
  { echo "fidelity-review.sh: $RANGE is not a range of two commits" >&2; exit 2; }
# An empty or reversed range has nothing to review, and a verdict on it would pass nothing.
[ "$(git rev-list --count "$RANGE")" -gt 0 ] || { echo "fidelity-review.sh: $RANGE holds no commit" >&2; exit 2; }
REPORT=$(realpath -m "${3:-$HOME/wt/reports/fidelity-$(git rev-parse --short "$HEAD").md}")
REVIEWED=$(git rev-parse --short=12 "$HEAD")
mkdir -p "$(dirname "$REPORT")"; rm -f "$REPORT"
# The brief's places filled in as written, whatever a path holds.
BRIEF=$(<"$KIT_DIR/workers/fidelity-brief.md")
BRIEF=${BRIEF//\{APPROVAL\}/"$APPROVAL"}; BRIEF=${BRIEF//\{RANGE\}/"$RANGE"}
BRIEF=${BRIEF//\{REPORT\}/"$REPORT"}; BRIEF=${BRIEF//\{REVIEWED\}/"$REVIEWED"}
# The reviewer reads the change's own files: a worktree at its head, whatever this checkout holds.
WT=$(mktemp -d)/fidelity; REPO=$(git rev-parse --show-toplevel)
git -C "$REPO" worktree add -q --detach "$WT" "$HEAD" || exit 2
trap 'git -C "$REPO" worktree remove --force "$WT" 2>/dev/null || true' EXIT
cd "$WT" && TASK_OBSERVER_ROLE=worker claude -p "$BRIEF" --allowedTools "Bash,Read,Grep,Glob,Write" --max-turns 300 \
  </dev/null > "${REPORT%.md}.log" 2>&1
[ -s "$REPORT" ] || { echo "fidelity-review.sh: no report written; see ${REPORT%.md}.log" >&2; exit 1; }
grep -m1 '^Verdict: ' "$REPORT" || { echo "fidelity-review.sh: $REPORT has no Verdict line" >&2; exit 1; }
echo "report: $REPORT"
