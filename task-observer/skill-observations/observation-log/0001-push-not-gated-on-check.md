
What happened: a commit-check-push command joined `cargo xtask check` and the push with `;`, so the push ran after the
check failed (one problem: a 9-line comment in tools/lattice/heart.py). CLAUDE.md: "Done means `cargo xtask check`
passes. Run it before every push."
Fixed: the comment cut to eight lines, the check passing, the fix pushed with the push gated by `&&` on the check.
Lesson for the kit: a push in a chained command is always `check && push`, never `check; push`. A pre-push git hook
running the repo checks would catch it mechanically; that is a new check, so it needs the owner's agreement.
