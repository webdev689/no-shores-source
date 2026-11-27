---
id: 21
title: "Room tests never take the host's gear change, so a flag left set hides staleness bugs"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Testing.md"]
siblings_checked: "none: the target is the project's testing note, not a skill"
area: "test harness"
date: 2026-11-20
session_context: "Overlook factions round, final audit's fix pass: the fix3-rules worker found room tests leave gear_changed true because none calls take_gear_change, which masked when a dress was made again"
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: crates/room/src/gear_tests.rs:71-76 (`sent()` ticks as the host does, then takes the gear change); also drops_tests.rs:318"
reference: "/root/wt/reports/fix3-rules.md OBSERVATIONS"
commands_verified: "none"
---

**Issue:** crates/room's tests drive a Room through its asks but never play the host's part of taking the gear change
(take_gear_change), so the gear_changed flag stays set for the whole test; behaviour that keys off the gear being sent
(the dress made again, a resend on a day's turn) looks right in a test that would be stale in the room.

**Suggested improvement:** a test helper that ticks the room the way the host does (tick, then take the gear and dress
changes), used by tests of anything sent on change; note it in Testing.md.
