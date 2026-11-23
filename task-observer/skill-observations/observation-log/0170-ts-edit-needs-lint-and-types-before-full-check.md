---
id: 156
title: "A TypeScript test edited by script went to the full check without its own lint and type check, so two full runs stopped at one-line faults"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.local.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: no installed skill owns the repo's check loop; checked superpowers verification-before-completion by name, which says verify before claiming but not which fast checks precede a slow one"
area: "running the repo's slow full check after small edits"
date: 2026-11-23
session_context: "Audit fixes for a writing pass added a timing test to client/src/game/prologue/seaBeats.test.ts by python. The full `cargo xtask check` (about 25 minutes) failed first at ESLint id-length on a variable named `at`, then, after a rename, at tsc (JSON scene typed as string where the Line type wants 'bark'). Each fault took seconds to find with `npx eslint <file>` and `npm run -s types`, and xtask stops at the first failed step."
parked_until:
resolved:
resolution:
reference: "branch ccr-c249af15-iwfmsb commits 4d6b2823 and 06899477"
commands_verified: "run: npx eslint client/src/game/prologue/seaBeats.test.ts -> 2 id-length errors before the rename, clean after; run: npm run -s types -> TS2322 before scenesOf, exit 0 after"
---

**Issue:** The project's learned pattern says to run prettier after scripting a .ts edit; prettier alone passed, and the slow full check then failed twice on faults the file's own lint and type check find in seconds.

**Suggested improvement:** Extend the learned pattern: after editing any .ts file, run `npx prettier --write <file> && npx eslint <file> && npm run -s types` and the file's own tests before starting `cargo xtask check`.

**Principle:** Before a slow gate that stops at its first failure, run each of its fast steps on the files you touched; a slow gate is the last proof, not the first test.
