---
id: 227
title: "CI was polled with gh api in a session whose environment allows gh only for search"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked — instance-specific to cloud sessions with the gh-for-search-only rule; the PR subscription already delivers CI results"
area: "waiting on CI"
date: 2026-11-24
session_context: "Merging PR #186 on the owner's 'Merge and deploy when ready'. After a push I started a Monitor that looped gh api repos/.../check-runs every 60 s. The environment's system text says gh is for search only, and subscribe_pr_activity delivers check results as events. Stopped it within a minute, read the check runs once with the GitHub MCP tool instead. Also: the stop hook asks for a push on every turn while CLAUDE.md wants cargo xtask check first (see 0209)."
parked_until: "PR #239 merge"
resolved:
resolution:
reference:
commands_verified: "mcp__github__pull_request_read get_check_runs"
---

**Issue:** The reflex for waiting on CI is a gh poll loop (it is the Monitor tool's own example). In a cloud session where
gh is for search only, that breaks the environment's rule, and the PR subscription already wakes the session.

**Proposed:** Toolkit.md's CI section says: in a cloud session, wait on CI by the PR subscription (end the turn), and read
a run once with the GitHub MCP tools; never a gh loop. Protection in play: written in the environment text, loaded, no
checkpoint.
