---
id: 231
title: "Code moved out of a file to meet the 600-line limit during a merge dropped a side effect (the gear read each frame recorded 'keeps no ship'); the moved module's test called its getters in an order that hid it"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Testing.md"]
siblings_checked: "none: the target is a project note, not a skill"
area: "refactors forced by size limits"
date: 2026-11-24
session_context: "Ships at the Harbourmaster, merging main: game.ts reached 605 lines, so the ship-sailed lines moved to sailedShip.ts. The original fed() wrapper recorded shipsHeard on every gear read (the menu's feed reads it every frame); the module recorded it only when build()/called()/waterline() ran, which on foot is only when the Ship tab draws. Its new test called build() before shipless(), so it passed. A read-only page audit found it with a scratch node test; fixed by passing the frame's gear read through sailed.heard()."
parked_until:
resolved:
resolution:
reference: "client/src/game/sailedShip.ts, client/src/game/game.ts fed"
commands_verified: "node --test client/src/game/sailedShip.test.ts (rewritten to hear gear without reading the build)"
---

**Issue:** A move made only to satisfy a size limit changed when a value was recorded: from "every time the gear is read" to "every time one of the getters runs". Nothing in the move's review asked what side effects the moved lines had, and the test was written from the new structure, so it exercised the path that still worked.

**Suggested improvement:** In the Testing note: when code moves to meet a size limit, list what the moved lines did besides return a value (state they set, calls they make, how often they run) and keep each; write the moved behaviour's test from the caller's use (what runs every frame, what runs on demand), never from the new module's API order.

**Principle:** A move is a refactor only if every side effect moves with it; test the behaviour the caller relies on, in the order the caller drives it.
