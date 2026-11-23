---
id: 150
title: "The ship aim's tests checked the camera against its own target, never against where the rules' balls fall, so an offset survived several iterations"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: the same shape could hide in any client view that must line up with a rules answer (the foot crosshair, the held map's marks); only the ship aim was measured this session"
area: "testing a client view that must line up with the authoritative rules"
date: 2026-11-23
session_context: "Ship aim session: the owner said the aim UI was still off the camera's middle after many iterations. aimCamera.test.ts asserted that the view's middle meets the sea at the range the camera itself chose. A Node probe that drove SeaCombat on the real land_wasm rules and projected the lay's landing zone with camera.ts onScreen found it 90-100 px above the crosshair at 1080p: the rules laid for a flat sea at the ship's heave while the camera aimed at sea level and the balls fell on the swell. The same probe, holding every third answer a frame, showed the eye 0 to 13 cm off its station on the drawn ship frame to frame (the jitter)."
parked_until:
resolved:
resolution:
reference: "session scratchpad aimProbe.ts (session-local; the method is in the body)"
commands_verified: "run: node --import ./tools/testStyles.mjs aimProbe.ts -> zone px off middle 0.5,-88.9 before; -2.1,0.9 after; eye off station 0/6.6/13.2 cm before, 0.0 after"
---

**Issue:** Several rounds of the ship aim were tested only inside the client's model: the camera's test checked that
the view's middle meets the water at the range the camera computed, which is true by construction. Nothing measured
the thing the owner looks at: where the rules' lay actually lands on the screen. The rules laid for a sea at rest at
the ship's own heave; the balls fell on the swell metres past the crosshair. The jitter was the same shape: the eye
was placed from one answer and the ship drawn from the next, invisible to any test that never compared the two.

**Suggested improvement:** In `bible/03-Code/Toolkit.md` (Browser QA or a "Measuring" line), say: a client view that
must line up with a rules answer is measured by driving the client class on the real wasm rules (`startLand` on
`target/.../land_wasm.wasm`) and projecting the rules' output with `onScreen`, per frame, including frames whose
answers come late; the pixel offset is the number to report and to pin in a test.

**Principle:** When a view must line up with what an authority computes, test the line-up against the authority's
real answer, never against the view's own model of it; a test that checks a value against the code that produced it
passes forever.
