---
id: 313
title: "A CPU cost in pure client code was found and its exact rewrite proven fastest in Node: the test's real-world harness as a benchmark, and its output diffed against a worktree of the base"
status: open
type: methodology
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: Toolkit's Performance probe measures the game in a browser; nothing says to measure a pure function in Node first, or to prove a rewrite exact by diffing outputs against the base commit"
area: "performance work"
date: 2026-11-26
session_context: "Held map: client/src/game/heldMapLettering.test.ts's realWorld() copied into a scratch script timed layOut at 88 ms to 1 s; node --cpu-prof named anyCellUnder; each rewrite's JSON output on 90 views was cmp'd with the same script run on a git worktree of HEAD (identical), ending at 14 to 30 ms. The browser probe could not show it, as the ship it put to sea never moved."
parked_until:
resolved:
resolution:
reference: "scratchpad bench/dump.ts, bench/dump-base.ts"
commands_verified: "node bench/dump.ts > new.json; node bench/dump-base.ts > base.json; cmp: run, identical"
---
