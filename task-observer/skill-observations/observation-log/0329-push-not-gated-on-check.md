---
id: 329
title: "A push chained after cargo xtask check with ';' ran though the check failed"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["CLAUDE.md", "tools/claude-toolkit/git-hooks"]
siblings_checked: "assumed: header rebuilt from the body at repair on 2026-11-26; the sibling check is due at the review"
area: "pushing only after the check passes"
date: 2026-11-20
session_context: "A commit-check-push command in a Lattice session"
parked_until:
resolved:
resolution:
reference:
commands_verified: none
---
What happened: a commit-check-push command joined `cargo xtask check` and the push with `;`, so the push ran after the
check failed (one problem: a 9-line comment in tools/lattice/heart.py). CLAUDE.md: "Done means `cargo xtask check`
passes. Run it before every push."
Fixed: the comment cut to eight lines, the check passing, the fix pushed with the push gated by `&&` on the check.
Lesson for the kit: a push in a chained command is always `check && push`, never `check; push`. A pre-push git hook
running the repo checks would catch it mechanically; that is a new check, so it needs the owner's agreement.

(Renumbered from #1 at the 2026-11-27 review: two observations held that id.)
