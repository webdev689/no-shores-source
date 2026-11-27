---
id: 133
title: "A decision table's reason cited what DFO did before the DFO source was checked"
status: declined
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.md"]
siblings_checked: "none: the target is the project's instruction file, not a skill"
area: "writing reasons that cite a source port's behaviour"
date: 2026-11-22
session_context: "Overlook: second pass on nameplates and chat. A 'Why' cell in Claude's calls said DFO's mute hid a player's lines; a grep of the DFO source then showed /mute was a moderator's tool, and the cell was rewritten before commit."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, dropped: covered by CLAUDE.md:18-20 \"Verify before claiming\"; the rule held, caught before commit"
reference:
commands_verified: "grep -rn mute dfo-online-source/src/net/chatCommands.js src/net/safety/safetyLaw.js"
---

**Issue:** CLAUDE.md says to verify before claiming. A reason written into a decision note named the source
project's behaviour from memory; the check came only after it was written. The protection in play was written down
and loaded, with no checkpoint, so it held only because a later re-read caught it.

**Suggested improvement:** When a note's reason cites the source port ("DFO's ..."), grep the source for it in the
same step the cell is written, and name the file in the pick note's paths.

**Principle:** A reason that cites another codebase is a claim about that codebase: check it at the moment of writing,
not at review.
