---
id: 100
title: "Headless Chromium here destroys the game's WebGPU device about 2 s in, on every commit tried"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/webgpu-shot.cjs"]
siblings_checked: "related to 0096 (uiShot's blank read-back), a different failure: here the device itself is lost"
area: "browser QA of the game"
date: 2026-11-21
session_context: "Trying to reproduce the owner's intro freeze headless and to sample the worker's GPU memory over the intro."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: tools/claude-toolkit/webgpu-shot.cjs:7-11 (the driver patches the game's worker; the device loss was #108's cause)"
reference:
commands_verified: "run: main (225cd174), #127's merge, 78c918b5 (worker move), its parent e20d62fe (game on the page), and ?at=overlook-social all lose the device with reason 'destroyed' 2-3 s in, no JS destroy() call (patched prototype never fired), GPU process PID unchanged; a minimal worker device survives; the published page fails the same way headless"
---

- The page shows "The game could not start: A valid external Instance reference no longer exists": the ship kit's
  createRenderPipelineAsync is rejected after the device is lost with reason "destroyed". No script calls destroy();
  the GPU process is not restarted; minimal pages holding devices, decoding WebP in a worker or terminating nested
  workers do not reproduce it.
- So no headless picture or memory trace of the game can be taken in this container; a session that needs one should
  first check the device survives (a one-line LOST logger as an init script), and not read a failure as the game's.

**Principle:** Before reading a headless failure as the product's, check that the environment can run the commit
before the change at all.
