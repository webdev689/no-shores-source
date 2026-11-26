---
id: 0297
title: "Sub-agents each given a CARGO_TARGET_DIR of their own filled the disk, and the full check died on 'No space left on device'"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "checked: Toolkit's Workers section links node_modules, generated/, target/ for reviewers but says nothing of a builder's own target or deleting it after"
area: "parallel Rust builds in worktrees"
date: 2026-11-26
session_context: "#216 docking: three agents built in their own target dirs (target-dockroom, target-dockfix, target-mergemain) for isolation; with the main target at 21 GB the volume filled and cargo xtask check on d70f8282 failed in the Rust tests with os error 28; deleting the three freed 35 GB."
parked_until:
resolved:
resolution:
reference: "check6.log on d70f8282"
commands_verified: "df -h /home/user: run, 35G free after rm -rf of the three target dirs"
---
