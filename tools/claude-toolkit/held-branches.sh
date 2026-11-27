#!/bin/bash
# End of session: list each local branch (worktrees' included) whose head is on no branch of origin. A cloud container
# loses them at its end, so push each one (e.g. as held/<name>) or say it will be lost.
# usage: bash held-branches.sh [repo dir]
cd "${1:-.}" || exit 1
# Held: the head is no origin branch's head, nor in a remote-tracking branch origin still has (a stale one can't count).
heads=$(git ls-remote --heads origin) || { echo "held-branches: origin out of reach" >&2; exit 1; }
git for-each-ref --format='%(refname:short) %(objectname)' refs/heads | while read -r b h; do
  grep -q "^$h" <<< "$heads" && continue
  for r in $(git branch -r --contains "$h" --format='%(refname:lstrip=3)' 2>/dev/null); do
    grep -q "refs/heads/$r\$" <<< "$heads" && continue 2
  done
  echo "$b"
done
