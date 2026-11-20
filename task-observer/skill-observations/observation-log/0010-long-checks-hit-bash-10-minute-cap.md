---
id: 10
title: "Under parallel load the full check outlasts a Bash call's 10 minutes, and vite preview dies at its default"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: the target is the kit's guide, not a skill"
area: "long commands in workers"
date: 2026-11-19
session_context: "Hostile-ships and ruined-cities workers, and the controller, ran cargo xtask check with five workers on 4 cores."
parked_until:
resolved: 2026-11-20
resolution: "brief template: full check and preview servers in the background, logged and watched; webgpu-shot's frames step takes a timeout; Toolkit.md: stop a preview server by pid (PR #93 (claude/toolkit-review, d68f49a))"
reference:
commands_verified: "run: the controller's own cargo xtask check moved to the background at 600 s and finished later with exit 0"
---

**Issue:** With five workers on four cores, `cargo xtask check` ran past a foreground Bash call's 10-minute limit; the
workers learned to run it in the background under a monitor. `vite preview` started in the background died at the
default 10 minutes mid picture run, and one 40-frame picture run passed webgpu-shot's 600 s wait.

**Suggested improvement:** Say in the brief template: run the full check and any preview server in the background with
a 2-hour timeout and watch them with a monitor; give webgpu-shot.cjs a wait option.

**Principle:** Under shared load, every "usually finishes" command needs the background-and-watch form by default.
