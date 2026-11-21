---
id: 19
title: "A worker's inbox file outlived its round: a new worker of the same name met a stale heading from the last"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh"]
siblings_checked: "none: the target is a kit script, not a skill"
area: "worker inbox lifecycle"
date: 2026-11-20
session_context: "Overlook factions round, second fix pass: fix-keepers reused the worktree name of the first pass; run-worker.sh kept inbox-fix-keepers.md, so the new worker found the old 'Shape away on a Friday morning' heading and audit.py flagged it as not acknowledged"
parked_until:
resolved: 2026-11-20
resolution: "run-worker.sh moves an existing inbox aside (inbox-<name>.<timestamp>.md) on a fresh run and keeps it only for --resume; check-tools.sh --worker: 25 PASS, 0 FAIL"
reference: "/root/wt/reports/inbox-fix-keepers.md"
commands_verified: "python3 tools/claude-toolkit/workers/audit.py /root/wt/fix-keepers (INBOX NOT ACKED: 2 of 2): run"
---

**Issue:** run-worker.sh creates an inbox only when none exists, so a worker given a name used in an earlier round
inherits the earlier round's inbox headings, does or skips them, and audit.py reports them unacknowledged.

**Suggested improvement:** On a fresh (non --resume) run, run-worker.sh moves an existing inbox aside (inbox-<name>.<date>.md)
and starts an empty one; only --resume keeps it.

**Principle:** Per-run state keyed by a reusable name must be reset at the start of each new run, or it carries
instructions into work they were never meant for.
