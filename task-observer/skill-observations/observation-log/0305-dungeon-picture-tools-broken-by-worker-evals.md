---
id: 305
title: "Dungeon pictures cannot be taken: dungeon-plan.ts drives the page, but eval steps now run in the game's worker"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/dungeon-plan.ts", "tools/claude-toolkit/dungeon-qa-build.sh"]
siblings_checked: "checked: Toolkit.md Browser QA says evals run in the worker; dungeon-plan.ts still touches Document and dispatches MouseEvents"
area: "dungeon pictures"
date: 2026-11-26
session_context: "Worker lights-core could not picture a dungeon with many torches before/after; it also found dungeon-qa-build.sh's room-wasm join anchor moved (fixed) and its QA_NOFOES garrison anchor in dungeon_room.rs moved (not fixed)."
parked_until:
resolved:
resolution:
reference:
commands_verified: "reported by worker lights-core, not rerun by the lead"
---

**Issue:** The dungeon picture plan's init touches Document and its look steps dispatch MouseEvents; both run in the game's worker now, where neither exists, so no dungeon can be pictured. The QA build's text anchors drift as the room code changes.

**Suggested improvement:** Port dungeon-plan.ts's init and look steps to the worker hooks (__qaLook, __qaEye); make dungeon-qa-build.sh fail loudly when an anchor is not found, and fix the QA_NOFOES anchor.

**Principle:** A picture tool that silently breaks when the page moves into a worker leaves visual work unchecked; tools that patch source by anchor must fail when the anchor is gone.
