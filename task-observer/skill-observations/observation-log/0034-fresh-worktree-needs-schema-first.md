---
id: 34
title: "A fresh worktree's types and tests fail until npm run -s schema has made generated/messages"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: worktree setup steps. npm ci (done by the controller), wasm copies (done), the schema (missing). No other step found missing in three workers' reports."
area: "workers, worktree setup"
date: "2026-11-19"
session_context: "Four workers in ~/wt/{opening,sea,wreck,ending} fixing the prologue; three reported the same friction."
commands_verified: "NOT RUN by the controller in a fresh worktree; three workers each report npm run -s types and node --test prologue.test.ts failing until npm run -s schema ran."
---

Three of four workers lost time on the same thing: `generated/messages` (FlatBuffers code from `npm run -s schema`) is not
in git, so a new worktree's `npm run -s types` and any test importing the messages fail until the schema step runs.
`cargo xtask check` runs it first, so the full check passes; only the quick loop fails. Proposal for the owner: the
template's "Hard rules" say to run `npm run -s schema` once in a fresh worktree, or run-worker.sh runs it at start.
