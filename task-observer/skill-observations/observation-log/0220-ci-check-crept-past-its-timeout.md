---
id: 220
title: "CI's check crept past its 45-minute job limit: the guilds' merge was cancelled at 44 minutes and nothing deployed, after a PR run at 44.4 minutes went unremarked"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: [".github/workflows/ci.yml", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: rooms.yml (5, 15, 30 min) and pages.yml (20, 10 min) jobs run far under their limits; only ci.yml's check job is near its own"
area: "watching CI run times against their job limits"
date: 2026-11-24
session_context: "PR #179 (guilds) merged as aa73c57e on the owner's yes. main's ci run 45450525381 cancelled its check step at 18:22:13, 44 minutes in, so rooms and pages were skipped and nothing deployed. The PR's last check run (8b06fb69) took 44.4 minutes of the same 45-minute limit; the session read it as green and moved on. The owner saw 'things keep getting canceled'. Fixed in PR #195: timeout-minutes 75."
parked_until:
resolved:
resolution:
reference:
commands_verified: "read: actions_list list_workflow_jobs 45450525381 -> check cancelled at 18:22:13, rooms and pages skipped; PR #179 check run 138582951508 16:05:04 to 16:49:27"
---

**Issue:** A green CI run that used almost all of its job's time limit was treated as fine. The next run on main, a little slower, was cancelled at the limit, which skips the deploy jobs behind it. A cancelled check also reads as "cancelled", not "failed", which makes it easy to miss.

**Suggested improvement:** After a CI run, compare the check job's duration to its `timeout-minutes`. Past about 80%, raise the limit or split the check in the same PR, and say so to the owner. When watching a deploy, treat "cancelled" on the check as a failed deploy and find its cause.

**Principle:** A run that barely fits its limit is a failure waiting for its next commit. Check the margin, not just the colour.
