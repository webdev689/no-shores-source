---
id: 131
title: "A full check run while other heavy work ran failed a worker timing test, and a headless world never drew"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "CLAUDE.local.md's background-check pattern says nothing about running alone"
area: "running cargo xtask check and headless pictures in one cloud session"
date: 2026-11-22
session_context: "Two branches built at once (a worktree with its own target), clippy and a webgpu-shot run beside cargo xtask check."
parked_until:
resolved:
resolution:
reference: "roomThread.test.ts 'a sea in the rooms' worker sends the same snapshots' failed under load, passed 3 of 3 alone; webgpu-shot printed 'no WebGPU canvas has drawn' for 4 min while cargo built"
commands_verified: "run: node --import ./tools/testStyles.mjs --test client/src/network/roomThread.test.ts -> pass 6 fail 0 (three times, alone)"
---

**Issue:** `cargo xtask check` was run while a second checkout's cargo build, clippy and a headless Chromium
picture run shared the machine. The rooms' worker test, which compares the worker's snapshots with the page's within
a time, failed, and passed three times alone. The picture driver's world never drew in four minutes under the same
load, though the held map, raised later, did.

**Suggested improvement:** Toolkit.md, beside the check: run `cargo xtask check` with nothing else heavy running,
one checkout at a time; take headless pictures of the world only on an idle machine; `tools/uiShot.mjs` (the
interface alone) is light enough to run beside work.

**Principle:** A check is evidence only when it runs on a quiet machine; a timing test failing under load is a
reason to rerun alone, not to change the test.
