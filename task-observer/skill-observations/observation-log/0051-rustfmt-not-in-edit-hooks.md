---
id: 51
title: "Checks that fail the final gate (rustfmt, the client layer check) have no cheap twin in the edit loop"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/hooks/syntax-check.py"]
siblings_checked: "none: the target is a kit hook, not a skill"
area: "worker edit loop: Rust formatting and timing tests"
date: 2026-11-19
session_context: "Waters worker (rustfmt) and drawing worker (client layer imports) reported it in their OBSERVATIONS lines."
parked_until:
resolved: 2026-11-20
resolution: "hooks/syntax-check.py runs rustfmt --check on each .rs; the layer check's twin is the brief template's 'cargo xtask repo after changing imports' (per-edit in the hook was judged too slow); Testing.md says how a speed target is pinned (PR #93 (claude/toolkit-review, d68f49a))"
reference:
commands_verified: "NOT RUN: reported by the worker; the syntax hook's scope (.py/.js) is stated in Toolkit.md"
---

**Issue:** The kit's PostToolUse hook checks only .py and .js files. A worker editing Rust learned of rustfmt's
complaints only from `cargo xtask check`, costing an extra full round on a 4-core machine shared by three workers. It
also found clippy forbids `Instant::now` in tests, so the brief's speed targets could not be pinned as tests and were
measured by hand.

The drawing worker hit the same shape with the client's layer check: an import the `LAYERS` table forbids
(ships to editor or network, textures to ships or plus) showed up only in the full check, late.

**Suggested improvement:** Have the syntax hook run `rustfmt --check` (or `rustfmt` in place) on an edited .rs file.
Run the client layer check on an edited .ts file in the same hook. And say in Testing.md how a speed target is pinned when clocks are banned in tests (an ignored bench, or a count of
work done).

**Principle:** Every check that can fail the final gate should have a cheap twin in the edit loop.
