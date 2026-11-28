---
id: 292
title: "Four workers at once on 4 cores and 15 GB ran load 12 to 14: a timing test flaked, lint was OOM-killed during a picture run"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the targets are project files, not skills"
area: "running item workers in parallel"
date: 2026-11-26
session_context: "welcome: a chalk-zone timing test failed at load 13 and passed alone; wreck: eslint OOM-killed while a headless picture run was going; SwiftShader frames took about 4 s each."
parked_until: "PR #242 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #242, merged 2026-11-27"
reference:
commands_verified: "uptime load 12.46 at 02:22; reports welcome.md, wreck.md"
---

**Issue:** Parallel workers beyond the core count slow each past the time limit and make timing tests and memory-heavy steps fail for reasons unrelated to the change.

**Suggested improvement:** Toolkit.md: at most two or three workers on a 4-core machine, or stagger their picture runs; rerun a timing test alone before calling it failing.

**Principle:** Parallelism past the machine's capacity costs more time than it saves.
