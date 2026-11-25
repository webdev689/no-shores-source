# amend-after-fast-forward-merge

- Date: 2026-11-21
- Seen by: the controller, overlook-source, merging worker branches
- What happened: to add the attribution trailer to a merge commit, the controller ran `git merge --no-edit <branch>`
  then `git commit --amend -m "Merge ..."`. One branch (ev/biblefix2) fast-forwarded, so the amend rewrote the
  worker's own last commit message into "Merge ...". Caught before push; restored with `git reset --keep <tip>`.
- Proposed change: merge worker branches with `git merge --no-ff -m "<message with trailers>" <branch>` in one step
  (or ff-merge with `--ff-only` and no amend), never amend after a merge whose output may say "Fast-forward".
- Status: open

- Second instance (2026-11-25, no-shores-source, foe arrivals #211): `git merge --no-edit origin/main` was run expecting
  conflicts (the two merges before it had them, and their resolution commits carried the trailers). This one merged
  clean, so git committed its default "Merge remote-tracking branch ..." with no attribution trailers, and it was
  pushed before it was noticed; left in place rather than force-pushing a shared draft. Same remedy: one step,
  `git merge --no-ff -m "<message with trailers>" origin/main`. Second violation of the trailer rule through merges:
  the barrier is a commit-msg hook (install-all.sh already installs pre-commit) refusing a message without the
  session's trailer, not another note.
