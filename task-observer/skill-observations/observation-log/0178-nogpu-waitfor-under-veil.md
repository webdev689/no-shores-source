---
id: 178
title: "A noGpu waitFor on the key strip's words passes behind the arrival veil, so a held key after it is held while nothing on foot is offered"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none"
area: "driving the game headless"
date: 2026-11-24
session_context: "A plan waited for 'On foot' (the strip's head), then held M to leave: nothing happened. The HUD lays the strip under the veil ('Arriving at Overlook'), and leaving is not offered behind it. Waiting for 'Map', which shows only once the veil lifts, worked."
parked_until:
resolved:
resolution:
reference:
commands_verified: "node tools/claude-toolkit/webgpu-shot.cjs <plan with noGpu, waitFor Map, hold m 2.5>"
---

**Issue:** __ui lists what is laid, the veil's covered layers too, so words seen are not words the player can act on.

**Proposal:** Toolkit's Browser QA: to act on foot, wait for something laid only once the veil lifts (the strip's
Map, or the veil's words gone).
