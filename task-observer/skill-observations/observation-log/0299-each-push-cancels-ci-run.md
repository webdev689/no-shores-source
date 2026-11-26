---
id: 299
title: "Each push to a PR cancels its running CI check, and the stop hook asks for every commit pushed at once"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "bible/04-Procedures/Branches and Merging.md"]
siblings_checked: "checked: ci.yml's concurrency cancels the PR's earlier run; the stop hook flags any unpushed commit at a turn's end"
area: "CI on a PR during a long session"
date: 2026-11-26
session_context: "#223: runs 1183, 1184 and 1186 were cancelled by the next push (a decision note, an owner's answer); a full check takes about 50 minutes, so a run on the whole head came only once the work stopped."
parked_until:
resolved:
resolution:
reference: "CI runs 1183-1187 on ccr-6e659de3-v7ph7h"
commands_verified: "actions list_workflow_runs on the branch: run, showed the cancelled runs"
---

**Issue:** Small pushes (a recorded answer) restart a 50-minute check; the stop hook pushes them anyway.

**Suggested improvement:** Push code in batches; let notes-only commits wait for the next code push, or let the stop hook accept commits that touch only `bible/`.

**Principle:** Spend the long check on the head that matters.
