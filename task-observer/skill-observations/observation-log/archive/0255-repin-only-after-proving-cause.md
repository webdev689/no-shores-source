---
id: 255
title: "A pinned fingerprint that moves with a wire change is re-pinned only once switching the change off restores the old one"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Testing.md"]
siblings_checked: "Testing.md names the pinned fingerprints (SEA_CLASH_HASH in door_tests.rs and roomDoor.test.ts) but not how to prove a new value's cause before re-pinning"
area: "re-pinning snapshot fingerprints after a protocol change"
date: "2026-11-25"
session_context: "The sea's chart on #207 (claude/amazing-euler-gefw4k): adding `charted` to the sea snapshot moved SEA_CLASH_HASH from b83a9706368fa925 to 0462cf65304bcb00. With the chart switched off for one run (chart = false), the old hash held, so the chart was its only cause; both copies (door_tests.rs, server/roomDoor.test.ts) were re-pinned and the server test, through the built WebAssembly, passed on the new one."
parked_until: "PR #245 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #245, merged 2026-11-27"
reference:
commands_verified: "cargo test -p room-wasm --lib pinned_fingerprint (old hash with the change off, new with it on); node --test server/roomDoor.test.ts"
---

A fingerprint pinned over many snapshots moves with any byte, so a new value alone says nothing about why it moved.
Switching the intended change off for one run and seeing the old value come back proves the change is the only cause;
the server's copy run through the built WebAssembly then proves the build carries it. Proposal: Testing.md says this
under the pinned fingerprints, and that both copies are re-pinned together.
