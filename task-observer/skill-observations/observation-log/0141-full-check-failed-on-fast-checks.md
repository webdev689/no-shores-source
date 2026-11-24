---
id: 141
title: "The full check failed three runs in a row on checks that take seconds: Prettier, ESLint's id-length and the 600-line size rule"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the target is the toolkit note's working practice, not a skill"
area: "running cargo xtask check before a push"
date: 2026-11-23
session_context: "No Shores, a smith's ware drawn by the id it takes once bought (#164). Each full `cargo xtask check` takes minutes; run 1 failed on Prettier in the new test, run 2 on ESLint id-length (`at`), run 3 on gear_wire.rs at 601 lines. Each would have shown in seconds with `npx prettier --check <changed files>`, `npx eslint <changed files>` and `cargo xtask repo`."
parked_until:
resolved:
resolution:
reference:
commands_verified: "cargo xtask check (three failing runs, then a pass on 9f519e1c); cargo xtask repo; npx prettier --check; npx eslint"
proposal: "Toolkit.md: before the full check, run `npx prettier --check` and `npx eslint` on the changed TypeScript files and `cargo xtask repo`, then the full check once."
---

**Instance (2026-11-24, worker words):** `npm run lint` does not run Prettier on new untracked files, so a new content file's formatting is caught only by the full check's format step or by a hand-run `npx prettier --check`.
