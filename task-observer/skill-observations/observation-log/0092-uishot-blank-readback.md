---
id: 92
title: "tools/uiShot.mjs writes a blank picture although the interface lays its quads"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["client/src/ui/shot.ts", "tools/uiShot.mjs"]
siblings_checked: "the game's own frame, read back from its worker, shows the drawn interface whole"
area: "headless pictures of the drawn interface"
date: 2026-11-21
session_context: "Picturing the healing charges after the merge of main; the gallery's punctuationShot came out blank too."
parked_until:
resolved:
resolution:
reference: "target/grab.mjs in the session (reads the worker's own texture back)"
commands_verified: "node tools/uiShot.mjs target/punct.json: 97 quads a frame, PNG all ground (51,64,77); the live game read back from its worker shows the HUD"
---

**Issue:** `shot.ts` draws (the renderer holds 97 quads a frame), but the PNG it reads back is only the ground,
under SwiftShader, for every shot including the gallery's. The game itself draws its interface.

**Suggested improvement:** Find why `present` into the shot's own texture does not land before the copy (its pass's
load op, the target view, or the order of the clear and the draw), and add a test that a shot has more than one colour.

**Principle:** A picture tool needs its own check that it pictures something.
