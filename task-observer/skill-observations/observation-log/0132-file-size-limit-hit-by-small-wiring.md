---
id: 132
title: "Three files at the 600-line limit failed the repo check only at the full check's end, after small wiring"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "CLAUDE.local.md's Layers note covers imports, not size"
area: "adding a feature that touches game.ts, ui.ts and gearMessages.ts"
date: 2026-11-22
session_context: "The Compendium added 4 lines to game.ts (599), 5 to ui.ts (600) and 22 to gearMessages.ts (593); the size check, last in cargo xtask check, failed 25 minutes in."
parked_until:
resolved:
resolution:
reference: "client/src/network/loreMessages.ts split out; ui.renderer.measure used in place of a new Interface method"
commands_verified: "run: cargo xtask repo -> 'repo checks: 3347 files, no problems' after the split"
---

**Issue:** `game.ts`, `ui/ui.ts` and `network/gearMessages.ts` stand at or near the 600-line limit, so a few
lines of wiring push them over. The size check runs last in `cargo xtask check`, so the failure came after a
25-minute run.

**Suggested improvement:** Toolkit.md: before the full check, run `cargo xtask repo` (seconds); before adding to a
file, `wc -l` it, and put a new part's reading or types in a file of their own (as `questMessages.ts` does).

**Principle:** Run the seconds-long check before the half-hour one.
