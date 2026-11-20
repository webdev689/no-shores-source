---
id: 15
title: "Headless picture runs break on the dev server's watching, a stale port, and a staging file inside client/"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/webgpu-shot.cjs"]
siblings_checked: "0014 (the two-hour limit) is the time side of the same picture runs; this is their failure modes"
area: "browser QA: staging a scene for headless WebGPU pictures"
date: 2026-11-20
session_context: "Deck and combat-feel workers staged fights in the page to picture boarding, splashes and flotsam."
parked_until:
resolved: 2026-11-20
resolution: "webgpu-shot.cjs refuses a dev server (second violation of the bible's rule: now a barrier), serves via servedAt, runs initScript from outside client/; Toolkit.md: stop preview servers by pid, move a staged clock forward (PR #93 (claude/toolkit-review, d68f49a))"
reference:
commands_verified: "reported by the workers' OBSERVATIONS lines: deck (v3 and v4 died at staging), combat-feel (old server on 5191 served the run)"
---

**Issue:** Four ways a staged picture run failed or lied, each costing a 10 to 30 minute round:
- editing source during a run made Vite's dev server load a second copy of a module, so the stage patched the wrong one;
- an old dev server held the port, so a new `--strictPort` server failed quietly and the old code was pictured;
- a staging file under `client/` failed the TypeScript lint inside `cargo xtask check` unless removed after loading;
- a 20 s effect (a sinking, smoke thinning) cannot be waited out at 10 s a headless frame.

**Suggested improvement:** In Toolkit.md's browser QA: picture a built page under `vite preview`, never the dev server;
check the port is free (or name the server's pid) before each run; keep staging scripts outside `client/`, passed as the
shot script's `initScript`; set the staged clock forward rather than waiting frames.

**Principle:** A picture is evidence only if what it shows is the code under test, staged the same way every run.
