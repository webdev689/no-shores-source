---
id: 14
title: "Workers twice ended with their work uncommitted, and audit.py passed it"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/audit.py", "tools/claude-toolkit/workers/run-worker.sh"]
siblings_checked: "none: the target is a kit script, not a skill"
area: "worker hand-back checks"
date: 2026-11-20
session_context: "Overlook factions round: the npc-screen worker's run ended right after its ponytail review; its worktree held every change uncommitted, and audit.py reported only the missing OBSERVATIONS line and inbox acks; again in the second fix pass, the fix-keepers worker ended after ponytail-review with 38 files uncommitted"
parked_until:
resolved: 2026-11-20
resolution: "Structural barrier, both halves: audit.py prints UNCOMMITTED (defect) for a dirty worktree (verified on fix-keepers, 38 files), and run-worker.sh resumes a run once when it exits with its worktree dirty, telling it to commit, report and reply; check-tools.sh --worker passes (25 PASS, 0 FAIL)"
reference:
commands_verified: "python3 tools/claude-toolkit/workers/audit.py /root/wt/npc-screen (MISSING: OBSERVATIONS line; INBOX NOT ACKED): run"
---

**Issue:** A headless worker stopped after `ponytail-review`, before its commit and final reply. `audit.py` flagged
the missing OBSERVATIONS line and unacknowledged inbox headings, but said nothing of the worktree's uncommitted
changes, which are the costliest loss: a controller merging the branch would merge its base and nothing else.

**Suggested improvement:** `audit.py` runs `git -C <worktree> status --porcelain` (ignoring `graphify-out/`) and
prints `UNCOMMITTED: n files` as a defect, and checks that the branch has at least one commit past the brief's base.

**Principle:** A hand-back check must test the deliverable itself (is the work on the branch?), not only the report
about it; the report is the part most likely to be missing when the run ends early.

**Second instance:** the fix-keepers worker of the second fix pass ended the same way, after its ponytail review,
with 38 files changed and nothing committed. A second occurrence calls for a barrier, not a rewording: `audit.py` now
prints `UNCOMMITTED (defect)` (verified on that worktree), and `run-worker.sh` should resume a run once when it exits
with its worktree dirty, telling it to commit, report and reply; that edit waits until no worker is running, since
bash reads a running script as it executes.
