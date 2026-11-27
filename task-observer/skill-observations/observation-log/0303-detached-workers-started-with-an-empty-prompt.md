---
id: 303
title: "Three detached workers started with an empty prompt; the launcher fed the brief through cat at the last moment and checked nothing"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: run-worker.sh is the only launcher; wait-worker.sh reads only logs and pid files, no brief"
area: "starting headless workers"
date: 2026-11-26
session_context: "Owner asked for a comprehensive audit of #218 (passages). Three fix workers launched with setsid nohup each logged 'Error: Input must be provided either through stdin or as a prompt argument when using --print' about nine minutes in, after their build; the REPORT STALE resume then ran a worker with no task. A stand-in claude saw the 12 KB brief, a detached probe read it after the tool call ended, and the exact claude call with a test prompt worked, so the cause is unsettled. Also: the first launch used main's kit (background task, killed at 2 h) because the detached way lived only on the unmerged PR branch."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: run-worker.sh:20-21 reads the brief once at start and refuses an empty one (still open and minor: skip the stale-report resume after a run that failed before its first turn)"
reference: "/root/wt/reports/fix-*.log (lost with the container)"
commands_verified: "claude -p with a 12 KB prompt and with the worker's exact flags: run, answered ok; stand-in claude via PATH: run, saw the brief as argument 2"
---

**Issue:** run-worker.sh read the brief with `"$(cat "$BRIEF")"` only when it called claude, after minutes of building; an empty result went to `claude -p ""` unchecked, the run failed, and the REPORT STALE resume then started a worker that had no task and wrote a report saying so. The waiter reported it DONE.

**Suggested improvement:** read the brief once at the launcher's start and refuse an empty one (done on the PR branch: `PROMPT=$(cat ...)`, exit 2 when empty); skip the stale-report resume when the first run failed before its first turn; keep briefs outside the session scratchpad (~/wt/reports/briefs).

**Principle:** a launcher that hands work to an unattended agent should read and validate the task when it starts, not at the moment of use, and must not run recovery steps after a failure that left no work to recover.
