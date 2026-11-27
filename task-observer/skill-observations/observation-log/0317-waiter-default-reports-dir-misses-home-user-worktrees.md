---
id: 317
title: "wait-worker.sh's default reports folder (~/wt/reports, /root here) misses workers whose worktrees sit in /home/user/wt"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/wait-worker.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: run-worker.sh derives its reports dir from the worktree's parent (correct); stop-worker.sh and audit.py not checked"
area: "waiting on headless workers"
date: 2026-11-27
session_context: "PR #229 audit fixes: five workers started in /home/user/wt/fix-*; the waiter, run with no REPORTS_DIR, printed 'NEVER STARTED: fix-room-ground (no live pid file in /root/wt/reports)' and exited 1 while all five ran. Rerun with REPORTS_DIR=/home/user/wt/reports worked."
parked_until:
resolved:
resolution:
reference: "/tmp/claude-0/-home-user/4e130c6e-7850-5af0-8ed3-4cce7e42aa85/tasks/bdccxakdg.output"
commands_verified: "REPORTS_DIR=/home/user/wt/reports bash wait-worker.sh fix-...: waits and answers DONE"
---

**Issue:** the launcher writes pid files beside the worktree (`$(dirname worktree)/reports`), but the waiter looks in `$HOME/wt/reports` unless told; with HOME=/root and worktrees under /home/user/wt the two disagree, and the waiter reports a running worker as never started.

**Suggested improvement:** let the waiter find the worker's reports folder the way the launcher does (e.g. from `git worktree list` matching the name, or a pointer file the launcher writes in ~/wt/reports), or refuse to guess and require REPORTS_DIR when ~/wt/reports holds no pid or log of that name.

**Principle:** two halves of one protocol must derive a shared path the same way; a default that silently differs turns a running job into a "never started" verdict.
