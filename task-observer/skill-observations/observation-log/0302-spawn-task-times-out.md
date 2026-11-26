---
id: 302
title: "The session's spawn_task tool timed out at 60 s twice, so follow-up tasks went into the hand-off instead"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the MCP server ccd_session's own timeout"
area: "queuing follow-up tasks from a cloud session"
date: 2026-11-26
session_context: "#223's audit: two follow-ups (the wreck tools writing the mast and ranks; the gear tabs' pad keycap) each timed out after 60 s."
parked_until:
resolved:
resolution:
reference: "bible/Hand-off.md, #223's Left"
commands_verified: "mcp__ccd_session__spawn_task: called twice, both timed out"
---

**Issue:** A follow-up that cannot be queued is easily lost.

**Suggested improvement:** When spawn_task fails, write the follow-up into the Hand-off's entry at once, with the files and what done looks like.

**Principle:** A finding not written down where the next session reads it is lost.
