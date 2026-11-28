---
id: 279
title: "A Freesound re-search drifted from the owner's own words through six clever queries, each try costing 40 minutes because every run re-reads all ~190 picks"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/freesound/candidates.mjs", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the targets are project files, not skills"
area: "searching sounds for the owner's sheet"
date: 2026-11-25
session_context: "The owner asked for a new 'city chatter' and later 'Try again with the hum'. The hum's original query was 'distant city'. Claude searched 'town ambience distant', 'medieval town ambience', 'medieval city ambience', 'fantasy town ambience -park', 'medieval market ambience -park', 'harbor town ambience -park', 'old town ambience -park -klankbeeld': parks, ghost towns, nothing, and one recordist (klankbeeld) filling most results. The owner: 'Dude how hard can it be to get distant city sounds'. Each run took ~40 min: candidates.mjs reads every picked cue's page and preview on every run, and the workflow's ONLY input narrows the search but not that read. Four candidates a query (OFFERED = 4)."
parked_until: "PR #243 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #243, merged 2026-11-27"
reference:
commands_verified: "freesound runs 45533105199, 45607796088, 45613620140, 45619697768, 45619761214, 45626667256 (each ~40 min; the market query 0 kept)"
---

**Issue:** Asked to try again, the agent rewrote the owner's search words each time toward what it guessed the sound
should be, instead of keeping the owner's own phrase and varying only around it; and each guess cost the owner a
40-minute wait, since a search run spends most of its time re-reading every settled pick's credit and preview.

**Suggested improvement:** Toolkit.md (sound sheet): a re-search starts from the owner's own words (the cue's first
query, or what they type under "None of these"), several phrasings run side by side rather than one after another.
candidates.mjs: with ONLY set, read only the picks of the cues searched (the staging and publish steps then skip the
rest), so a single cue's search takes minutes; a per-cue `offered` count for when four are too few.

**Principle:** When the person has named what they want in plain words, search with their words before your own
refinements; and when each iteration is slow, batch variations in parallel and remove the fixed cost that dominates a
single iteration.
