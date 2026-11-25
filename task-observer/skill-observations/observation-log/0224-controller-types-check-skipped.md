---
id: 224
title: "The controller type-checked only the page's tsconfig, so test type errors and a timed-out tsc passed as clean"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "0063 (actioned for workers' briefs: npm run -s types); the controller's own practice has no line for it"
area: "the controller's focused checks before a push"
date: 2026-11-24
session_context: "#200: the controller ran `npx tsc -p tsconfig.json | head` after its own fixes and a merge; tsconfig.node.json (the tests) had 7 errors, one from the controller's own change, found only when a later merge made the controller run each project with its exit code."
parked_until:
resolved:
resolution:
reference:
commands_verified: "npx tsc --noEmit -p tsconfig.node.json exited 2 with hud.test.ts, sampled.test.ts and breach.test.ts errors while tsconfig.json exited 0"
---

**Issue:** Observation 0063 put `npm run -s types` (all three tsconfig projects) in the workers' brief, but the
controller's own fixes were type-checked with `tsc -p tsconfig.json` alone, which leaves out every test file. Piped
into `head`, a tsc killed by `timeout` under load prints nothing, which reads as clean.

**Suggested improvement:** The Toolkit's controller checks name `npm run -s types` (never one tsconfig), and say to
print each check's exit code rather than read an empty output as a pass.

**Principle:** A check is clean when its exit code says so, not when its output is empty.
