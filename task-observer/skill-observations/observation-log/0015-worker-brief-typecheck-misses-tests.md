---
id: 15
title: "A worker brief that lists `tsc -p tsconfig.json` lets test files' type errors through to the full check"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: the target is a kit template, not a skill"
area: "worker pre-commit checks"
date: 2026-11-20
session_context: "Overlook factions round: the controller's brief told four workers to run `npx tsc --noEmit -p tsconfig.json`; a test file's type error passed every worker and failed `cargo xtask check` (its `npm run types` also runs tsconfig.node.json, which holds the tests)"
parked_until:
resolved:
resolution:
reference:
commands_verified: "cargo xtask check (== types (TypeScript) failed, artLevels.test.ts TS2339): run; npm run -s types after the fix: run"
---

**Issue:** The controller wrote the worker brief's check list by hand and named the client's tsconfig alone. The
project's own `npm run types` checks three tsconfigs, the tests' among them, so a worker's test with a type error was
committed as "tsc clean" and caught only by the full check later.

**Suggested improvement:** The brief template's "before committing" line names the project's own aggregate commands
(`npm run -s types`, or `cargo xtask check` where it is quick enough), never a hand-picked subset.

**Principle:** A delegated check list should call the project's own aggregate check, not a hand-copied subset of it;
the subset silently drifts from what CI runs.
