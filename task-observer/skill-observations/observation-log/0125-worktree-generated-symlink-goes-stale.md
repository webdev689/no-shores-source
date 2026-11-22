---
id: 125
title: "A worktree worker's symlinked generated/ broke when the main checkout rebuilt the schema during a merge"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: CLAUDE.local.md's worktree setup note (symlink node_modules and generated)"
area: "worktree workers"
date: 2026-11-22
session_context: "Overlook audit fixes: two worktree workers ran while the main session merged origin/main and ran npm run schema."
parked_until:
resolved:
resolution:
reference:
commands_verified: "npm run -s types in the worktree failed (roomConnection.test.ts arity); rm generated && npm run -s schema in the worktree fixed it"
---

**Issue:** The setup note tells worktree workers to symlink generated/ from the main checkout. When the main session
merged main and rebuilt the bindings, the worker's types broke on code it never touched.

**Suggested improvement:** Workers build their own generated/ (npm run -s schema in the worktree) rather than symlink
it; node_modules can stay linked.

**Principle:** Link only what no one rebuilds while the worker runs.
