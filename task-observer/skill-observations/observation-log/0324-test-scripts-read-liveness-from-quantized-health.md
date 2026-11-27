---
id: 324
title: "A scripted test player judged a foe standing by health above 0 as it crosses the wire, so a foe alive with a sliver read as fallen"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Testing.md"]
siblings_checked: "0249 (a test's stand-in drifting from the real thing) is the nearest: a test reading a derived field instead of the state; Testing.md's 'What a good test looks like' has no line on reading state from quantized numbers"
area: "scripted players in agreement tests (crates/room-wasm/src/public_door_tests.rs, client/src/network/publicBots.ts)"
date: 2026-11-25
session_context: "Foe arrivals branch (ccr-9e470c58-pm6nyz): the raid's scripted pair stood idle while a Collector plundered every store. Its health crossed packed in thousandths as 0.000 while it was alive (guarding, health a sliver over 0); the script filtered foes by glance[10] > 0. Fixed by reading its action (dead or not) through Fighter::from_glance / glanceView."
parked_until:
resolved:
resolution:
reference: "crates/room-wasm/src/public_door_tests.rs read(); client/src/network/publicBots.ts readOf()"
commands_verified: "run: cargo test -p room-wasm public_door with a per-600-tick trace -> foe 9 health 0.0, action kind 2 (Guard), stores falling 1000->90; after the fix the raid reached its fourth wave with every store whole"
---

**Issue:** A test script decided which foes stood by a numeric field (health > 0) read after the wire's quantization (thousandths). A foe alive with under a thousandth of health read as 0 and was ignored, so the script idled while that foe won the event. The flaw was latent for months and surfaced only when an unrelated change shifted timings.

**Suggested improvement:** In Testing.md, a line: a script or test that asks "is it alive / standing / done" reads the explicit state the system keeps (an action, a phase, a flag), never a number compared with zero after it has been rounded or packed.

**Principle:** Never infer a discrete state from a quantized continuous value; read the state itself, or a rounding boundary will one day flip the answer.
