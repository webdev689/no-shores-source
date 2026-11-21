---
id: 74
title: "npm test fails in a fresh worktree until schema, wasm and cargo-written fixtures exist; urllib 403s on r2.dev"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "family: worktree setup (node_modules symlink, CARGO_TARGET_DIR unset, npm run schema, npm run wasm)."
area: "overlook-source, worktrees and tests"
date: "2026-11-21"
session_context: "A worker built the forge's large weapon pictures in .claude/worktrees/weapon-art."
commands_verified: "npm test (failed: missing generated files); npm run schema; npm run wasm; cargo xtask check (passed)"
---
In a fresh worktree `npm test` fails until `npm run schema` and `npm run wasm` run, and some fixtures
(`art_levels.json`, `dress_layers.json`) are written only by `cargo test`; `cargo xtask check` makes all of them. Also,
a stale room.wasm from another branch made three fingerprint tests fail in the main checkout until `npm run wasm`.
Python's urllib gets 403 from the r2.dev bucket through the proxy while curl works.

Proposal: the Toolkit note says to run `cargo xtask check` once (or schema, wasm and `cargo test`) before `npm test`
in a new worktree or after switching branches, and to fetch R2 with curl.
