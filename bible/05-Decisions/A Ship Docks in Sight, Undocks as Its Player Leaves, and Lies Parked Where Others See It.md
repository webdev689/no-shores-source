---
type: decision
date: 2026-11-26
status: in force
---
# A Ship Docks in Sight, Undocks as Its Player Leaves, and Lies Parked Where Others See It

Asked whether a landing said yes to, the ship still sailing for it when its player leaves the sea, should be kept or
let go, the owner answered:

> "#4: Ship should visibly dock before fading into scene. Leaving somewhere should undock the ship.
>
> - Note: Your ship and over player ships should be viewable parked in the sea when docked anywhere, including
> procedural islands"

Asked where the work goes, the owner chose "Add it to #216". Asked where a docked ship parks, the owner chose "Pier at
ports, anchor elsewhere": at a living port the ship moors beside its pier, at a ruined coast or a sea island it drops
anchor just off the shore where it landed. Asked who sees the parked ships, the owner chose "Ashore and at sea":
players walking that island see the ships parked offshore, and players sailing past see them parked there too. Asked
whether "leaving somewhere should undock the ship" means the ship counts as docked only while its player is at that
place, is seen pulling away from its berth as they go back to it, and that leaving the ship mid-trip forgets the trip,
the owner answered "Yes, that's right".

Asked whether a parked ship should keep the look and plate it had as its player went ashore until they sail again,
or follow a new ship or dress bought while docked, the owner chose "Fix in #216".

## What it settles

- **The ship visibly docks** before the scene fades in.
- **Leaving a place undocks the ship**: going back to it, the player sees it pull away from its berth.
- **Docked anywhere, a player's ship lies parked in the sea**, the sea's procedural islands included, and other
  players' ships too.
- **At a living port a ship moors beside its pier**; at a ruined coast or a sea island it anchors just off the shore
  where it landed.
- **Parked ships are seen ashore and at sea**: by players walking that island, and by players sailing past.
- **A parked ship looks as its player's ship does now**: a ship, dress or name bought while docked shows at once.
- **A ship is docked only while its player is at that place.** Leaving the ship while it sails for a landing said
  yes to forgets the landing.

It replaces, in part, [[The Sea Has Two Views, Docking Asks First, and an Island's Nodes Stand in a Panel]]: what lets
a landing made for go, which now includes leaving the sea.

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| When it docks | At the confirmation's yes, or on coming within reach of a landing made for, from the view over the ship while nothing else holds the player: the ship sails at ×60 into its berth, the view going to the Oversea view as it sets sail; once it lies at rest there, the view flies up over the island to its tiles | The tiles say "Docked at"; the Oversea view keeps the pace set, so the last leg takes under half a minute |
| The berth | At a living port, a place of its pier's (the city's moorings) no player's ship lies in, come to along the pier, the pier's own sloops standing only where no player's ship lies; every place taken, it anchors off the pier clear of the others. At a ruined coast, just off the shore nearest where it was clicked. At a sea island, its anchorage, or abreast of it, 15 m at a time, clear of the ships there | "Pier at ports, anchor elsewhere" |
| That place | The island docked at: any of its nodes, and the dungeons, runs and passage zones gone into from it; its parked ships are drawn on the island's own ground alone, as a dungeon, a run or a passage zone draws no sea | A player walking from node to node is still on their island |
| Which island | The coast nearest the ship of those within 5 km, a continent's or a standing sea island's | A sea island may stand 3 km off a coast or another island, and a ship lies at one place alone |
| Leaving the sea otherwise | A run started from the island's tiles keeps the ship docked where it lies; joining a company member elsewhere leaves it undocked where it lay, seen by no one | Docked only while its player is at that place |
| Off the island | Logged off or gone elsewhere, the ship is docked no more and no one sees it; back on the island, docked and seen again | The owner's "docked only while" |
| Undocking | Back at sea, aboard again or back from the island's tiles, once the room has placed the ship and the helm is the player's with nothing else holding them, it sails at ×60 out from its berth (a port's roadstead side, 600 m off a coast, a sea island's offing), and is the player's to sail once out | Seen pulling away, as asked |
| Parked ships at sea | Seen by players within sight as other players' ships are, at rest, in their looks and plates as their players' characters have them now; hostile ships pay them no heed, and a sea island is rolled clear of them | A ship lying empty is not in play |

How it works: [[Game]], "Ships lying by the island" and "Landings"; [[Sailing]], "Lying parked"; [[Server]], "Parked
ships"; [[Islands]], "On the page".

Not built yet, or limited: going back aboard after the page is reloaded ashore does not sail out from the berth, as
the page no longer knows the ship docked; ships lying by the island are drawn ashore in friendly colours, not their
players' dress ([[Game]], "Limits"); a guest's ship never parks, being its session's alone; a ship is still seen
ashore up to 15 seconds after its player sails it again; parked ships live only in the sea room's memory, so a
deploy, a restart or the host evicting it idle loses them ([[Server]], "Parked ships"). A docking within reach that
finds no way in to its berth leaves the ship at sea, the voyage's line saying why: what it should do then is the
owner's to say ([[Open Questions]], "Docking with no way in").
