---
id: 210
title: "A bare `npx tsc --noEmit -p .` misses the test files; `npm run -s types` (three tsconfigs) is the check xtask runs"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Testing.md"]
siblings_checked: "none: the target is a project note, not a skill"
area: "type-checking the client before a full check"
date: 2026-11-24
session_context: "Chests and searchable containers: I type-checked edits with `npx tsc --noEmit -p .`, which passed, but `cargo xtask check` failed in its types step on a test file (`client/src/layout/layouts.test.ts`, an optional field read without a guard), because the tests are only in `tsconfig.node.json`. Also: after a `.fbs` edit, the message fixtures that `cargo test -p protocol` writes went stale and `client/src/network/messages.test.ts` failed with a protocol-hash mismatch until `npm run schema && cargo test -p protocol` ran again."
parked_until:
resolved:
resolution:
reference:
commands_verified: "npx tsc --noEmit -p . (passed, missed the error); npm run -s types (caught it); npm run -s schema && cargo test -q -p protocol (refreshed the fixtures, the TS test then passed)"
---

**Issue:** A fast type-check of the page with `npx tsc --noEmit -p .` reads only `tsconfig.json`, which leaves the
test files out; `npm run types` runs three configs (page, node/tests, server). An error in a test file surfaced only in
the full `cargo xtask check`, a 20-minute run. Separately, editing `crates/protocol/*.fbs` after the protocol tests had
written their fixtures left `messages.test.ts` comparing a stale protocol hash.

**Suggested improvement:** In `bible/03-Code/Testing.md` (or Toolkit's quick checks): "Type-check with
`npm run -s types`, never a bare `tsc -p .`, which skips the tests"; and "after any `.fbs` change, run
`npm run -s schema && cargo test -q -p protocol` before the TypeScript tests, which read the fixtures it writes."

**Principle:** A quick local check that covers less than the gate it stands in for gives false confidence; reuse the
gate's own command for the fast path, and regenerate derived fixtures whenever their source schema changes.

**A second instance, same session:** test code added after the last `cargo clippy --all-targets` run (a one-letter
closure binding in `crates/room/tests/chests_planned.rs`) failed the full check's Rust lints 20 minutes in. The quick
path that stands in for the gate is `cargo clippy -q --all-targets --workspace -- -D warnings` plus `npm run -s types`
and `npm run -s lint`, run after the last edit, not after the last big one.
