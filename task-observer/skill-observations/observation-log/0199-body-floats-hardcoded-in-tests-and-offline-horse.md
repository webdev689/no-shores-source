---
id: 199
title: "Two new body numbers broke a dozen tests that write 22/7/17 by hand; riding cannot be pictured offline"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "client/src/game/qa"]
siblings_checked: "horse worker's report; the worker's fix commit e95788a9 now writes those tests by BODY_FLOATS and CONTROLS_FLOATS"
area: "changing a wire layout; picturing a mounted player"
date: 2026-11-24
session_context: "Horse worker added the boost's two clocks to the movement body and a tap to the controls. About a dozen tests (Rust, TS and server) hard-coded the old lengths, and six fingerprints are mirrored across Rust, TS and the server's tests. The server tests' protocol hashes stayed stale until `npm run wasm` was rerun. Offline `&spawn=` pages give no horse, so Riding never showed and no picture of the boost was possible. Context7 and SkillsMP were unreachable (proxy 403)."
parked_until:
resolved:
resolution:
reference:
commands_verified: "none (from the worker's report)"
---

**Issue:** A layout change ripples into tests that restate the layout's sizes and fingerprints by hand, in three
languages. And the QA hooks cannot give the offline character a horse, so mounted play has no pictures.

**Suggested improvement:** Toolkit.md: after a change to a `*_FLOATS` layout, grep the tests for the old numbers
and run `npm run wasm` before the server tests. A dev-only QA hook (or `&horse=`) that gives the offline
character the Bay worn.

**Principle:** Tests should name a layout's sizes from the layout, so a change to it fails only where meaning
changed.
