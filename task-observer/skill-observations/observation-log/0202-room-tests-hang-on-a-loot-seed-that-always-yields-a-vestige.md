---
id: 202
title: "Many room tests hang on a fixed loot seed always yielding a Vestige, so a change to the loot tables broke tests that are not about loot"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["crates/room/src", "bible/00-Rules/Tests Check Behaviour.md"]
siblings_checked: "checked — instance-specific to the room crate's loot-seeded tests; the principle holds for any test pinned to one seed of a random table"
area: "tests that depend on a random roll's outcome"
date: 2026-11-24
session_context: "Worker commons (Normal drops as items, never Vestiges), OBSERVATIONS line: many room tests hard-depend on a fixed loot seed always yielding a Vestige; when Normal rolls stopped being Vestiges, tests about dungeon rooms, flotsam, playlists and chests failed, and the worker had to find a new SEALING_SEED (5) that still yields one. It also noted a rewrap script that churned unrelated bible paragraphs, reverted by hand."
parked_until:
resolved:
resolution:
reference: "/root/wt/reports/commons.md (session-local; the finding is in the body)"
commands_verified: none
---

**Issue:** Room tests that check something else (a dungeon room's flow, flotsam, a playlist's clear, a chest) reach their subject through a kill or chest whose dice happen to drop a Vestige. When the loot tables changed, so that Normal rolls drop items instead of Vestiges, those seeds stopped yielding a Vestige and a wide range of unrelated tests failed. The fix was another seed, `SEALING_SEED = 5`, which is just as tied to the current tables.

**Suggested improvement:** Give the room's tests a way to hand a player a Vestige or a drop directly (a test helper, or the Test Ground's grant path) when the Vestige is a precondition rather than the thing under test. Keep seeded rolls for the tests that are about the roll itself.

**Principle:** A test should depend on its precondition by setting it, not by finding a random seed that happens to produce it. Otherwise any change to the random table breaks tests that have nothing to do with it.
