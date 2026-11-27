---
id: 235
title: "A long session changed a behaviour many tests lean on (a place's mesh baked over ticks, not in one) and found main's new tests leaning on the old one only at the final merge, 232 commits later"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.md", "bible/04-Procedures/"]
siblings_checked: "none: the targets are project files, not skills"
area: "keeping a long branch in step with main"
date: 2026-11-24
session_context: "The owner's extreme performance pass, one session on ccr-e8a0a01b-x0c5vj from 761e5937. Slicing the navmesh bake (f5e564f6) changed when anything standing on a place's mesh stands; the branch's own tests were fixed as found (room, protocol, room-wasm fingerprint, server/quests.test.ts). Only at the end did `git fetch origin main` show 232 new commits: one conflict (foot.ts), waterCommon.ts pushed over 600 lines, and main's new War Horn tests (outpost_boss_tests.rs) expecting the horn's foe in three ticks, each found by a further 35-minute full check. `cargo test --workspace` stops at the first failing binary, so each check found one more."
parked_until: "PR #240 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #240, merged 2026-11-27"
reference:
commands_verified: "git rev-list --count HEAD..origin/main (232); cargo test --workspace --release --no-fail-fast (all failures in one run)"
---

**Issue:** A change to a timing or order other code leans on (here, a place's mesh baked a slice a tick) reaches everything that leans on it, main's newest code included. Found at the last merge, each of main's tests that leans on it costs a full check to surface, because `cargo test` stops at the first failing binary and the check runs it that way.

**Suggested improvement:** Once a session has changed shared behaviour, fetch and merge main right away and again before the final checks, and run `cargo test --workspace --no-fail-fast` (and `npm test`) once to list every failure before the slow full check. Name the shared behaviour in the PR, so other sessions merging into main know to wait for it.

**Principle:** Bring a behaviour change to the newest code that leans on it as early as it exists, and list every breakage in one run, not one per full check.
