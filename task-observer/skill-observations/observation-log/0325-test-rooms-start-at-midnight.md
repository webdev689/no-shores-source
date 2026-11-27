---
id: 325
title: "Test rooms start at Unix 0, which is midnight, so any night rule silently changes room tests; __qaEye did not reach the sea"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["crates/room/src/sea_tests.rs", "client/src/game/camera.ts", "bible/03-Code/Toolkit.md"]
siblings_checked: "unchecked: other room tests that depend on the hour"
area: "room tests, browser pictures"
date: 2026-11-26
session_context: "Worker ship-lanterns reported: a clash-join test changed under night sight because test rooms start at Unix 0 = midnight; it pinned that test to noon. __qaEye only stood the on-foot camera, so it added QA_EYE at sea (sea.ts). The minified dev build needs the sed on 'heard(e){let t=e-', not night-city's unminified pattern (see 0312). Picture plans ~15 min under load. Also on merging: game.ts and sea.ts went 1-2 lines over the 600 limit after main and the lanterns met; trimmed by joining lines."
parked_until:
resolved:
resolution:
reference: "~/wt/reports/ship-lanterns.md, branch ship-lanterns 9c9bc1a7"
commands_verified: "cargo xtask repo flagged game.ts 602 and sea.ts 601 after the merge"
---
