---
id: 304
title: "A worktree's link to the main checkout's client/public was committed by git add -A, and merging it replaced the main checkout's folder"
status: open
type: internal
skill: []
proposes_skill: []
target_file: [".gitignore", "tools/claude-toolkit/git-hooks/pre-commit", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: .gitignore ignores client/public/*.wasm and client/public/isle-packs/, which match nothing for a link named client/public; node_modules and generated are ignored whole, so their links were not added"
area: "worktrees that link the main checkout's build folders"
date: 2026-11-26
session_context: "#223's left-for-later: a worktree made by hand linked node_modules, generated and client/public; git add -A committed client/public as a symlink (mode 120000); merging that branch into the main checkout turned its client/public into a link to itself and git removed the ignored wasm in it. Caught before push, the two commits rebuilt without it, the wasm rebuilt with npm run -s wasm."
parked_until:
resolved:
resolution:
reference: "95e0955e0 (later), rebuilt as 33de197e1 on ccr-6e659de3-v7ph7h"
commands_verified: "git show --name-status 95e0955e0: showed 'A client/public'; ls -la client/: showed the self-link"
---

**Issue:** A link to a build folder is not matched by the folder's ignore patterns, so git add -A commits it, and checking it out over the real folder deletes the ignored files inside.

**Suggested improvement:** Ignore `/client/public` as a path (not only its contents' patterns), and have the pre-commit guard refuse any symlink (mode 120000); in the Toolkit, stage by path in a worktree with linked folders, never git add -A.

**Principle:** Check what a broad git add staged before committing, above all in a worktree with links into another checkout.
