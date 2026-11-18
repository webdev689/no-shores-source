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

The ships Overlook will sail beyond the Sloop, one for each rank of ship
([[Enemies Come in Five Ranks, After Destiny]]), made in Blender in her style
([[New Ships Are Planned in the Sloop's Style, After the System]]). Only the Sloop is built ([[Sailing]]): until the others are, both factions' captains sail her at every rank
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

## The hulls proposed

The owner's to pick; nothing below is decided.

| Rank | Hull | Length | Rig | Guns | Needs |
|---|---|---|---|---|---|
| Minor | Longboat | About 10 m | One gaff sail, and oars | Swivels only | Swivel mounts |
| Major | The Sloop | 18.7 m | Gaff and staysail | 3 a side | Built |
| Elite | A two-masted schooner | About 26 m | Two gaff sails and a staysail | 5 a side | Today's sails |
| Miniboss | A three-master | About 36 m | Square sails | 8 a side, two decks | Square sails |
| Boss | Brannoc Thule's ram ship | About 40 m | Square sails | 8 a side | Square sails, an iron ram bow |

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
  `SLOOP` in about 140 places; each must carry which hull a ship is.
- **The ram**: a ram bow that strikes harder than a stem.
- **Its drawn size on the [[Overworld]]**.
