---
id: 34
title: "Generated files go stale: a fresh worktree needs npm run -s schema; after a schema change the client suite needs npm run wasm and cargo test -p protocol (its .bin fixtures)"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: worktree setup steps. npm ci (done by the controller), wasm copies (done), the schema (missing). No other step found missing in three workers' reports."
area: "workers, worktree setup"
date: "2026-11-19"
session_context: "First Breach audit 2026-11-24: after BreachSeen.holders was added, a page worker saw 3 standing failures (protocol hash, fleetBerth joins) from a stale room.wasm and called them pre-existing; with the wasm rebuilt, messages.test still failed on joined.bin until cargo test -p protocol rewrote it. Stale fixtures hide real failures in the count. Ship aim session 2026-11-23: in a fresh cloud container after install-all.sh, npm run wasm failed on protocol and tsc on 40 missing imports until node tools/schema.mjs ran. Earlier: four workers in ~/wt/{opening,sea,wreck,ending} fixing the prologue; three reported the same friction."
commands_verified: "NOT RUN by the controller in a fresh worktree; three workers each report npm run -s types and node --test prologue.test.ts failing until npm run -s schema ran."
---

Three of four workers lost time on the same thing: `generated/messages` (FlatBuffers code from `npm run -s schema`) is not
in git, so a new worktree's `npm run -s types` and any test importing the messages fail until the schema step runs.
`cargo xtask check` runs it first, so the full check passes; only the quick loop fails. Proposal for the owner: the
template's "Hard rules" say to run `npm run -s schema` once in a fresh worktree, or run-worker.sh runs it at start.

**Instance (2026-11-23, fresh container, no worktree):** install-all.sh and `npm ci` leave `generated/messages` absent, so `npm run wasm` fails in `protocol` ("couldn't read messages_generated.rs") and `tsc` reports 40 missing modules. `cargo xtask check` makes it first, so the check itself passes; any narrower step run before it does not.

2026-11-24, a bisect worktree (`git worktree add --detach`) for the room's WebAssembly: `cargo build -p room-wasm`
failed on the missing `generated/messages/rust/messages_generated.rs`; copying `generated/` from the main tree and
linking `node_modules` made a 20 s rebuild per step, which attributed a moved pin in three builds.
- 2026-11-24: the same family after a schema change, not only in a fresh tree: `npm run -s wasm` and `cargo test -p
  protocol` (which writes the `.bin` fixtures messages.test reads) both have to run before the client suite means
  anything. A brief that says "use the wasm already built" should say which failures that leaves.
