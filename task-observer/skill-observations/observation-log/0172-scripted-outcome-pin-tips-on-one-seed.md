---
id: 172
title: "A rules fix tipped a scripted bot run's pinned outcome at its one minute; only a sweep over many minutes told chance from a harder event"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "0097 (stop hook asks for a push mid-check): related only by timing"
area: "re-pinning scripted outcomes after a rules change"
date: 2026-11-24
session_context: "Patrol audit 'Fix everything': server/public.test.ts's page-bot raid at RAID_MINUTE went from held to stores lost after the off-mesh return to the navmesh (abbfc470). Bisected in a worktree (c0249eab passes, abbfc470 fails), then each change of abbfc470 taken out alone. A sweep of 12 raid minutes, heroic and plain, with and without the change: heroic held 3 to 2, plain 11 both ways; only the pinned minute differed."
parked_until: "PR #244 merge"
resolved:
resolution:
reference:
commands_verified: "node --test --test-name-pattern=... server/<copy>.test.ts with a probe test appended, in a worktree with generated/ copied and node_modules linked"
---

**Issue:** A test that pins a scripted run's outcome (held or failed) at one seed or minute fails when any rule
nudges a foe's path, and the failure reads as "the raid got harder". The same happened at the main merge earlier in
the session. Re-pinning blind hides a real regression; refusing to re-pin blocks a sound fix.

**Suggested improvement:** In Toolkit.md's testing notes: when a pinned scripted outcome flips, attribute the change
(bisect, then one change out at a time), then sweep the scenario over ten or more seeds or minutes with and without
it, and re-pin only if the counts barely move; put the counts in the commit and the PR.

**Principle:** One pinned seed is a tripwire, not a measure; judge a flipped outcome by its rate over many seeds.
