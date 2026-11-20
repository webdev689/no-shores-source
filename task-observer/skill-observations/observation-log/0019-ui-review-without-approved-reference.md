---
id: 19
title: "The controller passed new HUD pictures against the port source's code, never against the game's own approved look"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "0018 (staged pictures mislead) is about what a picture stages; this is what it is judged against. 0015 is picture runs that break"
area: "browser QA: judging UI pictures before a merge"
date: 2026-11-20
session_context: "Sea fight readout (dfo-mount, plus rounds) merged into #75; the owner, shown plus-shots/v2_fight_aiming.png: 'The readout at the top and the bottom right are not enhanced plus design'."
parked_until:
resolved:
resolution:
reference:
commands_verified: "read: deck-shots/v8_fight_first.png (the on-foot vitals window with brass fittings and labelled bars; the light target plate) beside plus-shots/v2_fight_aiming.png (plain plus-panel boxes); seaFight.ts gives the plate and card 'plus-panel' and its own thin bars"
---

**Issue:** The workers' briefs and the controller's review judged the sea readout against DFO's naval code (what it
shows, where it stands) and passed it. Neither compared it with the game's own owner-approved surfaces of the same
kind: the vitals window and the target plate on foot. The plate and the card were built fresh as plain panels with
thin bars, so the sea read as a different HUD, and the owner caught it.

**Suggested improvement:** A UI brief names the approved twin of each new surface (an existing component the owner
has seen and kept) and asks the worker to build from it and to put each picture beside the twin's. The controller's
review of a UI picture opens the twin's picture first. Toolkit.md's browser QA gets the rule.

**Principle:** A new surface is judged against the project's approved surfaces of its kind, not only against the
source it was ported from; reuse the approved component rather than building a look-alike.
