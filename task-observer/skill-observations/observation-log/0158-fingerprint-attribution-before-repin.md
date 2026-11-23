---
id: 158
title: "A pinned fight fingerprint broke after several fixes at once: each fix was taken out alone to find which moved it, and the fight it pins measured, before re-pinning"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: a method for the project's audits (Toolkit.md, Audits), no skill holds it"
area: "re-pinning a golden fingerprint after a behaviour change"
date: 2026-11-23
session_context: "Patrol audit: four fixes to the foes' minds landed together (stale answers, the section's dead, a falling-back target, swings told only to the foe they are at). spread_tests::one_player_against_a_group_fights_as_it_always_did failed on its fingerprint. Taking out the swing filter alone brought the old fingerprint back, so the other three did not touch that fight; a throwaway test then measured blows landed on a lone swinging player a minute against 3, 6 and 12 foes with and without the filter (44.7/44.3/42.5 vs 45.2/44.2/43.0) before the pin was moved."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: cargo test -p room --lib one_player_against_a_group_fights_as_it_always_did with the filter taken out -> ok on the old hash; with it -> 592690bc435b7cb3"
---

**Issue:** A fingerprint test pins a fight tick by tick. When several fixes land together and it fails, the easy move
is to paste the new hash, which hides whether one fix moved it or all did, and whether the fight it stands for changed
in a way the owner would care about (here, how hard a lone player is pressed).

**Suggested improvement:** In Toolkit.md's Audits, beside "each finding is measured before it is fixed": before moving
a pinned fingerprint, take out each fix alone and rerun the pin to name the fix that moves it; then measure the
quantity the pin guards (blows landed, time to kill, damage taken) with and without that fix, and put both numbers in
the commit message. Remember the pins elsewhere the same rules feed (observations 0054, 0121).

**Principle:** A golden value is evidence only when its change is attributed: name the change that moved it and
measure what it stands for before accepting the new value.
