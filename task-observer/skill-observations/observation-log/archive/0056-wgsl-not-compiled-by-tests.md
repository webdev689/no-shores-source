---
id: 56
title: "No test compiles the client's WGSL shaders, so a shader error shows only in a browser picture"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["crates/xtask", "bible/03-Code/Testing.md"]
siblings_checked: "none: the target is the repo's checks, not a skill"
area: "client shader checks"
date: 2026-11-19
session_context: "Ruined-cities worker: its v4 picture round was a shader compile error that every test had passed."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: bible/03-Code/Checks.md:23-28 (`cargo xtask check` step 5 validates every shader with naga; `cargo xtask shaders`)"
reference:
commands_verified: "NOT RUN: reported by the worker (it validated shaders in Chromium by hand)"
---

**Issue:** The city's broken-building shaders passed tsc, eslint and every node test, then failed to compile in the
browser; a whole picture round (v4) was spent finding it.

**Suggested improvement:** A check that compiles every WGSL module the client builds, headless (the preinstalled
Chromium through playwright, or a WGSL parser such as naga's), inside `cargo xtask check`. A new check needs the
owner's agreement (CLAUDE.md).

**Principle:** Code in a second language embedded in strings needs its own compile step in the gate, or its errors
reach the slowest loop.
