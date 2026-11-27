---
type: decision
date: 2026-11-26
status: in force
---
# Locked Seas Are Not Sailed or Travelled Into, Their Ports Locked With Them

> "locked seas shouldnt be accessible"

The locked seas are those [[The Held Map's Seas Are Lettered Across Them, Ports Are Anchors and Other Seas Locked]]
darkens: the sea of every island with no name yet, every sea but the Lantern Sea while only Saltmere is named.

Asked how far that goes, the owner chose "No sailing or travel in", the option that read: "The map plots no course and
asks no travel into a locked sea, the room refuses any course or travel there, and a ship can't cross a locked sea's
border (it stops at the edge)."

Told that Sunspire and Rimeholt, the two living ports besides Overlook, lie in locked seas, and asked what happens to
them, the owner chose "Locked with their seas", the option that read: "Unreachable until their island is named;
merchants still sail the lanes, but players can't follow them past the border."

Asked where it goes, the owner chose "In #221, then merge".

## What it settles

- No course or travel is taken into a locked sea, and a ship about to cross into one stops at its edge
  ([[Sailing]], [[Server]]).
- Sunspire and Rimeholt are locked with their seas until their islands are named; the merchants still sail the lanes
  to them ([[World Map]]).
- A locked sea opens when its island is named.

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| Where the names live | `content/world/islands.json`, read by the room (`world::islands`), the server and the page | One list; naming an island opens its sea everywhere at once |
| How the room learns them | The server opens the sea with them (`SeaRequest`'s `islands`); a sea opened without them locks nothing | The server is the authority, and tests of other waters stay as they are |
| A ship kept in a locked sea | Comes back at Overlook's roadstead | It cannot sail out of a sea it may not be in |
| A port in a locked sea | No ship washes up, puts in or is repaired there; the nearest open port instead | "Locked with their seas" |
| Coming ashore on a locked island | Refused from the sea | Its coast lies in its locked sea |
| How the page plans round them | Every cell within 4.8 km of a locked sea is land to the planner; a course whose end lies in one is refused, "That sea is locked." | The page judges routes on a 4.8 km grid of the waters, so it keeps a cell clear of the room's exact edge |
