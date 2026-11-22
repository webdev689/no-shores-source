---
id: 123
title: "A frozen picture in the game's worker was found in minutes by stubbing the GPU and pausing the worker over CDP"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "tools/claude-toolkit/webgpu-shot.cjs (on ccr-130008df-u4ahst-headless) patches the worker to draw; it has no stall probe"
area: "reproducing a freeze or hang in the game's worker headless"
date: 2026-11-22
session_context: "The owner's intermittent intro freeze. Headless SwiftShader drew the story at 0.2 frames a second, too slow to reach it; with the worker's queue.submit dropped, the JS ran at 60 fps and the sighted beat wedged at 70 s."
parked_until:
resolved:
resolution:
reference: "scratchpad heaprun2.mjs, prelude-nogpu.js (this session); fix 5a78ea5d"
commands_verified: "run: Q=?prologue=sighted PRELUDE=./prelude-nogpu.js node heaprun2.mjs <dist> 90 out.json -> 'NO ANSWER to Runtime.evaluate' then 'PAUSED: lay < placeShipBars < platesNode'"
---

**Issue:** Earlier tries at the owner's freeze ran the game headless with a working (software) GPU. SwiftShader
draws the story at a frame every few seconds, so a JavaScript hang that comes after minutes of play was never
reached, and heap samples looked flat. Two steps found it in one run: drop the worker's `GPUQueue.submit` (the
JavaScript then runs every frame at full speed, onSubmittedWorkDone resolving at once), and give each CDP call to
the worker a timeout, so a worker that stops answering is paused with `Debugger.pause` and its stack printed.
Starting at a story beat needed the built bundle patched, as `?prologue=` is read only in development.

**Suggested improvement:** Toolkit.md, under the picture driver: for a freeze or a hang, run the built game with
submissions dropped, the story at each beat, and a stall probe (CDP timeout, then `Debugger.pause` on the worker).
A small script for it next to webgpu-shot.cjs.

**Principle:** To find a hang in code that runs only after the GPU, take the GPU out of the loop rather than
waiting on a slow one; and ask a thread that stopped answering where it is, by pausing it.
