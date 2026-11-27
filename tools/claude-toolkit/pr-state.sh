#!/usr/bin/env bash
# Each local branch with commits not on origin/main: those commits, whether it merges cleanly with origin/main
# (git merge-tree), and whether origin holds its head. A pull request that conflicts with main starts no CI run, and CI
# is the only full check, so a conflict fails this script. Run it after each push and before rewriting the hand-off.
# Git only: the pull request's own CI state comes from the GitHub tools, as the last line says.
set -u
git fetch -q origin main || echo "pr-state: could not fetch origin/main; comparing with the copy already here"
git rev-parse -q --verify origin/main >/dev/null || { echo "pr-state: FAILED, no origin/main to compare with"; exit 1; }
bad=0
for branch in $(git for-each-ref --format='%(refname:short)' refs/heads); do
  ahead=$(git rev-list --count "origin/main..$branch") || continue
  [ "$ahead" = 0 ] && continue
  echo "== $branch: $ahead commit(s) not on origin/main"
  git --no-pager log --format='   %h %s' "origin/main..$branch"
  git merge-tree --write-tree origin/main "$branch" >/dev/null 2>&1
  case $? in
    0) echo "   merges cleanly with origin/main" ;;
    1) echo "   CONFLICTS with origin/main: its pull request starts no CI run until origin/main is merged in"; bad=1 ;;
    *) echo "   could not test the merge with origin/main (git merge-tree --write-tree needs git 2.38)"; bad=1 ;;
  esac
  head=$(git rev-parse "$branch")
  if ! remote=$(git ls-remote origin "refs/heads/$branch"); then
    echo "   origin: could not be read"; bad=1
  elif remote=${remote%%$'\t'*}; [ -z "$remote" ]; then
    echo "   origin: no branch $branch (not pushed)"
  elif [ "$remote" = "$head" ]; then
    echo "   origin: holds its head ${head:0:12}"
  else
    echo "   origin: holds ${remote:0:12}, not its head ${head:0:12} (push it)"
  fi
done
echo "pr-state: now read each pull request's CI state on that head with the GitHub tools; this script cannot see it"
exit $bad
