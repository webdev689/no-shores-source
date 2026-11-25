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
  comes fitted with a plain module in each slot that wears none (one bought before it keeps its slot). One who walked
  past that task with no ship is handed it as their character is read; one who pledged to a house before it, which
  leaves the opening off their road, takes it at the Harbourmaster's counter, free (`ship_task_left`); a save from
  before fleets keeps and sails the Sloop.
- **A save is read whole.** A fleet the room cannot read keeps no ship, holding what was kept so it is written back as
  it was, and the character's quests say whether the Sloop is due; a dress laid that the player does not keep, or on a
  part it is not for, is the part's start entry again (`dress_kept`).
- **No ship, no sea.** The land room answers a return to the ship with 103 ("Wait a moment before you try that
  again.") until the accounts have said whose character it holds, and with 109 for a player who keeps none, and the
  page says "You have no ship yet. The Harbourmaster in Overlook's market has one for you." The sea's gate shuts to a
  character who keeps none with the same line, so no page can sail one (`Sea::shut`). The Ship tab says so too. A
  land room whose gate shuts sends a player who keeps no ship to Overlook, not to the sea.
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
  (`Fight::put_to_sea_kept`); each ball of a side is its share of the Sloop's broadside times its class's weight, each
  gun elevated for the range from its own port and deck, so the Frigate's lower deck throws as its upper one; a side
  reloads at its class's pace, times its trim's and its hands'; its helm pulls and swings at its class's way and swing
  (`sail_hurt`); a captain sizing it up reckons its class (`Power::player_in`). Every player's hull answers its helm
  as the Sloop does (the Sloop's gain), and its canvas drives it as the Sloop's, so its class alone sets its way and
  swing apart: held at the same way, it swings its class's share of the Sloop's swing, and from rest it gathers way
  as the Sloop does. Its ram strikes by its hull points as any ship's does (a share of the lesser hull), so a
  Frigate's ram, and a big ship's on it, weighs most. Its deck is its own hull's, walked off the helm and steered
  from.
- **At sea**: a voyage sails at its pace times the canvas it keeps and its class's way; the page eases its ship along
  the same way, and reckons its time to go and where a chase meets its quarry by it (`Passage::way`). A hostile leads
  it and sights it by its class's way, and a voyage is eased by its own closing on a hostile; the hold a hostile keeps
  round itself is reckoned for the fastest hull, so the warning holds whatever is sailed (`threat::hold_reach_m`).
- **A captain's ship keeps its rank's numbers** ([[Naval Combat]], "Ranks and factions"), and the World Editor's fleet
  room, which holds no characters, and the story's fight still sail the Sloop.

## Measured

A plain player of each hull against one bold Grey Tithe captain of each rank, 12 fights a row in the world's hostile
waters, standing off at 300 m or closing to 150 m (`measure_fights_by_hull`, run by hand in release):

| Hull, captain | Stand-off: won / sunk, median length, hull kept | Closing to 150 m: the same |
|---|---|---|
| Sloop, Major | 12 / 0 of 12, 206 s, 100% | 10 / 2 of 12, 257 s, 58% |
| Sloop, Elite | 12 / 0 of 12, 242 s, 96% | 3 / 9 of 12, 209 s, 45% |
| Sloop, Miniboss | 12 / 0 of 12, 261 s, 74% | 0 / 12 of 12, 160 s, none afloat |
| Schooner, Major | 12 / 0 of 12, 204 s, 98% | 10 / 2 of 12, 259 s, 53% |
| Schooner, Elite | 12 / 0 of 12, 215 s, 91% | 3 / 9 of 12, 186 s, 33% |
| Schooner, Miniboss | 12 / 0 of 12, 251 s, 75% | 0 / 12 of 12, 150 s, none afloat |
| Brig, Major | 12 / 0 of 12, 213 s, 97% | 10 / 2 of 12, 258 s, 67% |
| Brig, Elite | 12 / 0 of 12, 233 s, 93% | 10 / 2 of 12, 279 s, 43% |
| Brig, Miniboss | 12 / 0 of 12, 247 s, 80% | 1 / 11 of 12, 189 s, 30% |
| Frigate, Major | 12 / 0 of 12, 237 s, 99% | 12 / 0 of 12, 232 s, 68% |
| Frigate, Elite | 12 / 0 of 12, 234 s, 93% | 10 / 2 of 12, 280 s, 53% |
| Frigate, Miniboss | 12 / 0 of 12, 256 s, 79% | 4 / 8 of 12, 238 s, 32% |

Hull kept is the mean over the fights a ship came out of afloat, so a row with one win reads that one fight. Standing
off, every hull wins every fight. Closing in, the Schooner fights as the Sloop does, its edge its speed; the Brig and
the Frigate take ten Elites in twelve to the Sloop's three; the Frigate keeps the most of its hull against Majors and
Elites and takes the most Minibosses. Twelve fights a row leave a row's wins within two or so of chance. The measure's
plain player lays for the water's range, never a look on a ship.

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
  is free, each after 250 Aurem, held for. Read as "the Grey Gull". The ask says which it is (`count` 1 a renaming):
  a free name asked of a ship named already is refused, and so is the name it bears, so an ask sent twice never pays.
  Refusals the page says in words: no such ship (167), none kept (168), no such dress (169) or word (170), the ship
  sailed already (171), the name it bears (172), and a named ship asked a free name (173).
- **Shipwright**: the Shipwright's six modules of the day ([[Ship Power]]).

## Seen by others

The sea's snapshot carries each player's ship's hull, its four dresses, its name's two words and its player's emblem
(`ShipLook`); every page draws each ship in them, its own by the room's word, and the plate over another player's ship
stands over its own hull's masthead with the ship's name under the player's. The shader lays the paint and the stripe
on the hull's shell, the canvas on every sail (its second colour on every other cloth of the painter's picture), and
flies the flag's own picture: one a side, one a flag dress, and one an emblem (`flagPictures.ts`).
Dresses and the name's words cross the wire by their place in their lists, so both files are numbered content
(`tools/numbered.json`): a page built from another order of either loads again, once ([[Server]]).

## Limits

- A broadside fires square ([[Ship Guns Keep Square Broadsides]]), so a battery longer than its target lands less of
  its weight on it as the range opens. Abeam of an Elite's Schooner, at 60 m every hull lands 96 to 98% of its weight
  against what the Sloop lands; at 150 m the Schooner 93%, the Brig 85%, the Frigate 79%.
- A captain sizing up a player's ship reckons its class's weight and reload, not its swing or how much of a long
  battery's weight lands, so a wary one rates a Frigate a little above what it throws.
- A player joined to a companion in a place entered only from the sea (a sea island, a run begun at sea) is not asked
  for a ship. Leaving, one who keeps none is turned away by the sea, and the page sails on alone, kept by no room,
  until they come ashore. Whether a shipless player may join a companion there is the owner's to choose.
- A page the accounts leave unkept at sea sails the Sloop as built whatever it keeps, as it is kept by no one.
- Playing offline the page holds no gear, so it sails the Sloop as built.
- A figurehead waits on a model of one; the owner's ask was the models built.
