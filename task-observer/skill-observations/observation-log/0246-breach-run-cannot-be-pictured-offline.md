---
id: 246
title: "A Breach's run cannot be pictured offline, so its look was judged on a scratch harness"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "client/src/game/qaViews.ts"]
siblings_checked: "0068 (island plants pictured without a voyage): the same family, a place with no offline way in; the Abyss and Elite runs have the &run= dev hook, the Breach none"
area: "picturing a place's look headless (Browser QA)"
date: 2026-11-24
session_context: "#200, wk-breach-look: enterBreachRun needs the rooms, and the &run= dev hook opens dungeons only, so the worker drew the run's props through a scratch runShot.ts on a vite URL; vite's HMR reloaded the page mid-capture when the harness changed."
parked_until:
resolved:
resolution:
reference:
commands_verified: "reported by the worker (OBSERVATIONS line); the harness is in ~/wt/reports/wk-breach-look-shots/runShot.ts, never committed"
---

**Issue:** Every look pass on the Drowned Vale's run needs a picture, but the run is joined only online, and the QA
views' dev hook (`&run=`) stands a dungeon, not a Breach. Each worker builds its own throwaway harness, and its
pictures are of props drawn outside the game's real frame.

**Suggested improvement:** A QA view that opens a Breach's run alone, as the dungeons' `&run=` does (its room in the
rooms' worker, a space and an encounter phase chosen by the URL), named in the Toolkit's Browser QA row.

**Principle:** A place the owner will judge by eye needs a way in that a headless browser can take.
