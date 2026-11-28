---
id: 119
title: "On a 4-core container, three run-worker.sh workers (each building its own WebAssembly and starting Serena with rust-analyzer) would starve each other; in-process worktree agents were used instead"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/run-worker.sh"]
siblings_checked: "checked: concerns the worker kit, not a skill"
area: "fanning out on a small container"
date: 2026-11-22
session_context: "Overlook prologue bugs and polish: three TypeScript-only jobs (ship bar, ships' crew, music) fanned out while the controller worked on Rust and the wreck; nproc 4, 15 GB."
parked_until: "PR #242 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #242, merged 2026-11-27"
reference:
commands_verified: "nproc (4); run-worker.sh builds npm run wasm in each worktree that lacks it; Serena's project lists rust (rust-analyzer per worker)"
---

**Issue:** run-worker.sh prepares each worktree by building the WebAssembly in its own target (minutes of 4 cores each)
and starts Serena with rust-analyzer per worker. With three workers and the controller's own cargo runs on 4 cores,
they would starve one another. The session used the Agent tool's worktree isolation instead, briefed to link
node_modules, generated/ and copy client/public/*.wasm from the main checkout and to run focused checks only; the
controller merged and ran the full check. The workers then lacked Serena, claude-mem and the kit's reviewer step.

**Suggested improvement:** run-worker.sh could link (not build) the main checkout's client/public/*.wasm, generated/ and
target/protocol when the worker's brief says it changes no Rust, and start Serena with the TypeScript language alone
for such a worker; the Toolkit's Workers section could say how many workers a container's cores carry.

**Principle:** Size the fan-out to the machine, and give a worker only the language servers its job needs.
