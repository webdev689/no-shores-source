---
id: 15
title: "A worker brief that lists `tsc -p tsconfig.json` lets test files' type errors through to the full check"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: the target is a kit template, not a skill"
area: "worker pre-commit checks"
date: 2026-11-20
session_context: "Overlook factions round: the controller's brief told four workers to run `npx tsc --noEmit -p tsconfig.json`; a test file's type error passed every worker and failed `cargo xtask check` (its `npm run types` also runs tsconfig.node.json, which holds the tests)"
parked_until: "PR #242 merge"
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

**Another instance, 2026-11-20 (the main session, not a worker):** before the full check, `npx tsc --noEmit -p tsconfig.json` passed a test reading `role` and `ariaLabel` off the fake page's `FakeElement`; the full check's `npm run -s types` (which also runs `tsconfig.node.json`) failed it. The same round the spot checks also missed the `[layers] plus may not import combat` repo check and an `id-length` lint, each found only by the 15-minute full check. The fast pre-check that matches it is `npm run -s types && npm run -s lint && cargo xtask repo`.

2026-11-23, the patrol audit's "Fix everything" (controller, not a worker): the controller itself ran
`npx tsc --noEmit -p .` after each page change and called the types clean; `cargo xtask check`'s `npm run -s types`
(three configs) then failed on `client/src/game/hudMarks.test.ts` importing `ScreenMark` from the wrong module, which
cost a whole check run. The same gap as the worker brief's, in the controller's own habit: the only types command
that answers for the check is `npm run -s types`.

2026-11-24, workers cavefoes and layouts: neither ran the cheap pre-checks; after both merges the full check failed
first on `npm run -s format:check` (an unformatted `layouts.test.ts`), and `cargo xtask repo` found the layout
crate's `lib.rs` at 633 lines. The fast pre-check a worker should run is `npm run -s types && npm run -s lint &&
npm run -s format:check && cargo xtask repo`, each seconds long.

2026-11-26, character slots and test runs (controller's own brief again): the controller's hand-filled "Hard rules"
told three workers to run "`npx tsc -p <the tsconfig of what you changed>`"; worker testruns ran
`server/tsconfig.json`, reported tsc clean, and `server/testRuns.test.ts` failed `npm run -s types` after the merge
(TS18047, a `readFromRoom` result read without a null check). The same rule broken by the same author after four
logged instances: wording is not holding it. Barrier proposed: `workers/audit.py` (or run-worker.sh's finish step)
runs `npm run -s types` on the worker's head and prints TYPES FAIL as it prints MISSING, so a worker cannot report
"types clean" past it, and the template's Hard rules line names `npm run -s types && npm run -s lint && cargo xtask
repo` as the one pre-commit set, with no `<tsconfig>` placeholder to fill.
