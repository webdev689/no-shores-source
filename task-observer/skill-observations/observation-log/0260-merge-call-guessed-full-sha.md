---
id: 260
title: "The merge call's expectedHeadSha was a full SHA guessed from the short one; GitHub refused it as 'Head branch was modified'"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked — instance-specific to the GitHub MCP merge call; the other calls this session that took a SHA (send_later prompts, PR bodies) used the short form, which nothing checks against."
area: "controller, merging a pull request on the owner's yes"
date: "2026-11-25"
session_context: "PR #209's merge on the owner's 'Merge and deploy': the first merge_pull_request call passed 3024af9c5d4a... (the short 3024af9c padded by guess); the real head was 3024af9c6e95..."
commands_verified: "git ls-remote origin refs/heads/ccr-e6d499b8-6v6er9 printed 3024af9c6e9575e63d42f357b286a816d60821b2; the second call with it merged as b608b3c7."
---

The guard did its job: a wrong expectedHeadSha makes GitHub refuse the merge (409, "Head branch was modified"),
so nothing merged by mistake. But the message reads as a race on the branch, which would send a controller to
re-check CI and the branch for a change that never happened. Rule: take the full SHA from `git ls-remote origin
refs/heads/<branch>` (or `git rev-parse HEAD` after a fetch) in the same turn as the merge call; never extend a short
SHA by hand.
