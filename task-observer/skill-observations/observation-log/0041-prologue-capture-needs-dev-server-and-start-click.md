---
id: 41
title: "A ?prologue= capture needs the dev server and a start click; the Toolkit's recipe forbids the first and omits the second"
parked_until: "PR #243 merge"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: the capture driver and the Toolkit's Browser QA recipe. 0007 and 0008 are about the port; this is about the page's own start."
area: "overlook-source, headless WebGPU captures of the prologue"
date: "2026-11-20"
session_context: "Measuring the figure-card cache in the wreck fight with a temporary instrumentation patch."
commands_verified: "webgpu-shot.cjs with a frames step timed out after 600 s (bare TimeoutError); an eval of document.body.innerText showed 'CLICK OR PRESS ANY KEY TO START'."
---

`?prologue=<beat>` only starts a beat under `npm run dev` (Prologue.md), but the Toolkit says to capture a built page and
never the dev server, since an edit reloads it. Here, stashing the instrumentation and merging a worker branch in the
main tree reloaded the page under a running capture and spoiled it. And the page waits at "Click or press any key to
start": a `frames` step then waits its full 600 s and fails with no clue. Proposals: on any wait timeout, webgpu-shot
prints the page's visible text; the Toolkit's recipe says a beat capture needs `{"waitFor": "TO START"}, {"click": ...}`
first and that merges go in a separate worktree while a dev-server capture runs.
