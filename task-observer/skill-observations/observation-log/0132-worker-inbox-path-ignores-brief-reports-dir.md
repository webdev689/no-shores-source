---
id: 0132
title: "run-worker.sh puts a worker's inbox under <worktree>/../reports whatever reports folder the brief names, so items written elsewhere never arrive"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the worker launcher only"
area: "late items for a running worker"
date: 2026-11-22
session_context: "Overlook audit of the audit: the briefs named ~/wt/reports2 for reports, and the controller appended late items to ~/wt/reports2/inbox-fu-ts.md; the worker reads $WORKER_INBOX = ~/wt/reports/inbox-fu-ts.md (OUT=$(dirname WT)/reports). Caught by listing the pid files; the items were moved. Also, one worker was launched with & inside a plain Bash call, which gave no completion notice; it was stopped and relaunched in the background."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: ls ~/wt/reports/*.pid showed the workers' pid files and inboxes there, not in ~/wt/reports2"
---

**Issue:** The launcher fixes the inbox's folder from the worktree's parent, while a brief can name another reports
folder; the controller wrote to the folder the brief named and the worker never saw the items.

**Suggested improvement:** run-worker.sh prints the inbox path it uses (or takes the reports folder from the brief);
Toolkit.md says late items go to the path the launcher printed.

**Principle:** A channel to a running worker is addressed by what the launcher says, not by what the brief implies.
