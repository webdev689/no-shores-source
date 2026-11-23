---
id: 155
title: "A writing pass over game content couples to code: camera cues on a line's speaker, tests pinning exact lines, and hashed content that changes the protocol version"
status: open
type: open-source
skill: []
proposes_skill: [content-writing-pass]
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: no installed skill covers rewriting a game's dialogue or lore; checked superpowers' brainstorming and writing skills by name, neither touches content files"
area: "rewriting dialogue and lore that code and tests read"
date: 2026-11-23
session_context: "The owner asked for a writing pass over every line of dialogue and lore in the game. Before rewriting, grep showed: calm.ts turns the camera on the lookout's line and back on the next (so speaker order per scene is load-bearing); the welcome tour plays scenes back to back, so the two-lines-a-speaker rule holds across scene seams; two Journal tests pin the opening scenes' first lines; the shore's lines must name neither sea nor shore because a fallback plays them on the plaza; lore.json, quests.json and items.json are hashed into the protocol version, so the rewrite redeploys the rooms. Each was found by reading code before writing, not by a failing check."
parked_until:
resolved:
resolution:
reference: "branch ccr-c249af15-iwfmsb, content/story/*.json, client/src/game/prologue/calm.ts, tools/numbered.json"
commands_verified: "run: grep -rn for each changed line across client/src, crates, server, tools and bible -> 2 tests and 6 bible notes quoted old lines; run: python3 lint_story.py -> 0 problems after fixes"
---

**Issue:** Content strings in a game repository look free to reword, but code and tests lean on them: cinematics key camera moves to a scene's speaker order, a cutscene plays several scenes in a row so per-scene rules hold across seams, a fallback replays lines in another place, tests assert exact first lines, design notes quote lines, and some content files are hashed into a wire version so a reword is a deploy.

**Suggested improvement:** A content-writing-pass checklist (a skill, or a section in the project's Toolkit note): before rewording, (1) grep every changed line's first ~30 characters across code, tests and docs; (2) read each consumer of the scene file for order or count coupling; (3) check which content files feed a version hash or a deploy trigger; (4) validate every scene with the project's own dialogue numbers locally before running the full check; (5) keep ids, scene names and puzzle orders fixed.

**Principle:** Before rewording content that code reads, find every reader and every test that quotes it; a string's position, speaker and file can be load-bearing even when its words are not.
