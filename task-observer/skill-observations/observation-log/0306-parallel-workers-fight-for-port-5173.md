---
id: 306
title: "Parallel workers contend for port 5173, the only origin R2 answers; the perf probe hardcodes it"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/webgpu-perf.cjs", "tools/claude-toolkit/webgpu-shot.cjs"]
siblings_checked: "checked: uiShot.mjs now fetches R2 as from 5173 off that port (session branch f4455dea0); webgpu-shot anyPort fetches R2 for the page but not for the game worker's own fetches; webgpu-perf.cjs serves only on 5173"
area: "pictures and perf from parallel workers"
date: 2026-11-26
session_context: "Four workers (polish, textures, lights-core, lights-sea) ran at once; polish and lights-core pictures drew grey stand-in boxes off 5173, and lights-core and textures could not run the perf probe while 5173 was held."
parked_until:
resolved:
resolution:
reference:
commands_verified: "reported by workers polish, textures, lights-core; uiShot proxy run by worker textures"
---

**Issue:** Only one checkout can picture with real packs or probe performance at a time, so parallel visual work either waits or ships unpictured.

**Suggested improvement:** Give webgpu-shot's anyPort route the worker's R2 fetches too, let webgpu-perf.cjs take a free port with the same R2 route, and say in Toolkit.md that parallel workers queue for these.

**Principle:** Shared single resources (a port) need either a queue or a way around them before work fans out.
