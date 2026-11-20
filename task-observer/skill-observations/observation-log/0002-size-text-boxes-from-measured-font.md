---
id: 2
title: "A size meant to fit a text was set and documented from a guessed glyph width before measuring"
status: open
type: open-source
skill: [impeccable]
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none — impeccable belongs to no family in this workspace (no skill-families.md); the Toolkit row is a project note"
area: "Browser QA / UI sizing: measuring text in the shipped face before fixing a box's width"
date: 2026-11-20
session_context: "Sizing foe plates by rank in Overlook's fight HUD"
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: node measure.cjs <built page> — '? Crossbowman' needs 93 px of name room; a 120 px plate gave 74 px (cut), 140 px gave 93 (fits)"
---

**Issue:** a Minor plate's width (120 px) was written into a constant, its doc comment ("room for '? Crossbowman' and
no more"), a test and the system note from an estimate of about 7 px a letter. Measured in the built page's own face
(Pixelify, 12 px), the name is 93 px and the plate left it 74 px: it would have been cut with an ellipsis. The
measurement ran before commit, so nothing shipped, but the claim was written three times before it was checked.

**Suggested improvement:** in the Toolkit's Browser QA row: before fixing a box's width to fit a text, lay the real
element on the built page (its sheets and face loaded) and compare `scrollWidth` with `clientWidth` for the longest
text it holds; write the width only from that.

**Principle:** a size whose purpose is to fit a text is a measurement, not an estimate: measure in the shipped font
first, then write the number and any claim about it.
