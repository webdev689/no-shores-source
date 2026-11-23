---
id: 34
title: "A fresh worktree or container: types, tests and npm run wasm fail until npm run -s schema has made generated/messages"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: worktree setup steps. npm ci (done by the controller), wasm copies (done), the schema (missing). No other step found missing in three workers' reports."
area: "workers, worktree setup"
date: "2026-11-19"
session_context: "Ship aim session 2026-11-23: in a fresh cloud container after install-all.sh, npm run wasm failed on protocol and tsc on 40 missing imports until node tools/schema.mjs ran. Earlier: four workers in ~/wt/{opening,sea,wreck,ending} fixing the prologue; three reported the same friction."
commands_verified: "NOT RUN by the controller in a fresh worktree; three workers each report npm run -s types and node --test prologue.test.ts failing until npm run -s schema ran."
---

Three of four workers lost time on the same thing: `generated/messages` (FlatBuffers code from `npm run -s schema`) is not
in git, so a new worktree's `npm run -s types` and any test importing the messages fail until the schema step runs.
`cargo xtask check` runs it first, so the full check passes; only the quick loop fails. Proposal for the owner: the
template's "Hard rules" say to run `npm run -s schema` once in a fresh worktree, or run-worker.sh runs it at start.

**Instance (2026-11-23, fresh container, no worktree):** install-all.sh and `npm ci` leave `generated/messages` absent, so `npm run wasm` fails in `protocol` ("couldn't read messages_generated.rs") and `tsc` reports 40 missing modules. `cargo xtask check` makes it first, so the check itself passes; any narrower step run before it does not.
