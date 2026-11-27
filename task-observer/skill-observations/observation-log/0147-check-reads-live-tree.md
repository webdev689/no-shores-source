---
id: 147
title: "A full check run in the working checkout tested edits made while it ran, then said 'nothing uncommitted'"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: cargo xtask check is the only full check; its final line is the only commit stamp"
area: "running the 45-minute cargo xtask check while continuing to work"
date: 2026-11-23
session_context: "Overlook Playlist session: the controller started cargo xtask check in the main checkout at commit 6e916478 and kept fixing audit findings in the same tree. The TypeScript tests ran 30 minutes in, over uncommitted look changes, and modelsWorn.test.ts failed; by the end the edits were committed, so the check printed 'checked 6e916478, nothing uncommitted'. The failure was blamed on the commit until a revert showed the commit passed."
parked_until: "PR #240 merge"
resolved:
resolution:
reference:
commands_verified: "run: cargo xtask check > log (background) while editing client/src/player/gear.ts -> 'not ok ... every weapon and armour layer'; git revert + node --test modelsWorn.test.ts -> pass"
---

**Issue:** `cargo xtask check` reads the working tree as each step runs, and stamps the commit and the dirty state only
at its end. Edits made during the run are tested under another commit's name, and a clean end stamp hides them.

**Suggested improvement:** Run the full check in a clean worktree of the commit (`git worktree add` at HEAD, sharing
`CARGO_TARGET_DIR`), or stop editing until it ends; have xtask record `git status --porcelain` at its start too and
print both.

**Principle:** A check result belongs to the tree it read, so the tree must not move while it reads.
