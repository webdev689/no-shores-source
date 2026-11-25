---
id: 196
title: "Four headless workers at once on a 16 GB, 4-core container ran out of memory and all hit the two-hour stop"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh", "tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "run-worker.sh header (says start with timeout 7200000 and --resume if stopped; nothing on how many at once); brief-common-template.md (asks each worker for pictures and one full check at the end)"
area: "running several workers in parallel"
date: 2026-11-24
session_context: "Playtest notes split over four workers (town, sea, horse, lattice), each started at once with run_in_background and the 2 h cap. Each built its own wasm, ran cargo and node tests, vite builds, a WebGPU browser for before/after pictures, and one or two ran `cargo xtask check`. Browsers kept dying (out of memory), workers retried, and all four were killed at 2 h with the pictures unfinished, two with edits uncommitted. Resumed two at a time with no full check and at most three picture runs."
parked_until:
resolved:
resolution:
reference:
commands_verified: "free -m (16087 MB total), nproc (4)"
---

**Issue:** Nothing says how many workers the container holds. Each worker's brief asks for a full check and a
browser's pictures, so four at once run four browsers and up to four 25-minute checks side by side, and the
container's memory gives out. Browser deaths cost retries, and every worker ran past the 2 h cap.

**Suggested improvement:** In run-worker.sh's header and Toolkit.md: at most two workers at once on this container
(16 GB, 4 cores); a worker runs only targeted checks, and the controller runs the one full check per pull-request
branch; one browser run at a time, at most three picture runs per worker. Consider a lock file in run-worker.sh or
webgpu-shot.cjs so a second browser waits for the first.

**Principle:** Size parallel work by the machine's memory and cores, not by how many items there are; move duplicate
heavy steps (full checks) to the single place that must run them anyway.

**Disk too (later the same session):** each worktree builds its own `target/` (10 to 16 GB each). With four
worktrees plus the main checkout, two full checks at once spent the session's disk allowance ("0 MB free"), and both
checks died. Fix: a worktree's `target/` is deleted once its branch is merged into the PR branch, and full checks
run one at a time. Consider a shared `CARGO_TARGET_DIR` per toolchain for worktrees in run-worker.sh.

**Instance (2026-11-25, passages audit round):** five workers at once (fixrules, fxserver, fxway, fxzone, fxregions,
each started with CARGO_BUILD_JOBS=2) on the same 4-core, 15 GB container: fxregions reported an OOM kill during
`npm run wasm` plus node tests, fxserver one room test run "hit the memory limit" and `cargo test -p room` past 10
minutes, and two workers' sessions died on "Authentication error" mid-item (whether load caused it is unchecked).
CARGO_BUILD_JOBS=2 per worker was not enough: the controller's own rule should be at most three building workers on
this container, enforced where workers start (run-worker.sh refusing a fourth while three run), not remembered.

**Again, and the barrier (passages session, 2026-11-25):** rplay and rweb, three workers at once (memory held), were
both killed at the 2 h background-task limit, rweb with most of its item uncommitted. The run script's advice to start
a worker as the background task itself makes the 2 h cap the worker's own. Structural fix, commit on the passages
branch: workers start detached (`setsid nohup`), and `tools/claude-toolkit/workers/wait-worker.sh` is the background
task, restarted at its limit while the worker runs on; Toolkit.md, the README and run-worker.sh's header say so.
