---
id: 197
title: "The picture driver cannot set night where the room keeps its own clock, and `&spawn=` also asks for foes"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "client/src/game/foesAsked.ts", "client/src/game/gates.ts"]
siblings_checked: "lattice worker's report only (webgpu-shot.cjs not read by the controller)"
area: "before/after pictures of the game"
date: 2026-11-24
session_context: "Lattice worker picturing its shading change at day and night. The `init` Date shift set no night once the room ran in its own thread or a server, because the room's word resets the clock. `foesAsked.ts` and `gates.ts` read the same `&spawn=` key, so a picture could not place the arrival without asking for foes too. graphify's first `update` took about 5 minutes with four workers building."
parked_until: "PR #243 merge"
resolved:
resolution:
reference:
commands_verified: "none"
---

**Issue:** Day/night before/after pairs cannot be controlled: the clock the driver shifts is not the one the room
sends. The pair the worker got was dusk against overcast day, which proves little.

**Suggested improvement:** A dev-only world-time hook the room thread honours (as `&speed=` is), named in Toolkit.md
beside the picture driver; and separate keys for where the arrival stands and which foes are asked.

**Principle:** A before/after picture is evidence only when everything but the change is held fixed; the driver
needs a handle on each thing that varies by itself (time, weather, foes).
