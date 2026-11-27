---
id: 315
title: "A chained command ran cargo xtask repo with ';' so a failing check still committed and pushed"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["CLAUDE.md", "tools/claude-toolkit/git-hooks/pre-commit"]
siblings_checked: "none: the targets are project files, not skills"
area: "the repo check before a push"
date: 2026-11-26
session_context: "Deeper dungeons session: after merging two workers, the controller ran 'cargo xtask repo 2>&1 | tail -1; git add ... && git commit ... && git push'. The check reported gameFrame.ts at 602 lines (over the 600 cap), and the commit and push went ahead. Fixed in the next commit (030778d59)."
parked_until:
resolved:
resolution:
reference:
commands_verified: "cargo xtask repo: run, printed the size problem; the push that followed: run, went through"
---

**Issue:** CLAUDE.md says to run `cargo xtask repo` before a push; the rule was followed in letter, but piped through `tail` and joined with `;`, its failure could not stop the commit or the push. A file over the size cap reached the remote branch.

**Suggested improvement:** A structural gate: the clone's pre-push hook (installed by install-all.sh beside the pre-commit guard) runs `cargo xtask repo` and refuses the push on a problem; or, at least, the kit's guidance says to gate with `&&` and never pipe the check's status away.

**Principle:** A check that must precede an action belongs in a hook on that action; a check run by habit in the same line can be silently ignored by its own plumbing.
