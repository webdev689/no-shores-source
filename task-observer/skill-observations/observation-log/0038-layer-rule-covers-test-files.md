---
id: 38
title: "A cinema test importing the game passed every local check and failed only the full repo check"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "family: per-file checks run before the full check this session (prettier, eslint, tsc, node --test). None of them reads the layer table in crates/xtask/src/checks/layers.rs."
area: "overlook-source, cross-layer test files"
date: "2026-11-20"
session_context: "Fixing the prologue's fire light; a round-trip test for a new cinema helper imported game/camera.ts."
commands_verified: "cargo xtask check (repo checks: '[layers] cinema may not import game'); cargo xtask repo"
---

The layer rule (crates/xtask/src/checks/layers.rs) covers test files too: cinema may import only water and combat.
Lint, types and the test run all passed, so the break showed only at the end of a full cargo xtask check. A test that
joins two layers lives in the layer allowed to import the other (here game/camera.test.ts). Proposal: Toolkit.md's
pre-push list runs `cargo xtask repo` (seconds) right after a new import across folders, before the slow full check.
