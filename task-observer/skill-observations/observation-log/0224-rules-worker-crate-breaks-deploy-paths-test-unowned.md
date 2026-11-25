---
id: 224
title: "A new rules crate broke the rooms' deploy-paths test no worker owned, and worker.ts sits at the 600-line limit"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "server/worker.ts"]
siblings_checked: "family: worker briefs splitting rules, server and client. checked: 0221 and 0222 cover shared rigs and fresh-worktree fixtures, not a deploy-paths list a new crate must join; no entry covers it."
area: "no-shores-source, passages rules and server workers"
date: 2026-11-25
session_context: "The rules worker added crates/passage and content/passages to what the rooms are built from, but .github/workflows/rooms.yml's ROOMS_CODE did not list them, so server/roomsDeploy.test.ts failed after the rules merge; the server worker fixed it though it was outside its item. server/worker.ts was at 598 of 600 lines, so the server worker moved roomName and entranceOf out, and the controller chose a room-side stand for going home over a new join path partly for the same limit. The server worker used scripted replacements instead of Serena's symbol edits."
parked_until:
resolved:
resolution:
reference:
commands_verified: "node --test server/roomsDeploy.test.ts (failed before the rooms.yml fix, passed after); wc -l server/worker.ts"
---
Proposed: the template's rules for a worker adding a crate the rooms build name the deploy-paths list
(.github/workflows/rooms.yml ROOMS_CODE) and its test; worker.ts's host is split by job (joining, keeping, routing)
before the next feature needs room in it.
