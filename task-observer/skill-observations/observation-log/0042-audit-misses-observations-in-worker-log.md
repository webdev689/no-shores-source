---
id: 42
title: "audit.py reports a missing OBSERVATIONS line that the worker's log holds"
parked_until: "PR #242 merge"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/audit.py"]
siblings_checked: "family: the worker audit and run-worker.sh's report files. Both ui and wreck3 were flagged; both logs end with an OBSERVATIONS: line."
area: "overlook-source, worker audits"
date: "2026-11-20"
session_context: "Auditing the ui and wreck3 workers before merging."
commands_verified: "python3 tools/claude-toolkit/workers/audit.py ~/wt/ui -> 'MISSING (defect): OBSERVATIONS: line in final reply'; ~/wt/reports/ui.log contains 'OBSERVATIONS: xtask check overran...'"
---

The audit reads the final reply from somewhere other than ~/wt/reports/<name>.log (or reads only the last turn, while
the worker printed OBSERVATIONS in an earlier turn of a multi-turn finish). A false defect teaches the controller to
ignore the audit. Proposal: the audit searches the whole log (and the report .md) for the OBSERVATIONS line.
