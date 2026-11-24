---
type: system
status: live
code:
  - crates/naval/src/class.rs#Class
  - crates/naval/src/class.rs#CLASSES
  - crates/naval/src/fight_helm.rs#sail_hurt
  - crates/gear/src/ship/fleet.rs#Fleet
  - crates/gear/src/ship/fleet.rs#KeptShip
  - crates/gear/src/ship/fleet.rs#Dress
  - crates/gear/src/ship/fleet.rs#give_first_ship
  - crates/gear/src/ship/shipyard.rs#ShipAsk
  - crates/gear/src/gate.rs#NO_SHIP
  - crates/room/src/sea_ports.rs#hull_sailed
  - crates/room/src/sea_plates.rs#ShipLook
  - crates/room-wasm/src/deck_door.rs#hull_builds_json
  - client/src/game/harbour/harbourPage.ts#harbourPage
  - client/src/game/harbour/harbourModel.ts#hullOffers
  - client/src/ships/fleetDress.ts#paintedOf
  - client/src/ships/flagDevices.ts#shapeInks
---
# Shipyard

The ships a player keeps, each with its own standard numbers, and how they are had, sailed, dressed and named at the
Harbourmaster's counter in a social space ([[The Harbourmaster Keeps Every Ship, Each With Its Own Numbers and Dress]],
every call of Claude's in [[The Ships at the Harbourmaster as Claude Shapes Them]]). The hulls themselves are
[[Hulls]]; a ship's level, modules and officers are [[Ship Power]] and [[Crew]], and go with whichever hull is sailed.

## The fleet

- **A character keeps a fleet** (`gear::ship::fleet`): the hulls it owns, each once, by sailing's number (0 the Sloop to
  3 the Frigate), the one it sails, and the dresses it has bought. Each ship kept has its own name and its own dress.
- **A new player keeps none.** The welcome's Harbourmaster hands over the Sloop: the opening's task "Take your ship
  from the Harbourmaster" comes after the round of the counters, its reward `"ship": true` ([[Quests]]). The Sloop
  comes fitted with its four plain modules. One who walked past that task with no ship is handed it as their character
  is read; a save from before fleets keeps and sails the Sloop, as every player sailed it then.
- **No ship, no sea.** The land room answers a return to the ship with 108 for a player who keeps none, and the page
  says "You have no ship yet. The Harbourmaster in Overlook's market has one for you." The sea's gate shuts to a
  character who keeps none with the same line, so no page can sail one (`Sea::shut`). The Ship tab says so too.
- **What a ship keeps** whichever hull it is: its hurts as shares of whole, where it lies at sea, its experience and
  level, its fitted and carried modules, its officers and hands, and its materials.

## Each hull's numbers

A player's hull sails by its class (`naval::class`): how much longer than the Sloop it lasts under the same fire, its
broadside's weight and reload against the Sloop's, its way and its swing, and the hands who board with its player. A
bigger hull is struck more often (`ranks::exposure`), so its hull points, canvas and hands are the Sloop's times its
exposure and how long it lasts. As the rules build them (`hull_builds_json`, which the page reads):

| Hull | Hull | Canvas | Hands | Guns a side | Broadside | Reload | Speed | Turning | Boarders |
|---|---|---|---|---|---|---|---|---|---|
| Sloop | 240 | 96 | 10 | 3 | ×1 | 5.6 s | ×1 | ×1 | 2 |
| Schooner | 300 | 125 | 13 | 5 | ×1 | 4.9 s | ×1.15 | ×1.1 | 2 |
| Brig | 473 | 190 | 20 | 7 | ×1.25 | 6.4 s | ×0.95 | ×0.85 | 3 |
| Frigate | 579 | 235 | 24 | 10 | ×1.5 | 7.0 s | ×0.9 | ×0.72 | 4 |

- **In a fight**: the fight puts the player's ship to sea in its own hull with its class's hull, canvas and men
  (`Fight::put_to_sea_kept`); each ball of a side is its share of the Sloop's broadside times its class's weight; a side
  reloads at its class's pace, times its trim's and its hands'; its helm pulls and swings at its class's way and swing
  (`sail_hurt`); a captain sizing it up reckons its class (`Power::player_in`). Every hull's raw way and swing are the
  Sloop's, so the class alone sets them apart. Its deck is its own hull's, walked off the helm and steered from.
- **At sea**: a voyage sails at its pace times the canvas it keeps and its class's way, and the page eases its ship
  along the same way.
- **A captain's ship keeps its rank's numbers** ([[Naval Combat]], "Ranks and factions"), and the World Editor's fleet
  room, which holds no characters, and the story's fight still sail the Sloop.

## The Harbourmaster's counter

Four parts, chosen as the inventory's shelves are (`harbour/harbourPage.ts`): every ask is the Harbourmaster's alone,
answered only within reach of that counter (`ShipAsk`).

- **Shipyard**: every hull in a panel of its own, its numbers each a bar against the most any hull has, its price, and a
  press. The prices are the shipyard's (`content/gear/shipyard.json`):

  | Hull | Sold from ship level | Aurem | Timber | Canvas | Iron | Heartwood |
  |---|---|---|---|---|---|---|
  | Sloop | given in the welcome | | | | | |
  | Schooner | 7 | 5,000 | 60 | 50 | 30 | |
  | Brig | 13 | 11,000 | 120 | 80 | 90 | 2 |
  | Frigate | 20 | 20,000 | 180 | 140 | 150 | 5 |

  A hull is held to buy, paid whole or refused whole, and sailed from then on; the ship sailed before stays at the
  harbour. One kept is clicked to sail it again. Nothing is sold back.
- **Paint**: a dress is bought once and kept for every ship (`content/gear/ship_dress.json`), then clicked to lay it on
  the ship chosen. Four parts: the hull's paint, the stripe along its gunports, its canvas (a colour, or two on alternate
  cloths) and its flag (a ground with a device in its ink, or the emblem its player wears). Each part has a start
  entry, the ship as built. Prices follow the Tailor's dyes: Magic 1,000 Aurem, Rare 2,500, Legendary 5,000, each from a
  ship level; each house's canvas and colours are kept at its second rank, never sold.
- **Name**: a ship is named from two lists of words, its first word none or one of the first list's; the first name
  is free, each after 250 Aurem. Read as "the Grey Gull".
- **Shipwright**: the Shipwright's six modules of the day ([[Ship Power]]).

## Seen by others

The sea's snapshot carries each player's ship's hull, its four dresses, its name's two words and its player's emblem
(`ShipLook`); every page draws each ship in them, its own by the room's word, and the plate over another player's ship
stands over its own hull's masthead with the ship's name under the player's. The shader lays the paint and the stripe
on the hull's shell, the canvas on every sail (its second colour on every other cloth of the painter's picture), and
flies the flag's own picture: one a side, one a flag dress, and one an emblem (`flagPictures.ts`).

## Limits

- Playing offline the page holds no gear, so it sails the Sloop as built, as before.
- A figurehead waits on a model of one; the owner's ask was the models built.
