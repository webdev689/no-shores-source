---
id: 156
title: "A balance change kept the number an owner decision names (a foe's arrow at 18) but broke a ratio the same decision sets (aimed 1.5 times quick); found only while writing the decision note's 'replaced in part' line"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/04-Procedures/Recording a Decision.md", "CLAUDE.md"]
siblings_checked: "checked: Recording a Decision says only the owner decides and how to mark a note replaced; nothing asks a change to look for the relations an owner's decision sets (ratios, orders, 'never more than'). Instance-general: any tuning pass under owner decisions."
area: "tuning numbers that sit under owner decisions"
date: 2026-11-23
session_context: "The balance and economy pass: the bow's quick shots out-damaged every blade, so a player's quick bow shot was cut to two thirds. The grep of the decisions found 'Back to 18' (a foe archer's arrow) and the change kept it, but the same note records the owner's 'how much harder an aimed shot hits: 1.5 times', which the change turned into 2.25 times for the bow. It surfaced when the note's text was being marked replaced in part; the fix scaled both shots by two thirds, keeping 1.5."
parked_until:
resolved:
resolution:
reference: "bible/05-Decisions/Ranged Weapons Aim and Fire.md; crates/combat/src/shots.rs PLAYER_BOW"
commands_verified: "run: cargo test -p combat -> pass after the fix"
---

**Issue:** A tuning change was checked against the owner's decisions by searching for the number it changed. The
decision held a second rule over the same numbers, a ratio (aimed = 1.5 × quick), which a search for the number did
not surface; the change broke it, and it was caught only while editing that decision note afterwards.

**Suggested improvement:** Before changing a number in a pass, read in full each decision note that names the thing the
number belongs to (the weapon, the rank, the currency), and list the relations it sets: ratios, orders, caps, "never
more than". Check the change keeps each, and write the list into the calls note's reason.

**Principle:** Owner decisions constrain relations between numbers as well as the numbers themselves; a search for the
value finds the second kind only. Read the whole decision about the thing being tuned before tuning it.
