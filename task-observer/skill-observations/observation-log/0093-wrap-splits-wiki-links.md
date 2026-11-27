---
id: 93
title: "Re-wrapping bible prose splits [[wiki links]] across lines; synth fallbacks hid an injectable play"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/04-Procedures/Recording a Decision.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: bible prose edits by script (textwrap, prettier); test seams for audio modules (fightSounds, worldSounds play injection)."
area: "overlook-source, bible editing and audio tests"
date: "2026-11-21"
session_context: "The sound pass: recording the owner's picks in the decision note, and removing the synthesiser behind the ambience and the story's sounds."
commands_verified: "python3 textwrap with wiki-link spaces swapped for \\x00 then restored; npx prettier --check; node --test on cinema/ambience.test.ts after injecting play"
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: crates/xtask/src/checks/vault.rs:296 (a wikilink broken across lines fails the vault check)"
---
Python's `textwrap` (and naive re-wrapping) split Obsidian `[[wiki links]]` across two lines three times in one
session, which breaks the link. Swapping the spaces inside each `[[...]]` for a placeholder before wrapping, then
restoring them, keeps every link whole.

Removing synth fallbacks broke tests that counted synthesised nodes; giving the module an injectable `play` (as
`fightSounds.ts` and `worldSounds.ts` already do) let the tests see what plays without an audio graph.

Proposal: the Toolkit note says to protect wiki links when re-wrapping bible prose by script, and that audio modules
take an injectable `play` so tests never depend on the synthesiser.
