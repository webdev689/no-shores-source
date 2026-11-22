---
id: 137
title: "A new screen was judged on legibility alone, not against the owner's reference picture; the owner called it really bad"
status: open
type: open-source
skill: [impeccable]
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: impeccable is the only UI review skill in the kit; the worker brief template is the other carrier"
area: "reviewing a new interface screen before calling it done"
date: 2026-11-22
session_context: "Overlook Playlist session: the owner gave a Destiny 2 Vanguard-screen picture (playlist nodes on a map, one tooltip card) as the reference. The worker built four tiles of words side by side, pictured it headless four times and judged each version on fit and legibility; the controller looked at v4 and called it readable. The owner: 'The playlist UI is really bad'. Rebuilt as crests on a chart with one card, compared side by side with the reference."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: node tools/uiShot.mjs <shots.json> -> v4 tiles and v7 chart pictures in the controller's and worker's scratchpads"
---

**Issue:** A brief and a review checked the screen against rules (fits, wraps, no overflow) and never against the
owner's reference picture, though the request came with one. Both the worker and the controller passed a layout whose
form (a board of text) had nothing of the reference's form (nodes on a map, one detail card).

**Suggested improvement:** When a UI request carries a reference picture, the brief names it as the target, and the
review step puts the latest picture beside the reference and lists, before any polish, which of the reference's
structural elements (layout form, focal objects, how detail is revealed) the build has and lacks.

**Principle:** A reference picture is the acceptance test for a screen's form; legibility checks only judge a form
already chosen.
