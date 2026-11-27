---
id: 239
title: "A slow GPU picture run waited 15 minutes on a start screen a no-GPU probe found in 100 seconds"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the target is a project file, not a skill"
area: "headless pictures through the picture driver"
date: 2026-11-25
session_context: "Picturing the stranger's face-to-face shot with webgpu-shot.cjs and ?arrival=1 on a development build. The first plan went straight to waitFor 'Grey Tithe' and timed out after 900 s: the page sat on 'CLICK OR PRESS ANY KEY TO START'. A noGpu plan dumping __ui() at 40 s and 100 s showed it at once; with a key press added the next GPU run reached the words. A second GPU run took its picture mid-flight: 12 frames at SwiftShader's pace were about 1.2 s of game time against the tour's 2.4 s camera flight; 36 frames settled it."
parked_until: "PR #243 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #243, merged 2026-11-27"
reference:
commands_verified: "node tools/claude-toolkit/webgpu-shot.cjs plan-probe.json (noGpu, ui dumps: the start screen, then the tour by 100 s); the GPU plans with { key: Enter } and frames 36 (both pictures taken)"
---

**Issue:** A picture plan for a moment deep in a flow was run straight on the GPU, where SwiftShader takes seconds a
frame, and failed only at its 15-minute timeout: the flow had stopped on a start screen the plan never pressed. The
same flow under `"noGpu": true` reached the moment in under two minutes and its `ui` dumps named the blocker at once.
The next GPU run then pictured a camera still flying, because frames were counted as if they were real time.

**Suggested improvement:** In Toolkit.md's Browser QA row: before a GPU picture of a moment reached through a flow,
run the same plan with `"noGpu": true` and `ui` dumps to see it reach the moment; count the frames a picture waits by
the game time a frame steps under SwiftShader, not by wall time.

**Principle:** Rehearse a slow, expensive run on a fast, cheap path that exercises the same control flow, and convert
waits into the run's own units of progress: a timeout on the slow path is the costliest way to learn of a blocker.
