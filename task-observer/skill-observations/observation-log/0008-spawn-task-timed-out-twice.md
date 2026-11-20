---
id: 8
title: "The task-suggestion tool (spawn_task) timed out after 60 s twice, so a found gap went to the Hand-off instead"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none in the log; no skill-families.md in this workspace"
area: "Handing off work found in passing"
date: 2026-11-20
session_context: "#102's audit: the garrison agreement run kills no foe, found while merging main"
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: mcp__ccd_session__spawn_task twice, both times 'MCP server \"ccd_session\" tool \"spawn_task\" timed out after 60s'; not retried a third time, in case a card had been queued"
---

**Issue:** the gap found in passing (the garrison agreement run never kills a foe) was meant to go to the owner as a
suggested task. Both calls to `spawn_task` timed out after 60 s, and whether a card was queued is not known. The first
call's prompt also named a wrong cause (#63's wall), which a later probe disproved. If that card exists, it starts from
a wrong premise.

**Suggested improvement:** when a suggestion tool times out, put the found work in the Hand-off's "Next" section, which
lasts beyond the session, and tell the owner in the final message that a card may exist. Measure before writing a
suggestion's cause, as the Audits section asks for findings.

**Principle:** work handed off is only as good as the place it lands and the cause it names. A record that persists
beats a card that may or may not exist.
