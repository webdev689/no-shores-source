---
id: 240
title: "The harness's stop hook asks for a push at every turn's end; with the owner asking for the full check before a push, an early commit led to a push before it"
status: declined
type: internal
skill: []
proposes_skill: []
target_file: ["bible/04-Procedures/", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the hook is the cloud harness's, not the kit's; CLAUDE.md asks for cargo xtask repo and the changed tests before a push"
area: "pushing a change"
date: "2026-11-25"
session_context: "The layout flaws session (branch claude/amazing-euler-gefw4k). The owner's brief said: run cargo xtask check before pushing. The fixes were committed while the room tests ran; the stop hook then asked at each turn's end to push the unpushed commit, and the branch was pushed after cargo xtask repo and the layout tests (CLAUDE.md's floor) but before the full check, which was run locally after. CI ran the check on the head either way. Writing this entry, an unquoted heredoc ran a backticked `cargo xtask check` in its text as a command, a second check beside the first, stopped within two minutes."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, dropped: obsolete, same as #0164; the full check before a push was one owner brief's ask"
reference:
commands_verified: "cargo xtask repo (no problems); cargo test -p layout --lib (91 passed) before the push; NODE_USE_ENV_PROXY=1 cargo xtask check after it"
---

The cloud harness's stop hook says "There are N unpushed commit(s) ... Please push" whenever a turn ends with work
committed but not pushed, and "uncommitted changes" while an experiment edits tracked files on purpose. When the owner
asks for the whole check (some 35 minutes) before a push, committing early sets the hook against that order.

Proposal: start `cargo xtask check` before the commit that will be pushed, and commit and push only once it passes; an
experiment that edits tracked files works on a copy or a worktree where the hook cannot see it. An observation's text
goes in through a quoted heredoc (`<<'EOF'`), since its backticks name commands.
