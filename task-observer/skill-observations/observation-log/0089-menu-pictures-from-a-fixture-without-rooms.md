---
id: 89
title: "The menu's gear pages can be pictured from a fixture on the dev server, without rooms or accounts"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: pictures of DOM screens (menu, ship pages, roster); only the gear menu tried."
area: "overlook-source, design pass of #119"
date: "2026-11-21"
session_context: "Picturing an Atheric's item page needed a character holding it; the room only grants gear in the Test Ground and the menu only shows gear in a room."
commands_verified: "Playwright on the dev server: goto a non-HTML URL, setContent with index.html minus main.ts and /@vite/client, import gearWindow.ts and gearForTests.ts, startGearWindow with a fixture GearState, keys i/o and a contextmenu on [data-details]"
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: tools/uiShot.mjs:1-7, client/src/game/journalShots.ts:201-287 (menu pages from fixture gear, no rooms)"
---

- It took several rounds to find: the dev server's HMR client reloads the page after any edit, wiping the set content,
  so `/@vite/client` must be stripped too (or the server restarted); the inventory holds no gear (the character page's
  slots do); a tile's details press is a `contextmenu` on `[data-details]`.
- Proposed: a small kit script beside webgpu-shot.cjs that pictures the menu's pages from a fixture module, and a line
  in Toolkit.md's Browser QA row.
