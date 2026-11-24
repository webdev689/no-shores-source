---
id: 194
title: "With four workers on four cores, a worker's npm run types and full client tests overran the 120 s Bash default"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: the worker's other long commands (cargo test -p room, the shot harness) were already started with long timeouts or in the background; only npm run types and node --test over the client lacked one"
area: "timeouts for check commands when workers share the cores"
date: 2026-11-24
session_context: "PR #179's third audit: four fix workers (errands, page, look, world) ran on the 4-core box, started 5 minutes apart. fix3-page reported that npm run types and the full client tests overran the 120 s Bash limit and had to be rerun with 300 s. It also found that the audit's picture harness needs playwright from /opt/node-tools, because worktrees have none in node_modules, and that menuForTests' drawn() has a fixed 1280x720 view."
parked_until:
resolved:
resolution:
reference:
commands_verified: "worker's own report, /root/wt/reports/fix3-page.md and fix3-page.log OBSERVATIONS line"
---

**Issue:** When several workers share the cores, `npm run types` and `node --test` over the client take longer than the Bash tool's 120 s default. The worker lost a turn on each one before rerunning it with a longer timeout.

**Suggested improvement:** The common brief should tell workers to run `npm run types`, the full client tests and any `cargo test` with `timeout: 300000` or more, or in the background. It should also say the picture harness needs `NODE_PATH=/opt/node-tools/node_modules` (or the equivalent) in a worktree.

**Principle:** Size a command's timeout for the machine as it is during the run, with every other worker on it, not as it is when idle.
