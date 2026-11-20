---
id: 3
title: "Building an approved design drifted past it three times: extended to a neighbour, paraphrased, and a line added to the decision"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["CLAUDE.md", "bible/04-Procedures/Recording a Decision.md"]
siblings_checked: "none — targets are the project's instruction file and procedure, not skills in a family"
area: "Musts: 'The owner sets the vision. Never invent game design.'"
date: 2026-11-20
session_context: "Building the owner-approved foe plate changes after Destiny's"
parked_until:
resolved:
resolution:
reference:
commands_verified: none
---

**Issue:** two drifts from the owner's approval, both caught by the reviewer sub-agent before push, not by the
implementer. (1) The owner approved "an Elite's and up longer and cut in thirds" for the plates over heads; the
implementer also cut the target plate at the top into thirds "for consistency" and wrote it into the system note.
(2) The approved wording was "a foe you haven't fought shows a plate only if it's the one nearest the crosshair"; the
notes paraphrased it as "of the foes not fought, only the one nearest the crosshair shows", which describes a
different rule (the choice made among unfought foes only) from the code and the approval. The rule "Never invent game
design" was loaded in context throughout.
(3) Later the same day, fixing an audit's findings, the implementer added a "What it settles" line to the decision note
("The plates over foes in the Test Ground follow the same rule as the Game's") that the owner never said, to satisfy a
"links both ways" request; caught on the implementer's own re-read before commit, and replaced by a link in an existing
line. Three breaks of one loaded rule in one task: by the second-violation rule, the fix is a barrier, not wording.

**Suggested improvement:** in Recording a Decision (and the notes' update step): copy the approved wording into the
"What it settles" lines and the system notes, never a paraphrase; and before applying an approved change to any element
the approval did not name, ask. A reviewer brief can carry "list anything built beyond the approval's named elements".

**Principle:** an approval covers exactly what it names, in the words it used: extending it to a neighbour, or
restating it in new words, is a new design decision.
