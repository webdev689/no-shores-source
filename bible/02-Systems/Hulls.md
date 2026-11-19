---
type: system
status: planned
code:
  - crates/sailing/src/hull.rs#Hull
  - crates/sailing/src/hull.rs#SLOOP
  - client/src/ships/sails.ts#SailRig
  - tools/ships/paint_ship.py#main
  - tools/ships/export_ship.py#main
---
# Hulls

The ships Overlook sails beyond the Sloop, chosen in her style for each rank of ship, the player's own hulls and the
merchantmen ([[Enemies Come in Five Ranks, After Destiny]], [[The Ships as Claude Shapes Them]],
[[The Sea Is a Patrol Zone, and the Ship Is Gear]]).
Only the Sloop is built ([[Sailing]]): until the others are, both factions' captains sail her at every rank
([[Naval Combat]], "Ranks and factions").

## The Sloop's style

Every hull keeps what the Sloop's model holds:

- **Chunky, flat-shaded forms**: one hull mesh of broad faceted panels, no smoothing, and about 28,000 faces in all.
- **Five painted parts**: hull, deck, spar, sail and iron. The game's painter lays planks, canvas and iron over them;
  no hull carries a picture of its own.
- **Flat sails with clean corners**, which the game bellies and swings, on plain round spars.
- **Tall bulwarks with gunports**, each gun its own object named `Cannon.Port.N` or `Cannon.Starboard.N`, fore to aft
  ([[Ship Models Live on R2]]).
- **One deck to walk**, with a raised quarterdeck holding the wheel, a hatch and steps down.
- **Made small and scaled up**, as the Sloop stands three times her model ([[The Sloop Is About 18 m Long]]).

## The hulls

Chosen by Claude, to be built one at a time in this order ([[The Ships as Claude Shapes Them]]). One model serves
every side, dressed in its colours by the game's painter.

| Hull | Length | Rig | Guns a side | Sails as | Needs |
|---|---|---|---|---|---|
| Schooner | About 26 m | Two gaff sails and a staysail | 5 | Elite ships; the player's fast ship | Today's sails |
| Longboat | About 10 m | One gaff sail, and oars | Swivels only | Minor ships, and a big ship's boats | Swivel mounts, oars |
| Brig | About 32 m | Two masts, square sails | 7 | Miniboss ships; the player's heavy ship | Square sails |
| Frigate | About 40 m | Three masts, square sails, two gun decks | 10 | Boss ships, a sea strike's flagship; the player's last ship | Square sails, a second gun deck |
| The Tithe Ram | About 40 m | The Frigate's, with an iron ram bow | 8 | Captain Brannoc Thule's flagship | The ram |
| Fluyt | About 28 m | Two masts, square sails; a broad belly and a high stern | 2 | Merchantmen, and the Grey Tithe's tribute ships | Square sails |

The Sloop, built, sails as Major ships and is the player's first ship.

## How one is made

1. A build script in `tools/ships/` makes the hull from its numbers (length, beam, decks, masts and guns) in the
   Sloop's style.
2. It is rendered from four sides for the owner's yes.
3. `paint_ship.py` sorts its faces into the five parts and lays its UVs; `export_ship.py` measures its waterline,
   guns, boxes, sails and deck, and publishes it to R2 with its entry in `content/ships/ships.json`.

## What the code needs

- **Its numbers**: a `Hull` beside `SLOOP`, from its export, with its gain and its sails.
- **Square sails**: the game bellies and swings only gaff sails and staysails. The hull rules already know square
  and lateen sails.
- **A ship's hull, everywhere**: the sailing and fight code, the rooms and the browser hold the Sloop alone, by
  `SLOOP` in about 25 places outside tests; each must carry which hull a ship is.
- **The ram**: a ram bow that strikes harder than a stem.
- **Its drawn size on the [[Overworld]]**.
