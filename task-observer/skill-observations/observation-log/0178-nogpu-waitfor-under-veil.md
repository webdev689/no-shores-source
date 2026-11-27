---
id: 178
title: "A noGpu waitFor on words the arrival veil also holds (the key strip's, or the node's name) passes behind the veil, so the steps after it act before the game is up"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none"
area: "driving the game headless"
date: 2026-11-24
session_context: "A plan waited for 'On foot' (the strip's head), then held M to leave: nothing happened. The HUD lays the strip under the veil ('Arriving at Overlook'), and leaving is not offered behind it. Waiting for 'Map', which shows only once the veil lifts, worked. Again 2026-11-24 (revives branch, #184): a plan waited for 'Saltgrass', matched by the veil's 'ARRIVING AT THE SALTGRASS DOWNS', and its next eval found self.__qaGame undefined, the game not yet started past bootGame; 1500 frames later every __qa hook was there."
parked_until: "PR #243 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #243, merged 2026-11-27"
reference:
commands_verified: "node tools/claude-toolkit/webgpu-shot.cjs <plan with noGpu, waitFor Map, hold m 2.5>"
---

**Issue:** __ui lists what is laid, the veil's covered layers too, so words seen are not words the player can act on.

**Proposal:** Toolkit's Browser QA: to act on foot, wait for something laid only once the veil lifts (the strip's
Map, or the veil's words gone).

**Second instance:** a waitFor on the node's own name passed on the veil's "Arriving at" line. An `eval` reading
`self.__qaGame` then threw, because the hooks are lent only once the game starts. Any word the veil can also hold is
unsafe to wait for.
