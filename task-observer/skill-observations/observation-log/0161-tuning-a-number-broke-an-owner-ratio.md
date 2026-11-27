---
id: 161
title: "A change under an owner decision was checked against it only while its note was written: a balance change broke a ratio the decision sets (aimed 1.5 times quick), and a gunnery fix trained guns off square against 'Keep square broadsides'"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/04-Procedures/Recording a Decision.md", "CLAUDE.md"]
siblings_checked: "checked: Recording a Decision says only the owner decides and how to mark a note replaced; nothing asks a change to look for the relations an owner's decision sets (ratios, orders, 'never more than'). Instance-general: any tuning pass under owner decisions."
area: "changing numbers or laws that sit under owner decisions"
date: 2026-11-23
session_context: "(1) The balance and economy pass: the bow's quick shots out-damaged every blade, so a player's quick bow shot was cut to two thirds. The grep of the decisions found 'Back to 18' (a foe archer's arrow) and the change kept it, but the same note records the owner's 'how much harder an aimed shot hits: 1.5 times', which the change turned into 2.25 times for the bow. It surfaced when the note's text was being marked replaced in part; the fix scaled both shots by two thirds, keeping 1.5. (2) 2026-11-24, ships at the Harbourmaster: to make a long battery land its class's weight, each player's gun was trained up to 15 degrees onto the point laid on, and tested. Only while writing the Naval Combat note did the link to Ship Guns Keep Square Broadsides show the owner had chosen square broadsides over guns that traverse to the look. The fix was redone square, each gun elevated from its own deck, which turned out to be the real cause (the Frigate's lower deck fell short)."
parked_until: "PR #245 merge"
resolved:
resolution:
reference: "bible/05-Decisions/Ranged Weapons Aim and Fire.md; crates/combat/src/shots.rs PLAYER_BOW"
commands_verified: "run: cargo test -p combat -> pass after the fix; ships: cargo test -p naval --lib each_gun_elevated (passes square, per-gun elevation)"
---

**Issue:** A tuning change was checked against the owner's decisions by searching for the number it changed. The
decision held a second rule over the same numbers, a ratio (aimed = 1.5 × quick), which a search for the number did
not surface; the change broke it, and it was caught only while editing that decision note afterwards.

**Suggested improvement:** Before changing a number in a pass, read in full each decision note that names the thing the
number belongs to (the weapon, the rank, the currency), and list the relations it sets: ratios, orders, caps, "never
more than". Check the change keeps each, and write the list into the calls note's reason.

**Principle:** Owner decisions constrain relations between numbers as well as the numbers themselves; a search for the
value finds the second kind only. Read the whole decision about the thing being tuned before tuning it.

**Second instance (2026-11-24):** a law (how guns are laid), not a number: the decision was found by its wiki link
while writing the note, after the code and its test were done. The same check applies to a mechanic's law: before
changing how a system behaves, read the decision notes its system note links to.

**Barrier (second occurrence, so not a rewording):** a repo command, run before committing, that maps each changed
source file to the system notes whose `code:` frontmatter names it and prints the decision notes those system notes
link to, e.g. `cargo xtask decisions` over `git diff --name-only`. The vault check already reads `code:` frontmatter
and wiki links, so the map exists; the change is to show it at the moment of change instead of at note-writing time.
A new check needs the owner's agreement (Rules), so this is a proposal.
