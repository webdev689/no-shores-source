---
id: 355
title: "A headless picture 11 m before a patrol's dungeon entrance shows no mound, on a build with and without the facade wiring"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Browser QA.md", "tools/claude-toolkit/dungeon-plan.ts"]
siblings_checked: "checked: the open 'Dungeon pictures cannot be taken' observation is the dungeon plan's worker port; this is the outdoor entrance, a different path (no plan pictures a patrol's entrances)"
area: "browser QA / entrances"
date: 2026-11-28
session_context: "Dungeon overhaul (PR #266): picturing the entrance facades. Offline page at=saltgrass-downs, spawn 11 m from the first entrance as __qaGame.foot.held.entrances gives it, facing it (first person and third,8 and third,14,25): no mound or facade in view. The same plan on a build with the facade wiring reverted (fe4ade6f^'s four files) shows the same empty ground. __qaView arrives again and empties the heard entrances until the room tells them again."
parked_until:
resolved:
resolution:
reference: "scratchpad shots facades/entrance0-*.png and old-entrance0-*.png (session-local)"
commands_verified: "webgpu-shot.cjs facade2-plan.json and facade-old-plan.json: both ran, both pictures show no entrance"
---

**Issue:** No QA path pictures a patrol's dungeon entrances. A plan that stands the player 11 m before an entrance, at the coordinates the page holds, shows no mound, with or without this branch's change, so whether the entrance is drawn where the room places it offline is unchecked. Arriving again with __qaView also empties the heard entrances.

**Suggested improvement:** A plan step (or `dungeon-plan.ts` mode) that pictures each of a patrol's entrances from its door's front, using `doorOf` and waiting until the room's word has been heard again; and a check whether `EntranceView` draws on an offline page.

**Principle:** A visual feature needs a picture path that is known to work on the unchanged build before its change is pictured; otherwise an empty picture cannot tell a regression from a broken probe.
