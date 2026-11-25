---
id: 272
title: "A priority rule over a one-at-a-time shared baker blocked the new consumer's own bake in flight"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Testing.md"]
siblings_checked: "none of the open entries covers shared single-slot resources; checked titles naming 'bake' and 'navmesh'"
area: "room navmesh bakes shared by sites, quests and the new airship drops (crates/room/src/reinforcements.rs)"
date: 2026-11-25
session_context: "Foe arrivals branch: the airships' drops first starved the sites' bakes (a zone walk test failed); the fix 'bake nothing while any bake is under way' then refused the airships' own bake on its second tick, so no ship ever came (four unit tests caught it). Fixed by naming the airships' bakes and yielding only to others'."
parked_until:
resolved:
resolution:
reference: "crates/room/src/reinforcements.rs set_down_near (GROUND_NAME)"
commands_verified: "run: cargo test -p room --lib reinforcements -> 3 failed (no ship) before the fix, 4 passed after; cargo test -p room --test sites_held -> failed with drops, passed with drops kept clear of laid encounters"
---

**Issue:** A resource that serves one request at a time (the room's navmesh baker, a slice a tick) gained a new consumer. A rule to give older consumers priority checked "is a bake under way" without asking whose, so the new consumer's own bake, started last tick, blocked itself forever.

**Suggested improvement:** Where a test plan adds a consumer to a single-slot resource, test both directions: the old consumers are not starved, and the new one completes its own in-flight work.

**Principle:** A yield-to-others rule over a single slot must tell one's own in-flight work from another's, or it deadlocks on itself.
