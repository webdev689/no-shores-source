---
id: 25
title: "The controller stopped a background server with pkill -P on a pgrep -f match instead of TaskStop"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the target is the project's toolkit note, not a skill"
area: "stopping processes"
date: 2026-11-20
session_context: "Overlook factions round, final audit: after a live headless check, the controller stopped the local room server with pkill -P $(pgrep -f 'wrangler dev ...') before reaching for TaskStop on its background task"
parked_until:
resolved:
resolution:
reference: "this session's transcript, the live check after the regression fixes"
commands_verified: "none"
---

**Issue:** Toolkit.md says to stop a process by its pid (TaskStop, or stop-worker.sh), never pkill -f <pattern>. The
controller found the pid with pgrep -f and killed its children with pkill -P: the same pattern risk, one step removed.
The rule was written down but not loaded at the moment of stopping; the servers were started as background tasks, so
TaskStop was at hand.

**Suggested improvement:** a Bash hook that refuses pkill/pgrep -f in a command (as rtk-guard rewrites others), so
the background task's TaskStop is the only easy path.
