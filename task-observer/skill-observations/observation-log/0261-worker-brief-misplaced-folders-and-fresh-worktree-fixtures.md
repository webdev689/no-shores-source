---
id: 261
title: "A worker brief named the wrong folders for readers, and a fresh worktree lacks fixtures cargo tests write, so client tests fail there"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "family: worker briefs and worker worktrees. checked: 0221 covers shared rigs between module workers, not fixtures a worktree lacks nor brief paths; no entry covers either."
area: "no-shores-source, passages client worker"
date: 2026-11-25
session_context: "The controller's brief told the client worker to put the passages' readers 'in the client's rules folder beside the isle's and the dungeon's', but those live in client/src/islands and client/src/game, and the layer check forbids rules/ importing anything. Three client tests failed in the fresh worktree because they read fixtures only cargo test runs write (art_levels.json, schedule.json, native layouts); run-worker.sh builds the messages, the WebAssembly and protocol's fixtures, not these. tools/uiShot.mjs needs vite resolved from the repo root, so the worker imported it by full path. The container restarted mid-run once; the workers' uncommitted edits survived and --resume carried on."
parked_until:
resolved:
resolution:
reference:
commands_verified: "python3 tools/claude-toolkit/workers/audit.py /root/wt/client; git merge passages-client; cargo xtask repo"
---
Proposed: run-worker.sh also runs the cargo tests that write the client's fixtures (or the fixtures' list is named
in the template so the worker builds them first); a controller checks a folder's existence before naming it in a
brief. The resume after a restart worked as run-worker.sh documents: no change needed there.
