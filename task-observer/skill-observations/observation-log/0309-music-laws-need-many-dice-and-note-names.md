---
id: 309
title: "Music laws hid defects: six fixed dice, a die of 0.5, exact pitches, and a 'new pieces' scope"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["bible/02-Systems/Music.md", "client/src/game/audio/music/variation.test.ts", "client/src/game/audio/music/variety.test.ts"]
siblings_checked: "checked: the music's tests held each law on six seeds or one fixed die; no law compared pieces with each other before #227's audit"
area: "testing synthesised music"
date: 2026-11-26
session_context: "#227's audit: the ten-minute take law passed on six seeds and failed on 11 of 200 (cold); a fixed die of 0.5 hid a lost sea-turn memory; a detail pass found new calm pieces copying older ones that every law passed; a variety law comparing exact pitches missed the same close an octave apart; each widening of a variety law caught older pieces too."
parked_until: "PR #244 merge"
resolved:
resolution:
reference: "PR #227, commits 8337a531e, 3a267e1ba, b3721d47d, f1c9b2719"
commands_verified: "node --test client/src/game/audio/music: run, 450 pass"
---
Proposed: a music law is held over 50+ dice and against the die that would hide it; a variety law compares note
names and takes its limits from the older, distinct pieces; a note-by-note detail pass runs before music is called
done.
