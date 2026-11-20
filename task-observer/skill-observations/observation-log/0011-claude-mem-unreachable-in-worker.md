---
id: 11
title: "claude-mem's worker was unreachable from a headless worker, so its required first search failed"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh"]
siblings_checked: "none: the target is the kit's worker runner, not a skill"
area: "worker MCP servers"
date: 2026-11-19
session_context: "Hostile-ships worker tried claude-mem search twice at its start; the worker was unreachable."
parked_until:
resolved: 2026-11-20
resolution: "run-worker.sh tests claude-mem via check-tools.sh --only claude-mem (retried once) and tells the worker when down; audit.py counts failed claude-mem calls apart from missing ones (PR #93 (claude/toolkit-review, d68f49a))"
reference:
commands_verified: "NOT RUN: reported by the worker"
---

**Issue:** The brief's first action is a claude-mem search; for one of six workers the claude-mem worker did not
answer, twice. The audit could not tell a failed search from a skipped one.

Second instance: `check-tools.sh --worker` failed its own claude-mem line with "The worker could not complete this
request. Retry after checking the worker connection." while every other tool passed, and the held-map worker's first
search failed the same way. Under load (five workers on four cores) claude-mem's worker is the one tool that drops.

**Suggested improvement:** run-worker.sh warms claude-mem as it warms Serena (one handshake, retried) and says when it
is down; audit.py counts a failed claude-mem call separately from a missing one.

**Principle:** A required first step on a tool that may be down needs a health check before the run, or the rule
becomes noise.
