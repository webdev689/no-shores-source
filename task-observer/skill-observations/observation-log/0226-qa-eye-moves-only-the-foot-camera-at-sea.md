---
id: 226
title: "At sea, __qaEye does not move the camera (only the camera on foot reads QA_EYE); a dressed ship was pictured by setting __qaGame.sea.view.camera's yaw, a wheel step in, and patching sea.drawn.ownSeen for the hull and dress"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the target is a project note, not a skill"
area: "headless pictures of the sea"
date: 2026-11-24
session_context: "Ships at the Harbourmaster: to picture a Brig in Harbour Blue, Gold Leaf and Harbour Cloths at sea offline, two eval steps of self.__qaEye([...]) left the sea view's camera where it was (two identical pictures, about 2 minutes each). What worked: an eval setting sea.view.camera = { ...camera, yaw: yaw + PI/2 }, a { wheel: [640, 330, -100, 30] } step to bring the view in close, and sea.drawn.ownSeen = () => ({ ...sea.room.ownShip, hull: 2, dress: [2, 17, 25, 37], emblem: 4 }), since the offline page holds no gear; a click on the water sets sail to show the canvas."
parked_until:
resolved:
resolution:
reference:
commands_verified: "NODE_ENV=development npx vite build; npx vite preview --port 5173; node tools/claude-toolkit/webgpu-shot.cjs <plan with the steps above>"
---

**Issue:** The Toolkit note says __qaEye stands the camera anywhere offline, which holds on foot only; at sea it silently does nothing, and each wasted picture costs minutes of SwiftShader frames.

**Suggested improvement:** In the Toolkit note's Browser QA row: at sea, turn the view with __qaGame.sea.view.camera (yaw, tilt) and bring it in with wheel steps; picture a player's own ship in a hull or dress the offline page lacks by replacing sea.drawn.ownSeen. Or make __qaEye apply to the sea view's shot too, so one hook works everywhere.

**Principle:** A test hook that works in one mode and silently not in another should say so where it is documented, or work in both.
