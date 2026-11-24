---
type: decision
date: 2026-11-24
status: in force
---
# Waypoints as Claude Builds Them

How the owner's [[Every Objective Has a Waypoint on the Compass, on Land and at Sea]] is built. Each call is Claude's.

| Call | Chosen | Why |
|---|---|---|
| Where it is found | The page finds the waypoint (`client/src/game/quests/waypoint.ts`) from the room's word on the quest and what it already holds: the zones and their landings, a patrol's gates and where each leads, a social space's keepers, the foes in sight, a patrol's materials, the isles and hostile ships in sight at sea; the room's own `quest_at` wins where it gives one | The rules judge every goal; a waypoint only points. The page held every place a leg needs, where the sea room knew no zone or landing and a zone no gate's way |
| Which goal | The task's first unmet goal with somewhere to point; a goal done in the zone the player stands in holds it even before it points (a boss not yet in sight) | The tracker lists the goals in the order the task asks them |
| A zone's landing | Its first spawn, where a landing from the sea stands | Every world point is in one frame, metres east and south, so a landing across the water is pointed at as one ashore |
| From another land | At that landing, the step saying "Hold M to return to your ship" | Leaving is the held leave from anywhere, not a walk to a harbour (the owner's second answer) |
| Through a gate | In the patrol whose gate leads to a dungeon's or a boss's zone, at the gate; from anywhere else, at that patrol's landing | Those zones are reached only through their patrol's gate |
| The nearest place | A talk, a pledge or a buy at the nearest social space with its keeper; gathering at the nearest patrol with materials; a goal done at sea at the nearest in sight of its kind, "None in sight: sail the open sea" while none is | The owner's "Nearest place to do it"; isles and hostile ships are rolled near each ship, so only those in sight are known |
| Its distance | Under the diamond on the compass, in brass, as the screen's mark says it (`distanceText`: metres to 1 km, then km) | The owner's "Yes, under the mark" |
| The tracker at sea | The quest walked, while no sea fight's task takes it | A waypoint at sea with no step to say what it is for would leave a player as lost |
