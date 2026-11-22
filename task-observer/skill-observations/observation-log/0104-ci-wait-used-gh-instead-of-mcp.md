---
id: 104
title: "Waiting on a PR's CI, the session reached for `gh api` where the session allows `gh` only for search"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: a cloud-session harness rule, not a skill"
area: "waiting on CI from a cloud session"
date: 2026-11-21
session_context: "Merging #136 after its CI; the MCP check-run read cannot be looped in a shell, so a shell loop polled the run with gh api."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: gh api repos/<owner>/<repo>/actions/runs/<id> answered 'completed success'"
---

**Issue:** The cloud session's instructions allow `gh` only for search; every other GitHub call goes through the
GitHub MCP tools. To wait for a CI run without spending a tool call a minute, a shell loop polled the run with
`gh api`. It worked, which is why nothing stopped it.

**Suggested improvement:** Toolkit.md, near the check and the merge: to wait on CI, do other work and read the
PR's check runs (MCP `pull_request_read`, `get_check_runs`) between steps, or subscribe the session to the PR's
activity and end the turn; never a `gh` poll.

**Principle:** A wait that the allowed tools make awkward is not leave to use a forbidden one; fill the wait with
work, or let an event wake the session.
