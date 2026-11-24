---
id: 200
title: "Sea picture plans: one __qaSea() can leave the page on foot, and a grep for 'Error' matches the plan's own text"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "bible/03-Code/Toolkit.md"]
siblings_checked: "sea worker's report only"
area: "picturing the sea"
date: 2026-11-24
session_context: "Sea worker picturing other ships' marks and the fogless map. A single `__qaSea()` sometimes left the page on foot, so plans had to ask again until `flow.mode` was 'sea'. Ships injected north of the sea camera fell behind it. A monitor grepping the run's log for 'Error' matched the plan's own eval text and woke early."
parked_until:
resolved:
resolution:
reference:
commands_verified: "none (from the worker's report)"
---

**Issue:** Sea picture plans fail quietly: the page may not be at sea when the shot is taken, and log watchers
trip on the plan echoing its own code.

**Suggested improvement:** Toolkit.md's picture recipe for the sea: wait on `flow.mode === 'sea'` (retrying the
hook) before any shot; place injected ships ahead of the camera's bearing; watch the driver's exit or a sentinel
line it prints, not a grep for 'Error'.

**Principle:** A picture step should wait on the state it pictures, and a watcher should key on a line only the
tool prints.
