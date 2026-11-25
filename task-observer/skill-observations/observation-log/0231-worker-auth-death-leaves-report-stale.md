---
id: 231
title: "A worker whose session dies on an authentication error mid-item is resumed only to commit, so its report is the previous round's and a half-done item reads as finished"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: instance-specific to this repo's run-worker.sh auto-resume; no installed skill runs headless workers this way"
area: "headless workers"
date: 2026-11-25
session_context: "Passages session, round three of worker fixrules: the session ended on 'Authentication error' while two measures ran; run-worker.sh resumed it once to commit (92195f31), its reviewer sub-agent was stopped, and /root/wt/reports/fixrules.md still ended at round two. Item 2 (set gear::band from the new walker's times) was measured but never applied: band.rs kept 25 s and 192 s while the commit message gave 12.5 s and 130 s."
parked_until:
resolved: 2026-11-25
resolution: "run-worker.sh resumes once any run whose report is older than its last commit, logging REPORT STALE (commit cff6ff6a); see 0232 for the reviewer stopped at ten minutes, the other cause seen."
reference: "/root/wt/reports/fixrules.log (the 'WORKER fixrules UNCOMMITTED 2 files: resumed once to commit' line); /root/wt/fixrules commit 92195f31"
commands_verified: "grep -n PASSAGE_SECONDS crates/gear/src/band.rs (192.0) against the commit message's 130 s; grep 'Round three' fixrules.md (no match)"
---

**Issue:** The run script's one resume after an unclean exit asks only for a commit. When the exit was an
authentication error mid-item, the commit lands, the script prints EXIT 0, and the report file is the earlier round's.
The controller reading "EXIT 0" plus a report sees a finished round; here the band step of item 2 was never applied.
The same happened to fxserver and fxzone this session (both then finished in the resume).

**Suggested improvement:** structural, not wording: when a worker's log holds "Authentication error" or the report's
mtime predates the worker's last commit, the run script prints `WORKER <name> REPORT STALE` instead of a plain EXIT 0,
and its resume brief asks to finish the item and write the round's report section, not only to commit.
