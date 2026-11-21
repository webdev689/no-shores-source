---
id: 47
title: "Timing tests fail cargo xtask check while three workers load four cores; each rerun costs ~15-25 minutes"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "client/src/cinema/flames.test.ts", "client/src/game/groundPaint.test.ts"]
siblings_checked: "family: wall-clock assertions in client tests (flames.test.ts 'about a millisecond a frame', groundPaint.test.ts 'a few tens of milliseconds'); both failed only under load, both passed alone."
area: "overlook-source, the full check under parallel workers"
date: "2026-11-21"
session_context: "Public events: controller plus rules, props and lattice workers on 4 cores (load 9-15)."
commands_verified: "node --test client/src/cinema/flames.test.ts (17/17 alone); the rules worker's npm test alone on ede85995 (2062 pass)"
---

- The controller's check failed once on flames.test.ts (4.12 ms a frame against about 1) and the rules worker's on
  groundPaint.test.ts (196 ms), each at load 9 to 15 with three workers; each passed alone. A failed full check is
  rerun whole, 15 to 25 minutes on shared cores.
- Proposed habit: with workers running, run the controller's push checks while the workers are idle, or give the
  timing tests a margin scaled by the machine's load; the owner decides any rule change.
- Other worker friction to keep: flatc writes no createSnapshot once a table holds a nested table; webgpu-shot's
  routes lose to its own anyPort route; bmesh.ops.create_uvsphere lays face corners differently each run (breaks
  byte-identical module bakes); the full module bake takes 30 to 35 minutes on shared cores.
