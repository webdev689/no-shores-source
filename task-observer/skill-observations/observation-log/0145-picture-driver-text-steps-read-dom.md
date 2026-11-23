---
title: "The picture driver's waitFor and clickText read the page's DOM, which the drawn interface no longer has"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "bible/03-Code/Toolkit.md"]
siblings_checked: "0100 (device destroyed headless): not reproduced idle at b81f0c40, title 15 s and ?at=overlook-social 80 s kept the device; 0115 (lost under worker load)"
area: "browser QA of the game since the interface went to WebGPU"
date: 2026-11-23
session_context: "Owner asked how to set up a true headless environment, as sessions struggle to test since HTML went."
parked_until:
resolved:
resolution: "#165: waitFor, clickText and press read __ui(), the laid interface; noGpu runs the game with nothing drawn. Awaiting the owner's merge."
reference: "https://github.com/Lattymoy/no-shores-source/pull/165"
commands_verified: "webgpu-shot.cjs lines 240/255 use page.getByText; full Chromium + lavapipe: chrome://gpu Dawn Info lists only an ANGLE GLES compat adapter, requestAdapter gives SwiftShader"
---

- `waitFor` and `clickText` steps use `page.getByText`, but the page's only HTML is the canvas: those steps can no
  longer find anything, so a session can drive the game only by pixel coordinates and pictures.
- Lavapipe (mesa-vulkan-drivers) is not a way out: Chromium's WebGPU does not offer the CPU Vulkan adapter, only
  SwiftShader. At 960x540 the social space took 33 s for 3 frames under SwiftShader, its world still black.

**Principle:** When a layer a tool reads (the DOM) is removed, the tool's steps that read it go with it; give the
tool the new layer's equivalent (the laid interface tree) in the same change.
