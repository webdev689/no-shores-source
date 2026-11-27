---
id: 134
title: "roomThread.test.ts waits a fixed 5 ms for a worker's failure and fails under the full check's load"
status: actioned
type: project
skill: []
proposes_skill: []
target_file: ["client/src/network/roomThread.test.ts"]
siblings_checked: "none: the target is one test file, not a skill"
area: "tests that wait on a worker with a fixed timer"
date: 2026-11-22
session_context: "Overlook: cargo xtask check on 3cfc941d failed once at 'a room that fails in the worker is lost' (node.lost still unset after settled(), a 5 ms setTimeout); the file passed 5 of 5 alone and the change under check did not touch it."
parked_until:
resolved: 2026-11-27
resolution: "roomThread.test.ts now waits until node.lost, up to 2 s (96e34833, PR #154)"
reference:
commands_verified: "node --import ./tools/testStyles.mjs --test client/src/network/roomThread.test.ts (5 runs, all pass)"
---

**Issue:** The test sends bytes the room's door throws on in a real worker, then waits `settled()`, a 5 ms timer,
before asserting the room is lost. Under the whole suite's load the worker's report can take longer, so the check
fails on work that did not touch it, and the run must be repeated.

**Suggested improvement:** Wait on the event itself (poll `node.lost` until set, with a generous cap) instead of a
fixed short timer; propose it to the owner as its own change.

**Principle:** A test that waits for another thread should wait for the outcome, not for a guessed time.
