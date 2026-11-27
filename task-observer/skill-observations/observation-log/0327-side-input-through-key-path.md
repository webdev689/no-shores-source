---
id: 327
title: "Input meant to act as a key was given its own mousedown listeners, which every window that swallows keys missed; the read-only audit caught it"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: Toolkit.md's Audits section (one read-only agent, findings measured before fixed) was followed and worked; no rule says new input should reuse the keys' path"
area: "input routing, audits before a merge"
date: 2026-11-27
session_context: "PR #236 let mouse side buttons bind any control. The first build added mousedown listeners in gameKeys, the controls sheet and the gear window, and pressed side buttons in Input with the pointer free. The audit agent found they acted behind the sheet, the chat's typing, the entrance card, the playlist and passage panels, and left Details/Compare unreachable. Fix: the page sends a side button as a key of its name (sideKey in pageOps.ts), so every capture listener that keeps keys applies. The audit also found a moved default silently dropping a player's kept bind (withOverrides), fixed after a failing test."
parked_until:
resolved:
resolution:
reference: "PR #236, commit after 87c80494 'Fix the audit's findings on the players' first asks'"
commands_verified: "node --test client/src/player/binds.test.ts: new test failed before the withOverrides fix, passed after; compare.ts on the real world: 0 of ~670,000 onOwnSea answers differ, same names laid"
---
