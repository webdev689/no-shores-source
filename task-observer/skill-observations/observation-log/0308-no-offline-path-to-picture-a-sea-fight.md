---
id: 308
title: "No offline way to picture or probe a sea fight: __qaSea never reaches sea mode on SwiftShader, and the Overlook's sea is home water"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: Toolkit.md Browser QA names __qaSea and the story's beats; no fight entry point offline"
area: "sea pictures and performance"
date: 2026-11-26
session_context: "Worker lights-sea could not picture a ship's lantern or measure a broadside's frame cost: __qaSea did not reach the sea in 200 s, no hostile meets the player on home water, and every perf run of the story's battle beat died ('Target page closed'). It pictured only the story's fight with its hour patched in a scratch copy."
parked_until:
resolved:
resolution:
reference:
commands_verified: "reported by worker lights-sea, not rerun by the lead"
---

**Issue:** sea visuals (ship lanterns, a broadside at night) cannot be pictured or measured offline, so they ship checked by shader validation and code review only.

**Suggested improvement:** a development hook that starts a sea fight offline at a set hour (like __qaSea plus a hostile), and a fix for the probe dying on the battle beat.

**Principle:** every visual system needs a reachable offline scene, or its changes ship unseen.
