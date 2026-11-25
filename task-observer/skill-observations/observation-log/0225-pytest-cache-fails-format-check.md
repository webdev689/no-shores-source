---
id: 225
title: "A pytest run leaves .pytest_cache/, which fails the local format check"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: [".prettierignore", ".gitignore"]
siblings_checked: "none: one file pair"
area: "the full check run locally after Python tool tests"
date: 2026-11-24
session_context: "#200: `python3 -m pytest tools/freesound` wrote .pytest_cache/README.md; `cargo xtask check` then failed at `format (TypeScript)` on it. CI never sees it (untracked)."
parked_until:
resolved:
resolution:
reference:
commands_verified: "cargo xtask check failed with '[warn] .pytest_cache/README.md'; passed past format once the folder was removed"
---

**Issue:** Running the freesound tool's tests with pytest leaves `.pytest_cache/` at the root; prettier checks it and
the local full check fails at its format step, costing a full rerun.

**Suggested improvement:** Add `.pytest_cache/` to `.prettierignore` (and `.gitignore` if absent), or run the tool's
tests as CI does (`python3 -m unittest`), which writes no cache. A repository change, so the owner's call.

**Principle:** A local test run should leave nothing the next check reads.
