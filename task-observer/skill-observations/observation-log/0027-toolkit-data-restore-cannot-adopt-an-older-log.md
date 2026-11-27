---
id: 27
title: "toolkit-data.sh cannot adopt a container's log kept from before #96: restore skips it, save refuses it, and both logs use the same ids"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/toolkit-data.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the target is the project's toolkit script, not a skill"
area: "observation log storage"
date: 2026-11-20
session_context: "Overlook factions round: the session began before #96 merged, so its log (0001-0014) was never restored from the branch toolkit-data, which another session had filled with its own 0001-0012 and reviewed in #100; save refused, restore with --skip-old-files mixed the two without the marker; also overlook-source#63 merge session: its 0013 and 0014 met the factions round's 0013 and 0014 at save"
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: tools/claude-toolkit/toolkit-data.sh:47-48 (restore lays the branch's log and always notes its base), :19-35 (save renumbers colliding ids); Toolkit.md:29-36"
reference: "the controller's merge: the branch's files kept, this container's 14 renumbered 0013-0026, the marker written, then save; the pre-merge copy is skill-observations.before-merge"
commands_verified: "bash tools/claude-toolkit/toolkit-data.sh save (saved)"
---

**Issue:** ids are issued per container, so two containers' logs collide on every number; restore into an existing
log copies the branch's files beside the container's without renumbering or writing the marker, and save then refuses.
Forcing the marker would have let the container's older copies overwrite the branch's reviewed ones.

**Suggested improvement:** an "adopt" step in toolkit-data.sh that keeps the branch's files, renumbers the container's
own past the branch's .id-floor (claiming each id) and writes the marker; and new-observation.sh reading the branch's
floor before issuing an id while a log is unrestored.

**Another instance (overlook-source#63's merge session):** this session minted 0013 and 0014 in its own container while
another session's saved log held its own 0013 and 0014. `toolkit-data.sh save` merged both pairs without a word, so
the branch held two files for each id. Found only by listing the log after the save; renumbered by hand to 0028 and
0029 through `new-observation.sh`. A save that refuses, or renumbers, a second file with an id already taken would
have caught it.
