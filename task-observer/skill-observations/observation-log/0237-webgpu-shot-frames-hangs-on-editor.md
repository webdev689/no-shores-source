---
id: 237
title: "webgpu-shot's `frames` step hangs on the World Editor, which draws only on change, and the driver had no mouse-button steps to pan its 3D view or hold the aim"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the target is a project tool and its note, not a skill"
area: "headless pictures of the World Editor"
date: 2026-11-25
session_context: "Picturing each hull's aim in the World Editor (?hull=): a plan with { wait } then { frames: 3 } sat past ten minutes with no output, because the editor requests a frame only when something changes. Panning its 3D view (middle drag) and aiming (held right button) needed a pressed button the driver could not give."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: tools/claude-toolkit/webgpu-shot.cjs:18-19 (down/up steps), :28-30 (World Editor `frames` note); Toolkit.md:63"
reference: "tools/claude-toolkit/webgpu-shot.cjs header; bible/03-Code/Toolkit.md Browser QA row"
commands_verified: "node tools/claude-toolkit/webgpu-shot.cjs with { down: [x, y, 'middle'] }, { move }, { up: 'middle' } panned the editor's 3D view to sea"
---

**Issue:** The driver documented `frames` as waiting for n more frames without saying the World Editor draws only on change, so on an idle editor page it never returns; and it had no step to press and hold a mouse button.

**Fix applied (setup):** The driver's header now says the editor's page waits for a change on `frames` (use `wait`), and it gained `{ "down": [x, y, button] }` / `{ "up": button }`, documented in Toolkit.md.

**Proposed rule change:** none beyond the documentation; a `frames` step could time out with a message after a minute without a frame, which would turn the hang into a clear error.
