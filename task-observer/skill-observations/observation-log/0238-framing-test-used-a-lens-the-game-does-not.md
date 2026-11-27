---
id: 238
title: "A camera-framing test passed with a lens the game never uses: its 57 degree stand-in hid crowns cut off at the top edge under the real 50 degree lens"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Testing.md"]
siblings_checked: "none: the target is a project file, not a skill"
area: "testing what a camera frames"
date: 2026-11-25
session_context: "The owner reported the camera sitting too low while the stranger speaks in Overlook. framing.test.ts built its shot from OWN with fov: 1 (57 degrees) and asserted only crown y > 0; the game's lens is WALK_LENS.fov (50 degrees), under which the old facesShot put the pair's crowns at y = -0.002 of the view, cut off, with two thirds of the frame pavement. Worked out on paper from onScreen's projection before any picture; the new test loops the real lens and two others and bounds each share (crown 0.1 to 0.2, feet 0.3 to 0.4)."
parked_until: "PR #244 merge"
resolved:
resolution:
reference:
commands_verified: "node --test client/src/game/welcome/framing.test.ts (the new lens-looped test fails on the old framing.ts and passes on the new)"
---

**Issue:** A framing test stood its shot on a hand-made lens (fov 1 rad) rather than the game's own constant, and
asserted only that a crown was on the screen at all (y > 0). Under the game's narrower lens the same shot cut the
crowns off, so the test was green over the very defect the owner then reported.

**Suggested improvement:** In Testing.md's camera and framing notes: a test of what a shot frames builds it with the
game's own lens constant (and any other the player can have), and bounds each framed point's share of the view on
both sides (a range), never a bare "on screen".

**Principle:** A geometric test must use the production constants it depends on, and assert a tolerance band rather
than a one-sided existence check: a stand-in value plus a one-sided bound passes over the edge case the real value
produces.
