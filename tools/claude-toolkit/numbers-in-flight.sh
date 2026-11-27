#!/bin/bash
# The wire numbers each pull request's head adds over origin/main: asks (`pub const` in crates/protocol/src/*wire*.rs),
# refusals (crates/gear/src/refusal.rs) and foe types (crates/foes/src/roster.rs). Run it before taking a new number:
# two branches that take one at once merge with no conflict, and the distinct-asks test fires only once both share a
# tree. Git alone: it fetches refs/pull/*/head, which GitHub serves. Git cannot tell an open pull request from a closed
# one, so a closed head never merged shows too; a head already in main does not. Name pull requests to read only those.
# usage: bash numbers-in-flight.sh [number...]
set -euo pipefail
cd "${REPO_DIR:-$(git rev-parse --show-toplevel)}"
git fetch -q --no-tags origin '+refs/heads/main:refs/remotes/origin/main' ||
  { echo "numbers-in-flight: origin's main cannot be fetched" >&2; exit 1; }
git fetch -q --no-tags origin '+refs/pull/*/head:refs/remotes/origin/pull/*' 2>/dev/null || true
pulls=$(git for-each-ref --format='%(refname:strip=4)' refs/remotes/origin/pull | sort -n)
if [ -z "$pulls" ]; then
  echo "numbers-in-flight: origin serves no refs/pull/*/head, so the pull requests' numbers cannot be listed" >&2
  exit 1
fi
# The numbers a head's added lines in these paths give, by the pattern's one group.
added() {
  local head=$1 pattern=$2; shift 2
  { git diff -U0 "origin/main...$head" -- "$@" | grep -E '^\+[^+]' || true; } | sed -nE "s/$pattern/\1/p" | sort -n |
    tr '\n' ' ' | sed 's/ $//'
}
read=0
for pull in $pulls; do
  [ $# -eq 0 ] || [[ " $* " == *" $pull "* ]] || continue
  head=refs/remotes/origin/pull/$pull
  # Already in main, or a history of its own with nothing in common: nothing it adds is in flight.
  git merge-base --is-ancestor "$head" origin/main && continue
  git merge-base origin/main "$head" >/dev/null || continue
  read=$((read + 1))
  asks=$(added "$head" '^\+pub const [A-Z_]+: u8 = ([0-9]+);.*' 'crates/protocol/src/*wire*.rs')
  refusals=$(added "$head" '^\+[[:space:]]+[A-Z][A-Za-z]* = ([0-9]+),.*' crates/gear/src/refusal.rs)
  foes=$(added "$head" '^\+pub const [A-Z_]+: u8 = ([0-9]+);.*' crates/foes/src/roster.rs)
  [ -n "$asks$refusals$foes" ] || continue
  echo "#$pull asks: ${asks:-none}; refusals: ${refusals:-none}; foe types: ${foes:-none}"
done
echo "numbers-in-flight: $read pull request head(s) not in main read; each above adds numbers"
