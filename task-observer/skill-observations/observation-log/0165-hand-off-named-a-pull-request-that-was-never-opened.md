---
id: 165
title: "A hand-off said the work waited in 'its pull request', but the branch had none: its only one (#155) had merged before the work"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.md"]
siblings_checked: "checked: the other items in Waiting on the owner name their pull requests by number"
area: "handing off work waiting on the owner"
date: 2026-11-23
session_context: "Session pickup of ccr-06efd4d0-ffd79v: its Hand-off.md listed the prologue rework 'branch ccr-06efd4d0-ffd79v, its pull request' for the owner's yes; list_pull_requests for that head showed only #155, merged at 02:38 before the 161 commits of the rework. The work had no pull request and main had moved 202 commits on."
parked_until: "PR #240 merge"
resolved:
resolution:
reference: "PR #172"
commands_verified: "run: mcp__github__list_pull_requests head=lattymoy:ccr-06efd4d0-ffd79v state=all -> only #155, merged"
---

**Issue:** The owner reads the hand-off to know what to say yes to; a line naming a pull request that does not exist
leaves the work invisible on GitHub.

**Suggested improvement:** In `CLAUDE.md` "Every session" step 4, before rewriting the hand-off: open the pull
request for any work it lists as waiting on the owner, and name it by number there.
