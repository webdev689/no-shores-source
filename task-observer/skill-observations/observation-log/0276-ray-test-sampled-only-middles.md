---
id: 276
title: "A geometry test that samples one point per opening passes over openings partly covered"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Testing.md"]
siblings_checked: "checked — a testing practice, no skill family covers it"
area: "geometric tests of openings (windows, doorways)"
date: "2026-11-25"
session_context: "#207 audit: 'an open building's windows are holes through its wall' cast one ray through each pane's middle. A lower wing's gable reached half a metre into 33 windows' feet in 16 buildings; every middle stood above it, so the test passed. Sampling near the four corners as well failed 60 panes on the old code and none on the fix."
parked_until:
resolved:
resolution:
reference:
commands_verified: "node --test --test-name-pattern='windows are holes' client/src/models/buildings.test.ts: before the fix, 'seen through: 24276 of 24336' with corner samples; with middles only it passed"
---

**Issue:** A test of "nothing blocks this opening" sampled only its centre, so anything covering an edge or corner
went unseen, and a reviewer's report of the fault was first contradicted by the passing test.

**Suggested improvement:** Testing.md: a geometric "clear through" test samples an opening's centre and points near each
corner (inset a little), and says how many it found blocked.

**Principle:** An assertion that a region is clear must sample the region's extent, not one representative point; a
single sample tests the point, not the region.
