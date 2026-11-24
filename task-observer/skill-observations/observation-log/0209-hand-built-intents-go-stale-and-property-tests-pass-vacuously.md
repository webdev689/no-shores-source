---
id: 209
title: "A test's hand-built 17-number intent went one short when main's controls grew a boost; the room read no ask, one test failed, and the random-run test passed doing nothing"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["server/outpostReload.test.ts", "server/snapshotEdges.test.ts", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: only server/outpostReload.test.ts and server/snapshotEdges.test.ts build an intent as a literal Float64Array; main's commit c6f10d87 fixed the second and could not see the first, which lived on an unmerged branch"
area: "tests that write wire inputs by hand, and property runs that only compare totals"
date: 2026-11-24
session_context: "PR #179, merging main at 761e5937 before the owner's merge: main's 'A body is 24 numbers and its controls 8' grew INTENT_FLOATS from 17 to 18. The guild branch's outpostReload.test.ts wrote its still intent as a 17-number literal. After the merge the room read no deposit: the reload test failed on 1000 !== 500, while the sail-off test and the 12-seed random run passed, because start and end totals match when nothing happens. Fixed with an 18-number intent and an assert that the run's errands reached the accounts (outpost_errands rows > 0), watched failing on the old intent."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: SEEDS=3 node --test --test-name-pattern='neither make nor lose' server/outpostReload.test.ts with the 17-number intent -> fails 'the errands of the run reached the accounts'; with 18 -> passes"
---

**Issue:** Tests that build a wire input as a number literal break silently when the layout grows. A property test that only checks that totals are conserved passes when nothing happens at all.

**Suggested improvement:** Build test intents from the layout's own constants (CONTROLS_FLOATS, the protocol's NO_FIGHT), or one shared helper, never as a literal. Every conservation property test should also assert that its run did something (rows written, moves made).

**Principle:** A test should fail when the thing it tests never ran. Conservation holds trivially when nothing moves.
