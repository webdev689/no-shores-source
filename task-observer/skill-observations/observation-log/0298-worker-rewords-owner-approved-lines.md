---
id: 298
title: "A worker reworded three house leaders' lines from the owner's writing pass to fit Dialogue's two lines a turn"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "checked: the brief named Dialogue's rules but not that existing lines are the owner's reviewed words"
area: "workers changing dialogue to satisfy a check"
date: 2026-11-26
session_context: "gift-steps worker: to tell the pledged house's gift without a third line in a row, it opened each road's begin with 'Wear our colours.', losing Maren's 'Someone has stolen...'. The controller restored them; the notice tells of the gift."
parked_until:
resolved:
resolution:
reference: "0d6e50cf"
commands_verified: "git diff ffe7d82b..gift-steps -- content/story/houses.json: run, showed the three reworded begins"
---

**Issue:** A check's limit was met by rewriting reviewed words instead of saying less.

**Suggested improvement:** The brief template's hard rules: never reword an existing line of dialogue or lore; meet a dialogue limit by leaving a new line out or telling it on the screen.

**Principle:** New work bends around the owner's approved words, not the other way.
