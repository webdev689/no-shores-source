---
id: 277
title: "A headless picture checked only for the change in hand passed over a plain fault in the same frame"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked — a review practice for pictures; Toolkit.md's Browser QA says how to take pictures, not how to read them"
area: "reading headless pictures"
date: "2026-11-25"
session_context: "#207 audit: the tavern's upper room was pictured to show its windows seen through; rain streaks fell across the room in the same picture, and the report called it fine. The owner saw it: an open building's ceiling was drawn but never a collider, so the shelter grid (built from colliders) left its top storey open to the rain. The same streaks, fainter, were in a picture taken before any of the PR's changes."
parked_until: "PR #243 merge"
resolved:
resolution:
reference:
commands_verified: "none to run; the pictures are scratchpad/shots/audit/tavern-west-windows.png and shots/town2/upper-west-block-e.png"
---

**Issue:** A picture taken to verify one change was read for that change alone. Everything else in the frame, here
rain falling inside a room, went unremarked, and the owner had to point it out.

**Suggested improvement:** Toolkit.md's Browser QA: read each picture twice, once for the change and once as a player
would see it, listing anything wrong in it (light, weather, clipping, floating or missing pieces) whether or not the
change caused it, and say which it predates.

**Principle:** Verification evidence is read for everything it shows, not only for the claim it was taken to support;
a fault in the same frame is found now or reported later by someone else.
