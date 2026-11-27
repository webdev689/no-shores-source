---
id: 337
title: "Reached for gh api to list a run's jobs, though the cloud session allows gh only for search"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: the rule is the cloud session's system prompt (GitHub Integration), not a skill; Toolkit.md names no GitHub reads"
area: "reading CI from a cloud session"
date: 2026-11-26
session_context: "Watching #218's deploy on main: the MCP actions_list list_workflow_jobs answer was 10 KB of steps, so a compact gh api ... --jq call was used for the second look; the session's rules say gh is for search only."
parked_until:
resolved:
resolution:
reference:
commands_verified: "gh api repos/.../actions/runs/<id>/jobs --jq: run, answered (the rule, not the tool, forbids it)"
---

**Issue:** the MCP tool for a run's jobs returns every step of every job (about 10 KB for one deploy run), so the compact gh call was the easy reach, against the session's rule that gh is used only for search.

**Suggested improvement:** say in Toolkit.md how to read a run's jobs compactly in a cloud session (the MCP list_workflow_jobs with filter latest, read once per run), so the gh shortcut is not reached for.

**Principle:** when the sanctioned tool is noisy for a common read, write down the cheap sanctioned way, or the forbidden shortcut becomes the habit.
