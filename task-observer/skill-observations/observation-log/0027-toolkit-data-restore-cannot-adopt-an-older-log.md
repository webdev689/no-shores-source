---
id: 27
title: "toolkit-data.sh cannot adopt a container's log kept from before #96: restore skips it, save refuses it, and both logs use the same ids"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/toolkit-data.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the target is the project's toolkit script, not a skill"
area: "observation log storage"
date: 2026-11-20
session_context: "Overlook factions round: the session began before #96 merged, so its log (0001-0014) was never restored from the branch toolkit-data, which another session had filled with its own 0001-0012 and reviewed in #100; save refused, restore with --skip-old-files mixed the two without the marker"
parked_until:
resolved:
resolution:
reference: "the controller's merge: the branch's files kept, this container's 14 renumbered 0013-0026, the marker written, then save; the pre-merge copy is skill-observations.before-merge"
commands_verified: "bash tools/claude-toolkit/toolkit-data.sh save (saved)"
---

**Issue:** ids are issued per container, so two containers' logs collide on every number; restore into an existing
log copies the branch's files beside the container's without renumbering or writing the marker, and save then refuses.
Forcing the marker would have let the container's older copies overwrite the branch's reviewed ones.

**Suggested improvement:** an "adopt" step in toolkit-data.sh that keeps the branch's files, renumbers the container's
own past the branch's .id-floor (claiming each id) and writes the marker; and new-observation.sh reading the branch's
floor before issuing an id while a log is unrestored.
