---
id: 167
title: "The worker brief tells the reviewer to diff against origin/main, which for a worker forked from a session branch with unpushed commits shows other work as the worker's"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "tools/claude-toolkit/workers/run-worker.sh"]
siblings_checked: "checked: brief-common-template.md is the only brief source; run-worker.sh knows the worktree's fork point and could pass it"
area: "worker review diffs"
date: 2026-11-23
session_context: "bible-dungeon-matchmaking pickup: workers fperks and fblade were forked from the controller's session branch, which held commits not yet on origin; the template says '<base> is origin/main'. fperks's report noted the controller's commits in its base; fblade's reviewer fell back to HEAD~1...HEAD, which reviews only the last commit."
parked_until:
resolved:
resolution:
reference:
commands_verified: none
---

**Issue:** The template says the reviewer diffs `git diff <base>...HEAD` with `<base>` as `origin/main` "or another origin/ ref". A worker forked from the controller's branch with unpushed commits has no origin ref at its fork point. So its review either takes in the controller's commits or, as fblade's did, falls back to `HEAD~1...HEAD` and reviews only the last commit.

**Suggested improvement:** Have `run-worker.sh` record the worktree's fork commit (`git rev-parse HEAD` at creation) and name it in the task as `$WORKER_BASE`. The template then says the reviewer diffs `$WORKER_BASE...HEAD`.

**Principle:** A review's diff base should be the commit the work started from, recorded when it starts. Guessing a remote ref afterwards either takes in other people's work or misses part of your own.
