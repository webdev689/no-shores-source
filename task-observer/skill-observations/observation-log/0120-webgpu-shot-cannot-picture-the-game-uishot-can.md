---
id: 120
title: "The game draws in a worker, so webgpu-shot cannot picture it; tools/uiShot.mjs pictures HUD pieces, and Node scripts on the real data measured the 3D fixes"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: Browser QA row of the Toolkit; observation 0068 logs the worker port lesson"
area: "verifying visual fixes headless"
date: 2026-11-22
session_context: "Overlook prologue pass: the wake camera, the sea fight's aim camera and the ship's bar needed checking without a GPU picture of the game."
parked_until:
resolved:
resolution:
reference:
commands_verified: "node tools/uiShot.mjs <shots.json> with a throwaway module exporting a build function (sea fight HUD at 1280x720, 1920x1080, 480x800); node scripts measuring the boom against the wreck mesh fetched from R2"
---

**Issue:** The Toolkit's Browser QA row points at webgpu-shot for pictures, which cannot draw the game since it moved to
a worker. The repository's own tools/uiShot.mjs draws any node tree through the real interface renderer and served the
HUD checks well; the 3D fixes were measured instead (the wreck's mesh from R2 against the camera's boom; the rig's
canvas at every wind against the aim's eye).

**Suggested improvement:** A line in the Browser QA row: for the game's HUD, tools/uiShot.mjs with a module exporting a
build function; for the game's 3D, measure against the real data with a Node script until webgpu-shot is worker-aware.

**Principle:** When the picture tool cannot reach a layer, measure that layer's numbers on the real data.
