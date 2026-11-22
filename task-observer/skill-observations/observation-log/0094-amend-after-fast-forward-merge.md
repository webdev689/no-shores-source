# amend-after-fast-forward-merge

- Date: 2026-11-21
- Seen by: the controller, overlook-source, merging worker branches
- What happened: to add the attribution trailer to a merge commit, the controller ran `git merge --no-edit <branch>`
  then `git commit --amend -m "Merge ..."`. One branch (ev/biblefix2) fast-forwarded, so the amend rewrote the
  worker's own last commit message into "Merge ...". Caught before push; restored with `git reset --keep <tip>`.
- Proposed change: merge worker branches with `git merge --no-ff -m "<message with trailers>" <branch>` in one step
  (or ff-merge with `--ff-only` and no amend), never amend after a merge whose output may say "Fast-forward".
- Status: open
