---
id: 232
title: "A headless worker that ends its turn to wait on its own reviewer sub-agent has it stopped ten minutes later, and exits with no review and no report"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: instance-specific to this repo's headless runner (claude -p); the reviewer pattern is the brief template's, which needs no change once the runner waits"
area: "headless workers"
date: 2026-11-25
session_context: "Passages session: fixrules round three ('Review round-three diff') and rdive ('Review rdive diff') both logged 'Background tasks still running 10m after the last turn ... stopping them. Set CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 to wait indefinitely.' and exited 0 with no report; rdive's one commit held all eight items."
parked_until:
resolved: 2026-11-25
resolution: "run-worker.sh exports CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0, and resumes once any run whose report is older than its last commit (the barrier 0231 proposed); Toolkit.md says so and no longer claims an OBSERVATIONS-line check the script never had. Commit cff6ff6a on ccr-9b9e80b0-5e314s-passages."
reference: "/root/wt/reports/rdive.log; /root/wt/reports/fixrules.log"
commands_verified: "bash -n on the new script; grep of both logs for the 'stopping them' line"
---

**Issue:** In print mode a worker that ends its turn saying "waiting for the reviewer" is not woken by the reviewer:
background tasks are stopped ten minutes after the last turn by default. The run exits 0, and its report is either
missing or the round before's.

**Improvement made:** the runner waits on the worker's sub-agents, and a stale report triggers one finishing resume.
The script was swapped by an atomic rename because two other workers were executing it at the time; editing a running
bash script in place can corrupt the running copies.
