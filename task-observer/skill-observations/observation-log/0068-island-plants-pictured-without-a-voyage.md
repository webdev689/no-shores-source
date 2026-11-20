---
id: 68
title: "A sea island's game-only drawing (Flora's plants) has no picture route: the World Editor draws modules, and the game needs a voyage"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "client/src/editor/isleEditor.ts"]
siblings_checked: "0015 (picture runs that break) and 0014 (two-hour limit) are about runs that stall; this is a layer with no route to stage it at all. 0018 is a staged scene that misleads"
area: "browser QA: picturing islands headless"
date: 2026-11-20
session_context: "Sea islands session: #111 merged with 'Not looked at on screen' because staging a picture at sea headless outran its budget. Checked here by patching isleEditor.ts locally to draw IslesNature with GROWTH_ROLES, building, and shooting ?mode=islands&isleSeed=7&isleClimate=<c> for five climates (about 1.5 min each), then reverting the patch."
parked_until:
resolved:
resolution:
reference:
commands_verified: "ran: webgpu-shot.cjs on the built editor with the local patch, five climates, every run exit 0; read: game.ts draws IslesView(..., GROWTH_ROLES) plus IslesNature, isleEditor.ts draws IslesView without either"
---

**Issue:** The game draws an island's trees, shrubs and grass as Flora's plants (`IslesNature`), but only after a
voyage sights the island; the World Editor's Islands mode, the one fast picture route (`?mode=islands&isleSeed=`),
still draws them as modules. So the plants as the player sees them could not be pictured, and #111 merged unseen.
A five-line local patch to `isleEditor.ts` gave a route in minutes.

**Suggested improvement:** The owner's call whether the Islands mode should draw the game's plants (always, or behind
`?islePlants=game`), so the island as the game shows it has a picture route; Toolkit.md's browser QA then names it.

**Principle:** Every layer the game draws needs a fast, stageable picture route; when only a slow path reaches it, add
the route before the feature merges rather than leaving it "not looked at".
