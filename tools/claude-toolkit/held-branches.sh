#!/bin/bash
# End of session: list each local branch (worktrees' included) whose head is on no branch of origin. A cloud container
# loses them at its end, so push each one (e.g. as held/<name>) or say it will be lost.
# usage: bash held-branches.sh [repo dir]
cd "${1:-.}" || exit 1
remote=$(git ls-remote --heads origin) || { echo "held-branches: origin out of reach" >&2; exit 1; }
remote=$(cut -f1 <<< "$remote")
git for-each-ref --format='%(refname:short) %(objectname)' refs/heads | while read -r b h; do
  grep -qx "$h" <<< "$remote" || [ -n "$(git branch -r --contains "$h" 2>/dev/null)" ] || echo "$b"
done
