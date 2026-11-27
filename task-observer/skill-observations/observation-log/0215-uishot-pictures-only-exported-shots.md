---
id: 215
title: "uiShot draws only shots a module exports, so measuring a one-off menu state (a layout risk an audit estimated) means editing a tracked shots file and reverting it"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["tools/uiShot.mjs", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the targets are the project's tool and its note, not skills; 0177 and 0120 cover other uiShot frictions"
area: "headless interface pictures"
date: 2026-11-24
session_context: "Bounty board overhaul: an audit estimated the Journal's bounty count chip ran past its column at 1280x720 for counts like 13/15. journalShots.ts keeps menuShot private and its gear fixed, so the only way to picture a 15-slot state was to append a temporary export to journalShots.ts, run uiShot, and copy the file back."
parked_until: "PR #243 merge"
resolved:
resolution:
reference:
commands_verified: "node tools/uiShot.mjs <shots.json> with build journalWideChipShot appended to journalShots.ts (ran: wrote the picture; the chip overflowed, then wrapped after the fix)"
---

**Issue:** `tools/uiShot.mjs` imports a module and calls an exported build. The menu's builds (`menuShot` in `journalShots.ts`) are private and close over fixed sample gear, so a picture of any state not already exported needs an edit to a tracked file, reverted by hand after. A forgotten revert would ship a QA-only export.

**Suggested improvement:** let a shot's JSON pass a gear override (`"gear": {...}` merged over the module's sample), or export `menuShot` from `journalShots.ts` with a scratch module allowed under the scratchpad; name the way in the Toolkit's Browser QA row.

**Principle:** A measuring tool that can only reach states the code already names pushes one-off measurements into tracked files; give it a way to take the state as data.
