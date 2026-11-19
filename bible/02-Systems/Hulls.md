---
type: system
status: planned
code:
  - crates/sailing/src/hull.rs#Hull
  - crates/sailing/src/hull.rs#SLOOP
  - client/src/ships/sails.ts#SailRig
  - tools/ships/build_ship.py#HULLS
  - tools/ships/build_cabin.py#build_cabin
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

Every hull keeps what the Sloop's model holds, at her detail:

- **Chunky, flat-shaded forms**: one hull mesh of broad faceted panels, no smoothing, and about 28,000 faces in all.
- **Five painted parts**: hull, deck, spar, sail and iron. The game's painter lays planks, canvas and iron over them;
  no hull carries a picture of its own.
- **Flat sails with clean corners**, which the game bellies and swings, on plain round spars.
- **Tall bulwarks with gunports**, each gun its own object named `Cannon.Port.N` or `Cannon.Starboard.N`, fore to aft
  ([[Ship Models Live on R2]]).
- **One deck to walk**, with a raised quarterdeck holding the wheel, a hatch and steps down.
- **A companionway into the cabin**, the one every ship shares, entered by interacting at its doors, the Sloop's too
  ([[Every Ship Matches the Sloop's Detail, With a Cabin to Enter]]).
- **Made small and scaled up**, as the Sloop stands three times her model ([[The Sloop Is About 18 m Long]]).

## The hulls

Chosen by Claude, to be built one at a time in this order ([[The Ships as Claude Shapes Them]]). One model serves
every side, dressed in its colours by the game's painter.

| Hull | Length | Rig | Guns a side | Sails as | Needs |
|---|---|---|---|---|---|
| Schooner | About 26 m | Two gaff sails and a staysail | 5 | Elite ships; the player's fast ship | Today's sails |
| Brig | About 32 m | Two masts, square sails | 7 | Miniboss ships; the player's heavy ship | Square sails |
| Frigate | About 40 m | Three masts, square sails, two gun decks | 10 | Boss ships, a sea strike's flagship; the player's last ship | Square sails, a second gun deck |
| The Tithe Ram | About 40 m | The Frigate's, with an iron ram bow | 8 | Captain Brannoc Thule's flagship | The ram |
| Fluyt | About 28 m | Two masts, square sails; a broad belly and a high stern | 2 | Merchantmen, and the Grey Tithe's tribute ships | Square sails |

The Sloop, built and the smallest, sails as Minor and Major ships and is the player's first ship.

## How one is made

1. `tools/ships/build_ship.py` makes the hull from her numbers in `HULLS`, in the Sloop's style: her faceted shell,
   lined gunports and capped rail, her quarterdeck and any forecastle with rails and steps at their edges, her rig
   and sails, her fittings, the Sloop's own cannon at each port, and her companionway, whose doors an empty named
   `Cabin.Entrance` marks as her way into the cabin. `ship_rig.py` rigs a mast either way: a gaff mast with its boom,
   gaff and sail; or a square mast with a top, topmast and topgallant, a yard and sail for each (its lowest yards bare
   where its numbers say), and a gaff spanker abaft it; her headsails are bent to stays to her bowsprit and any
   jibboom. A lower gun deck's ports are framed on her side, dark within, its guns' muzzles out through them; a side's
   guns are numbered from her bow to her stern across both decks.
   `ship_details.py` adds what the Sloop does not carry: wales, gunport lids, channels with deadeyes and chainplates,
   shrouds with ratlines, stays, a bobstay and dolphin striker, mast hoops, a rudder, catheads with anchors, hawse
   holes, a stern lantern, a windlass, a bell, a binnacle, a skylight, boom gallows, a ship's boat, pin rails, stores
   and coils of rope. Each gun is placed by its own muzzle, measured from its mesh: its wheels on her deck and its
   barrel through the middle of a port cut round it. A mast's channel moves forward until its chainplates clear every
   port. No face shares a plane with another facing the same way where either shows: Cycles renders such a spot black.
   No sail is cut by a spar, a rope or a fitting: each stay leaves its mast between the sails above and below it.
2. It is painted and rendered from four sides, on deck and beside the Sloop, for the owner's yes. The Schooner has
   it, and the cabin, the Brig and the Frigate.

The cabin is one room for every ship ([[Every Ship Matches the Sloop's Detail, With a Cabin to Enter]]):
`tools/ships/build_cabin.py` builds it: spacious, about 10 m by 6.4 m with a 3 m ceiling, its middle and forward
floor kept open for players to furnish later; its walls leaning out as a ship's sides do, stairs down from a hatch at
its forward end, shut over them, and six windows across its stern. `cabin_props.py` furnishes it along its walls and
stern: frames, a wainscot, a stern bench, a set table on a rug, a curtained bunk and sea chest, a desk, a bookshelf, a
weapon rack, lanterns, and stores by the stairs. `Cabin.Inside` marks
where a player stands on coming down, and `Cabin.Exit` the foot of the stairs, where they go back up.
3. `paint_ship.py` sorts its faces into the five parts and lays its UVs; `export_ship.py` measures its waterline,
   guns, boxes, sails and deck, its helm where the model's empty named `Helm` stands, and publishes it to R2 with its
   entry in `content/ships/ships.json`. The `ships` workflow does this for every ship built. A
   square sail is measured by its four corners, each named by its side; the game does not set one yet.

## What the code needs

- **Its numbers**: a `Hull` beside `SLOOP`, from its export, with its gain and its sails.
- **Square sails**: the game bellies and swings only gaff sails and staysails. The hull rules already know square
  and lateen sails.
- **A ship's hull, everywhere**: the sailing and fight code, the rooms and the browser hold the Sloop alone, by
  `SLOOP` in about 25 places outside tests; each must carry which hull a ship is.
- **The ram**: a ram bow that strikes harder than a stem.
- **Its drawn size on the [[Overworld]]**.
