---
id: 4
title: "A worktree's client tests fail until the ignored generated/, target/ and client/public/ are linked in"
status: open
type: internal
skill: [superpowers:using-git-worktrees]
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none — no skill-families.md in this workspace; the Toolkit's Workers section is the project's own home for the recipe"
area: "Toolkit, Workers: each worker in its own git worktree"
date: 2026-11-20
session_context: "Auditing #95 with sub-agents that mutated code in a worktree"
parked_until:
resolved:
resolution:
reference:
commands_verified: "run (by the auditor): node --import ./tools/testStyles.mjs --test client/src/combat/*.test.ts client/src/game/*.test.ts in /tmp/audit-a — 11 files failed on 'room_wasm.wasm is not built' until generated/, target/ and client/public/ were symlinked; then 511 of 511 passed"
---

**Issue:** an auditor given a worktree recipe (`git worktree add`, then link `node_modules`) found 11 client test files
failing with "room_wasm.wasm is not built" and missing generated messages. The tests read ignored build products:
`generated/` (FlatBuffers code), `target/` (the WebAssembly the tests load) and `client/public/`. The brief, written by
the controller, did not say so; the auditor had to find it.

**Suggested improvement:** in the Toolkit's Workers section, the worktree recipe links `node_modules`, `generated/`,
`target/` and `client/public/` from the main checkout (or runs `npm run -s schema && npm run -s wasm` there), so a
worker's or auditor's tests run as the main checkout's do.

**Principle:** a fresh worktree holds only what git tracks; any check that reads ignored build products needs them made
or linked first, and the recipe that makes the worktree should say which.
