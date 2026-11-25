---
id: 249
title: "A public event is pictured headless only inside its 8 minutes on the wall clock, and on the sheet only where its ground lies"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "Toolkit.md's Browser QA says nothing of public events; Public Events.md gives the schedule (every 15 minutes, zones 5 apart, 8 to win) but not what it means for a headless picture"
area: "picturing public events headless"
date: "2026-11-25"
session_context: "#207's public event panel and map ring. The page's own room is told each wall minute as it turns (client/src/network/localRoom.ts), and its events run on that clock: Saltgrass's slots start at Unix minutes divisible by 15 (crates/room/src/public/mod.rs schedule()), a raid and a Fissure in turn, 8 minutes each. A run opened at 14:58 fell in the 15:00 Fissure's slot, whose ground was not on the 400 m sheet round the hamlet (where it lies unchecked); a run opened at 15:15 with a 480 s wait took its pictures after the raid's 8 minutes had run out. Both showed no event, which first looked like a fault in the map."
parked_until:
resolved:
resolution:
reference:
commands_verified: "node tools/claude-toolkit/webgpu-shot.cjs <plan> opened at 14:58 (the Fissure's slot, nothing on the sheet) and 15:15 with a 480 s wait (raid over)"
---

A headless picture of a public event must open the page just before the zone's raid slot (Saltgrass :15 and :45 in
turn with the Fissure at :00 and :30 on this day's parity; Gullwing Vale 5 minutes later; Driftwood Moors 10) and take
its pictures within 8 minutes, the world's build (about 4 minutes) included. Proposal: Toolkit.md's Browser QA says
so, or the driver takes a `minute` override the local room is opened at (localRoom's minuteShift exists).
