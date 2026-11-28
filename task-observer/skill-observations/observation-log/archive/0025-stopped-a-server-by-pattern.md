---
id: 25
title: "The controller stopped background servers by pattern (pkill -P on a pgrep -f match; pkill -f) instead of by pid, twice"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the target is the project's toolkit note, not a skill"
area: "stopping processes"
date: 2026-11-20
session_context: "2026-11-27, session 01AQ3N4rcsyHKfuU32sdJH24: the repair worker twice waited on a build with a loop on pgrep -f '<pattern>', which matched its own shell and never ended until its time limit. Earlier: Overlook factions round, final audit: after a live headless check, the controller stopped the local room server with pkill -P $(pgrep -f 'wrangler dev ...') before reaching for TaskStop on its background task. Again on 2026-11-24, PR #194 site fixes: a timeout-wrapped wrangler dev for a 404 and caching check, stopped with pkill -f 'wrangler dev --config site/wrangler.jsonc'."
parked_until: "PR #239 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #239, merged 2026-11-27"
reference: "this session's transcript, the live check after the regression fixes"
commands_verified: "none"
---

**Issue:** Toolkit.md says to stop a process by its pid (TaskStop, or stop-worker.sh), never pkill -f <pattern>. The
controller found the pid with pgrep -f and killed its children with pkill -P: the same pattern risk, one step removed.
The rule was written down but not loaded at the moment of stopping; the servers were started as background tasks, so
TaskStop was at hand.

**Suggested improvement:** a Bash hook that refuses pkill/pgrep -f in a command (as rtk-guard rewrites others), so
the background task's TaskStop is the only easy path.

**Second instance (2026-11-24):** the controller ran `timeout 60 npx wrangler dev ...` in a subshell for a local
check and stopped it with `pkill -f`. The rule sits under the Toolkit's Workers heading and was read as a worker's.
This is the rule's second break with no fix in between, so the improvement is the hook above, not a rewording; move
the rule out of the Workers section as well so it reads as everyone's.

Instance 2026-11-27 (repair worker): a wait loop `while pgrep -f "xtask repo"; do sleep; done` matched the loop's own shell, twice, each running to its time limit. The barrier proposed for stopping (by pid only) covers waiting too: wait on a pid (`wait`, `tail --pid`, TaskStop's task), never a pattern.
