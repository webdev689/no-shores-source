---
id: 310
title: "A worker's GPU picture of the story took about 10 minutes to reach a line; a 120 s eval poll timed out"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "bible/03-Code/Toolkit.md"]
siblings_checked: "unchecked: whether Toolkit.md names a timeout for story pictures"
area: "workers, browser pictures"
date: 2026-11-26
session_context: "Worker dialogue-click reported: the GPU picture runs at a fraction of noGpu speed, so the story took ~10 min to reach the mate's line; a 120 s eval poll timed out and a waitFor with a 1500 s timeout worked. It also hit `git checkout -- graphify-out` failing with 'pathspec did not match' once. The 600-line limit on game.ts moved its click logic to gameKeys.ts (the rule working, no change)."
parked_until:
resolved:
resolution:
reference: "~/wt/reports/dialogue-click.md, branch dialogue-click"
commands_verified: "none by me; worker's report"
---
