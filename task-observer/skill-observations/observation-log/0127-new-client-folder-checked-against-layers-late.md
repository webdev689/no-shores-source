---
id: 127
title: "A new top-level client folder was built before checking the declared layers, and had to be moved"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the target is a project note, not a skill"
area: "adding a module folder in a layered codebase"
date: 2026-11-22
session_context: "Overlook: nameplates, the player interact menu and DFO's chat. Eleven files went into client/src/social/, which game and combat imported and which imported them back; cargo xtask repo refused the undeclared layer and the cycle, and the files moved to game/social/ and combat/."
parked_until:
resolved:
resolution:
reference:
commands_verified: "cargo xtask repo (run: 22 problems, then none after the move)"
---

**Issue:** A feature's code went into a new top-level folder under the client before the repository's declared
layers (which folder may import which) were read. The folder both imported and was imported by existing layers, so
the layer check refused it only at the end, after tests and screenshots were written against the old paths.

**Suggested improvement:** In the project's code notes, say: before making a new top-level client folder, read the
layers list and place new code inside the layer that already imports what it needs.

**Principle:** In a codebase with enforced dependency layers, decide a new module's layer before writing it: run the
layer check on the first file, not the last.
