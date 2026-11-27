# A second reading of the log — 2026-11-27

Another session read the same log in parallel, unaware of `REVIEW.md` beside this file, which was saved first and is
the review of record. This reading's per-entry verdicts (four readers checking each open entry's body against the repo
as it stands) are in `second-reading-list.md`, grouped into 36 clusters; its ids are the log's as saved.

## What it added to the log

- Folded three restatements: #318 into #13 (stale WebAssembly in tests), #319 into #296 (one tsconfig misses the
  tests' types; three sessions now, so a barrier), #327 into #175 (a linked worker `target/` bakes its paths into
  build scripts; the second occurrence). Each is superseded, its instance copied into the canonical entry.
- Fixed the log's integrity at the merge: the save that renumbered clashes had moved six entries onto ids already
  held (1 and 321 to 325); they are now 329 to 334, each with a note, and the floor is 334. Nine zero-padded header
  ids normalised; resolved entries without a date given one. No id is held twice; every filename matches its id.
- Its 23 closings (19 found applied, three superseded by the owner's decision "CI Is the Check Before a Merge", one
  moot) were all already closed by `REVIEW.md`'s pass: the two readings agree on every one.
- The activation baseline re-read (`activation-tiers.txt`): the repository's new name; the hook is in
  `/root/.claude/settings.json`.

After the merge: 216 open, 51 actioned, 31 declined, 3 superseded.

## Where it agrees with `REVIEW.md`

Its three most important decisions are `REVIEW.md`'s 1, 4 and 5, and 10, reached separately:

1. **A pre-push barrier** (`REVIEW.md` 1; a new check, so the owner's yes). This reading adds #296's third session
   (this session's first CI run of #232 failed on test types that bare `tsc` passed) and folded #319, and
   proposes it beside the existing guard: `tools/claude-toolkit/git-hooks/pre-push`, installed by `install-all.sh` and
   checked by `check_tools.py` as the pre-commit guard is. Verify: a push with a type error is refused locally.
2. **The worker kit** (`REVIEW.md` 4 and 5; the standing order, except the worker cap, a number for the owner):
   `run-worker.sh` refuses a worktree whose `target` is a link (#175's second occurrence makes this a barrier), checks
   free disk first, caps running workers, deletes a merged worker's `target/`. Verify: a linked `target` is refused.
3. **Browser QA** (`REVIEW.md` 10 and its notes): Toolkit.md's one huge Browser QA table cell becomes its own section
   (camera, sea, story, UI shots, desktop app), folding in the 13 note findings; the shot scripts take the kit fixes.

Nothing is applied until the owner approves.
