---
id: 185
title: "Seven headless workers on four cores pushed the load to 20-34: cargo builds passed the 600 s Bash limit, a full Blender bake took 19 minutes, and timing tests flaked"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: every fix2-* worker's OBSERVATIONS line this session (world, page, look, content, models, accounts, rooms) named the slowness; the accounts worker saw race tests built on 2 ms ticks flake; the models worker was stopped at its two-hour limit mid-commit"
area: "headless workers: how many to run at once"
date: 2026-11-24
session_context: "Guild outposts session, second deep audit's fixes: the controller ran seven workers at once (one per area, no shared files) on a 4-core, 15 GB container. Five worktrees built the wasm and protocol at once on start (load 22). Workers reported cargo builds of 10-20 minutes, `npm run types` and `cargo xtask repo` over 10 minutes, graphify update over 2 minutes, flaky timing tests, and a Blender bake of 19 minutes; the models worker hit the two-hour limit with work uncommitted and needed a --resume."
parked_until:
resolved:
resolution:
reference: "/root/wt/reports/fix2-*.log (OBSERVATIONS lines); uptime load averages 19.7-22.9 at 05:28-05:44 UTC"
commands_verified: "run: nproc -> 4; uptime -> load average 22.47, 20.15, 13.86 with five workers starting"
---

**Issue:** Splitting work by file area made seven independent workers, and they were all started at once. On four
cores the builds and tests each worker must run (wasm, cargo, tsc, Blender) multiplied: every worker spent much of
its two hours waiting, one hit the limit with work uncommitted, and timing tests flaked so results needed reruns.

**Suggested improvement:** In `bible/03-Code/Toolkit.md` (workers), add: "run at most `nproc` workers at once, and
stagger their starts by a few minutes so the worktrees' first builds do not overlap; a worker whose area is small
(notes, content numbers) can share a run with another rather than take a core." In `run-worker.sh`, print a warning
when more workers are running than `nproc`.
