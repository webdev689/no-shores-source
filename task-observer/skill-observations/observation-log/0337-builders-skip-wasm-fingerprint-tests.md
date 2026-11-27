---
id: 337
title: "Builders who changed room rules ran their crate's tests but not room-wasm's, so pinned fingerprints broke only in the lead's full check"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: the passage fingerprint (room-wasm passage_room_door_tests PASSAGE_HASH) moved twice, by shield regrowth and by the ledge fix"
area: "parallel builders"
date: 2026-11-27
session_context: "PR #234: the foes builder and the rust fixer each changed rules a passage zone's scripted fight runs through; neither ran cargo test -p room-wasm; each full check after merging failed on PASSAGE_HASH and a bisect found the cause."
parked_until:
resolved:
resolution:
reference: "PR #234 commits bd0dcb385, 183748462"
commands_verified: "bisect by probe commits in a worktree with a private target"
---
Proposed: a builder who touches crates/room, crates/foes, crates/combat or crates/movement also runs
cargo test -p room-wasm (the pinned fingerprints) before reporting.
