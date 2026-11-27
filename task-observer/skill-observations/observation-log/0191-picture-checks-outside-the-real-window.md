---
id: 191
title: "Picture checks drawn outside the real menu window hid a z-order bug that left the Outposts plan blank in the game"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: guildShots.ts (the guild page's picture builder) draws every guild view alone, outside startGearWindow; the first audit's picture checks and the page worker's v2 pictures were all made with it"
area: "picture checks of menu pages: what the builder draws around the page"
date: 2026-11-24
session_context: "Guild outposts session, second deep audit: the visual auditor drove the real menu (startGearWindow, presses faked on chosen frames) and found the Outposts plan's blocks and ghost float at z 1-2 while the menu window floats at z 19-20, so they are drawn under it: the plan is empty in the game at every size. Every earlier picture of the plan came from guildShots.ts, which draws the page with no window around it, so the bug never showed."
parked_until: "PR #242 merge"
resolved:
resolution:
reference: "/tmp/claude-0/-home-user-no-shores-source/7057fde7-633e-533e-95d2-1e2510121b2b/scratchpad/audit2/findings-visual.md; visual/v1_outpostsFull_720.png, v2_outpostsFull_scrolled_900.png"
commands_verified: "read: the visual auditor's report and outpostPlan.ts blockNode/ghostNode z against gearShell.ts:216/231"
---

**Issue:** A page's picture builder drew the page alone, without the window, shell and layers it lives in during play.
Anything that depends on those layers (a floated node's z against the window's z, clipping, scroll) looked right in
every picture while the game drew a blank plan.

**Suggested improvement:** In `brief-common-template.md`'s image-check rule, add: "a picture of a menu page is taken
inside the real menu (the same entry the game uses, such as startGearWindow), not of the page alone; a page-alone
picture may be added for detail, never instead." In `bible/03-Code/Toolkit.md`, name the in-menu builder as the one to
use for menu pages.
