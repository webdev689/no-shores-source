---
id: 65
title: "Staged pictures mislead when each staged input is set on its own, and the picture budget is overrun"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-template.md"]
siblings_checked: "0015 (actioned) covers picture runs that break; this is runs that finish and show a state the game cannot reach. 0014 (two-hour limit) is the time cost of the extra rounds"
area: "browser QA: staging a scene for headless WebGPU pictures"
date: 2026-11-20
session_context: "dfo-mount worker's sea-fight readout pictures (reports/dfo-mount-shots, steps_v3.json), reviewed by the controller before merging into #75; plus worker (reports/plus.md, plus-shots): v1 staged the lay off the target again, and 1 of 6 pictures fit its 60-minute aim."
parked_until: "PR #243 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #243, merged 2026-11-27"
reference:
commands_verified: "read: steps_v3.json staged the lay at c.last.captain (the Tithe Frigate) while __aimAt drew the sights on the Pirate Brig; fightDisplay.test.ts shows the card follows the lay. v3_burning_magazine shows 'Going down' at hull 100/100"
---

**Issue:** The worker's pictures finished cleanly but showed states the game cannot reach, and one read as a bug:
- the volley's fall was staged at one ship while the sights were staged at another, so the card named a ship the aim
  was not on; the controller spent a review round proving the code right;
- a ship staged "going down" kept a full hull;
- staged fights started at the raised sea's size until `combat.down = 1` was set, costing a retake;
- untracked staging in the worktree root failed the prettier check, so it was moved under `target/`;
- 13 pictures in three runs against a budget of 8.

**Suggested improvement:** In Toolkit.md's browser QA: stage from one target. Derive every staged input (lay, aim,
card, state, hull) from the same staged ship, and say in the report what each picture staged. Keep staging under
`target/`. The brief template should count retakes against the picture budget and ask the worker to stop and report
when it is spent.

**Principle:** A staged picture is evidence only for states the game can reach; inputs staged separately can disagree
in ways the real game never does.

**Recurrence (plus worker):** its first picture again staged the lay away from the target (the card on another ship,
"on target" over empty water) although the brief said to stage from one target; the second was right. At about five
minutes of frames a picture plus staging and a build (which needs `npm run -s wasm` first), a 60-minute aim held one
picture of six. A brief should size the picture budget from its time aim, not list more pictures than fit.
