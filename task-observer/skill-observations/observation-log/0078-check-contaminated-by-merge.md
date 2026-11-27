---
id: 78
title: "A background cargo xtask check read a tree mid-merge, and a PR went unmergeable without anyone noticing"
parked_until: "PR #240 merge"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["CLAUDE.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: long background runs over the working tree (cargo xtask check, picture captures, bakes)."
area: "overlook-source, checks and pull requests"
date: "2026-11-21"
session_context: "PR #113: the eighth full check ran in the background while main was merged into the same tree."
commands_verified: "check8.log: '== tests (Rust) failed' from 'encountered diff marker' in the city doctests, every test before them ok; pull_request_read showed mergeable_state dirty and no ci run since f7beee89"
---

- The full check ran in the background on 458e3738; while it was in the doctests, `git merge origin/main` wrote
  conflict markers into the tree, and the doctests failed on them. The run proves nothing about 458e3738 or the merge.
- Draft #113 had been "dirty" (conflicting with main, 390 commits behind) for several pushes: the `ci` workflow runs on
  the merge ref, so no `ci` run happened and only the `modules` workflow was seen. Nothing flagged it.
- Proposed rules: (1) no edit, merge or checkout in a tree while a background check, bake or capture reads it; use a
  worktree for one or the other. (2) After each push to a PR, read its mergeable state with the PR itself, not only
  the workflow runs listed for the branch.

Recurred the same session: the full check on 2bf38a0c ran in the background while the hub's plants were being written
into the same tree (new files, a rebake, module splits). It reported a pass, but over a tree that changed under it,
so it was not counted and was run again on a quiet tree. The rule proposed above would have prevented both.

Recurred 2026-11-25, PR #209 (the codebase audit): main took #201's ship work at 13:26 and #209 went "dirty". Four
pushes after that (a78de452 to 32da2b8b) started no `ci` run, and the controller noticed only some 40 minutes later,
by asking why the branch's run list ended at 0743ef9b. Rule (2) above, reading `mergeable_state` after each push,
would have caught it at the first push; it is the third time, so it wants a barrier (a post-push script that prints
the PR's mergeable state and fails on "dirty"), not a sentence.
