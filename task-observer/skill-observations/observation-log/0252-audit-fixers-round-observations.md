---
id: 252
title: "Audit fixers' observations: no reviewer agent in a worktree worker, a python heredoc edit, git in $(...) refused, shared cores, layer table before dedupe"
status: open
type: internal
skill: ["superpowers:dispatching-parallel-agents"]
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "CLAUDE.local.md"]
siblings_checked: "family: worktree workers. All five fixers of PR #209 reported the same missing Agent tool; the heredoc and $(...) items came from one worker each; the dedupe-blocked-by-layers item from the client fixer only, as the Rust crates have no layer table."
area: "worktree fixer agents"
date: "2026-11-25"
session_context: "PR #209, the codebase audit, fixers A to E (commits 5396e18c, 3afa6f26, cac76822, 0743ef9b, 47c1be73)."
commands_verified: "none run: the items are the workers' own reports, read in their hand-back messages."
---

From the fixers' OBSERVATIONS lines:

1. No worktree worker had the Agent tool, so the brief's "have a reviewer read your diff" became a self-review in all
   five. Briefs should say so, or the controller runs the review after the cherry-pick.
2. Worker B edited `client/src/game/ways.ts` through a python heredoc, against CLAUDE.local.md's rule (same rule as
   0036). The result matched what an Edit would give, but the barrier is still only text in the brief.
3. The worktree guard refuses any command running `git` inside `$(...)`; run git as its own call.
4. Two fixers' cargo builds shared four cores, so the room and room-wasm tests took about 30 minutes in debug. Running
   the Rust-heavy fixers one after the other, or one at a time with `CARGO_BUILD_JOBS`, would finish sooner.
5. Foreground `sleep` is blocked in workers; waiting on a background test needs Monitor.
6. The client fixer's proposed deduplications were blocked by the layer table (`crates/xtask/src/checks/layers.rs`);
   a dedupe brief should name the layer table so the worker checks it before moving code.
