---
id: 69
title: "A plan's picture harness lived in a session's /tmp scratchpad, so the session that picked the work up had none"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/webgpu-shot.cjs"]
siblings_checked: "family: work saved for a later session (wip/ plans saved to a side branch; the harness was not)."
area: "overlook-source, browser QA"
date: "2026-11-20"
session_context: "Picking up the Dungeons session's Journal (#97) after its usage limit: Task 7 named shots-34's harness in that container's scratchpad."
commands_verified: "ls /tmp/claude-0/-home-user/*/scratchpad/shots-* (none); node shoot.cjs (rebuilt harness, 14 scenes)"
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: tools/uiShot.mjs:1-7 and bible/02-Systems/Interface.md:383-391 (the menu pictured headless from journalShots.ts); a DOM spill check is moot now that the menu is GPU-drawn"
---

- The stopped session saved its plans and code to `claude/activities-journal-wip`, but its HTML harness for menu
  pictures (`shots-34/shots34.ts`, `shoot.cjs`) stayed in its own container's scratchpad, so it was gone.
- Rebuilt from scratch: a page mounting `startGearWindow` with a fake source, the real `room.wasm` and the protocol's
  `gear.bin` fixture, and a Playwright shooter with a spill check.
- The first spill check (overflow visible only) missed a panel 40 px wider than its room and lines kept `nowrap`;
  checking every box under the page, skipping only ellipsis and line-clamp, caught both.
- Proposed: keep a menu-picture harness in `tools/claude-toolkit/` beside `webgpu-shot.cjs` (the menu is HTML, so it
  needs no WebGPU), with the stricter spill check, and say in Toolkit.md's Browser QA row how to run it.
