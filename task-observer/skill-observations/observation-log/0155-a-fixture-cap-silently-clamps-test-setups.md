---
id: 155
title: "A test setup that gave a character more Aurem than the 25,000 cap was clamped without a word, so the test failed far from its cause"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["crates/gear/src", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked — instance-specific to the gear crate's capped materials; the principle holds for any capped value a test fixture sets"
area: "test fixtures that set capped game values"
date: 2026-11-23
session_context: "Worker fperks (the factions' nine perks), OBSERVATIONS line: buying several faction wares in one test needed more Aurem than the 25,000 cap; the setup's grant was silently clamped, so a later purchase was refused (Short) with nothing pointing at the setup."
parked_until: "PR #244 merge"
resolved:
resolution:
reference: "/root/wt/reports/fperks.md (session-local; the finding is in the body)"
commands_verified: none
---

**Issue:** A gear test gave a character more Aurem than the 25,000 cap to buy several faction pieces. The grant was clamped to the cap without a word. A later purchase was then refused as short of Aurem, so the failure showed up far from its cause, and the worker had to trace back to find it.

**Suggested improvement:** Give the gear crate's test helpers that set capped values (Aurem and other materials) a debug assertion or a test-only setter that fails when asked for more than the cap, and say in the helper's doc comment that the cap applies.

**Principle:** A fixture that silently clamps what a test asks for turns a setup mistake into a confusing failure later. Clamp in the game rules, but make test setup fail loudly when it asks for the impossible.
