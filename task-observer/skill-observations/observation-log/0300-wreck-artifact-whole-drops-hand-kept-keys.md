---
id: 300
title: "Taking the wreck workflow's level artifact whole would drop the mast and the rank 2 boarders the file keeps by hand"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/wreck/wreck_level.py", "tools/wreck/export_wreck.py", "bible/02-Systems/Prologue.md"]
siblings_checked: "checked: export_wreck.py writes no masts key; wreck_level.py ZONES say rank 1 where content/prologue/wreck.json says 2"
area: "taking a CI-built asset's layout into content"
date: 2026-11-26
session_context: "#223's audit: run 45741964515's wreck-level artifact (digest checked) held a new mesh and gate tops, but no masts and rank 1 boarders; wispCourse.test.ts would have failed on the mast. Kept both by hand; Prologue.md now says so."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: tools/wreck/export_wreck.py:146 writes masts; tools/wreck/wreck_level.py:29-35 holds the rank 2 boarders"
reference: "796594aa on ccr-6e659de3-v7ph7h"
commands_verified: "python3 key-by-key compare of base, head and artifact wreck.json: run, showed masts missing and ranks lowered"
---

**Issue:** The note said a commit takes the artifact "whole", but the committed file carries hand edits the tools never write.

**Suggested improvement:** Make the wreck tools write the mast and the rank 2 boarders, then take the artifact whole again; until then compare key by key before taking it.

**Principle:** A generated file with hand edits is not generated: diff it against the generator's output before replacing it.
