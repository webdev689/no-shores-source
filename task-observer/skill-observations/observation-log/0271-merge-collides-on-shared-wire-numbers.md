---
id: 271
title: "Merging a long-lived branch into main, both sides had taken the same wire ask and refusal numbers, and only a text conflict showed it"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/04-Procedures/Branches and Merging.md", "client/src/game/passages/passageHeard.test.ts"]
siblings_checked: "checked: instance-specific to this repo's number registries (crates/gear refusal.rs, crates/protocol *_wire.rs, client copies); no installed skill merges branches with shared number spaces"
area: "merging branches that allocate from shared number spaces"
date: 2026-11-25
session_context: "Passages session, merging main (131 commits) into ccr-9b9e80b0-5e314s-passages: main's Breach asks took 82-84, its ships 86-90 and its refusals 166-172, where the passages held asks 82-87 and refusals 170-181. Git showed conflicts in refusal.rs and gear_wire.rs only because the lines were adjacent; the page's copies (passageMessages.ts PASSAGE_ASKS, passageHeard.ts REFUSED, gear.ts REFUSALS) merged clean and would have carried the old numbers. The page's asks test pinned literals (82..86) rather than reading the Rust constants, and no test tied the page's refusal range to refusal.rs."
parked_until: "PR #245 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #245, merged 2026-11-27"
reference: "commits a93866b7 (the merge), 77902214 (asks test reads passage_wire.rs), the refusal-range test commit after ffc25604 on ccr-1c146825-lrjepv"
commands_verified: "node --test client/src/game/passages/passageHeard.test.ts: run, passes at 174-185 and fails (2) with the range set back to 171-182"
---

**Issue:** Two branches each allocated the next free wire numbers (asks, refusals) from the same registry while apart. On merging, only adjacent lines conflicted; the page's mirrored tables merged without conflict and would have shipped numbers the rooms read as other asks. Tests that pin numbers as literals, rather than reading the Rust source, cannot catch it.

**Suggested improvement:** In the merge procedure (Branches and Merging), add a step: before resolving, diff every number registry both sides touched (Rust enums with explicit discriminants, *_wire.rs constants, their TypeScript mirrors) and renumber the later side. Structurally: every TypeScript mirror of a Rust number table gets a test that reads the Rust file (as gearMessages.test.ts and now passageHeard.test.ts do), never literals; a repo check could refuse a literal-pinned ask number in a test.

**Principle:** When two lines of work allocate from one shared number space, a clean textual merge is not evidence of a clean numeric merge; mirrored tables must be checked against their source, not against copies of themselves.
