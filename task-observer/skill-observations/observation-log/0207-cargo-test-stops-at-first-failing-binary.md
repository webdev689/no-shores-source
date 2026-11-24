---
id: 207
title: "cargo test stops at the first failing test binary, hiding later failures; a worker needed --no-fail-fast, and cargo test -p room ran over 10 minutes on shared cores"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "CLAUDE.local.md"]
siblings_checked: "checked: cargo xtask check runs the whole workspace and reports every failure itself, so only a worker's own targeted `cargo test -p <crates>` runs are affected; roomsDeploy.test's helper-file rule is already in CLAUDE.local.md (ROOMS_CODE), the worker hit the same rule from a test helper importing client code"
area: "targeted Rust test runs inside workers"
date: 2026-11-24
session_context: "PR #179's third audit, fix3-errands: changed crates gear, room and room-wasm and server/*.ts. Its targeted cargo test runs stopped at the first failing binary, so each fix revealed the next failure one run at a time; cargo test -p room took over 10 minutes under the four-worker load. A new test helper (server/outpostReloadForTests.ts) importing client code tripped server/roomsDeploy.test.ts."
parked_until:
resolved:
resolution:
reference:
commands_verified: "worker's report /root/wt/reports/fix3-errands.md and fix3-errands.log OBSERVATIONS line"
---

**Issue:** A targeted `cargo test -p a -p b` stops at the first test binary that fails, so a worker fixing several crates finds their failures one slow run at a time. On shared cores each run of `-p room` took over 10 minutes.

**Suggested improvement:** The common brief should say to run targeted Rust tests with `--no-fail-fast`, in the background, with a long timeout. CLAUDE.local.md's ROOMS_CODE line should add that a server test helper importing client code counts as a file the rooms read.

**Principle:** One run should show every failure it can, most of all when a run is slow.
