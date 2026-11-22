---
type: system
status: live
code:
  - crates/sailing/src/hull.rs#Hull
  - crates/sailing/src/hull.rs#SLOOP
  - crates/sailing/src/hull.rs#HullKind
  - crates/naval/src/arms.rs#arms_of
  - crates/naval/src/ranks.rs#Rank
  - client/src/ships/sails.ts#SailRig
  - tools/ships/build_ship.py#HULLS
  - tools/ships/build_cabin.py#build_cabin
  - tools/ships/paint_ship.py#main
  - tools/ships/export_ship.py#main
---
# Hulls

The ships Overlook sails beyond the Sloop, chosen in the Sloop's style for each rank of ship, the player's own hulls and the
merchantmen ([[Enemies Come in Five Ranks, After Destiny]], [[The Ships as Claude Shapes Them]],
[[The Sea Is a Patrol Zone, and the Ship Is Gear]], [[The Waters Come From the Islands]], [[The Sea as Claude Shapes It]]).
The Sloop, the Schooner, the Brig and the Frigate are built and sail ([[Sailing]]): each captain sails its rank's
([[Naval Combat]], "Ranks and factions").

## The Sloop's style

Every hull keeps what the Sloop's model holds, at its detail:

- **Chunky, flat-shaded forms**: one hull mesh of broad faceted panels, no smoothing, and about 28,000 faces in all.
- **Five painted parts**: hull, deck, spar, sail and iron. The game's painter lays planks, canvas and iron over them;
  no hull carries a picture of its own.
- **Flat sails with clean corners**, which the game bellies and swings, on plain round spars.
- **Tall bulwarks with gunports**, each gun its own object named `Cannon.Port.N` or `Cannon.Starboard.N`, fore to aft
  ([[Ship Models Live on R2]]).
- **One deck to walk**, with a raised quarterdeck holding the wheel, a hatch and steps down.
- **A companionway into the cabin**, the one every ship shares, entered by interacting at its doors, the Sloop's too
  ([[Every Ship Matches the Sloop's Detail, With a Cabin to Enter]]).
- **Made small and scaled up**, as the Sloop stands three times its model ([[The Sloop Is About 18 m Long]]).

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

The prologue draws Captain Brannoc Thule's ship as the Frigate, at its own size, from the ram to the deep.

## How one is made

1. `tools/ships/build_ship.py` makes the hull from its numbers in `HULLS`, in the Sloop's style: its faceted shell,
   lined gunports and capped rail, its quarterdeck and any forecastle with rails and steps at their edges, its rig
   and sails, its fittings, the Sloop's own cannon at each port, and its companionway, whose doors an empty named
   `Cabin.Entrance` marks as its way into the cabin. `ship_rig.py` rigs a mast either way: a gaff mast with its boom,
   gaff and sail; or a square mast with a top, topmast and topgallant, a yard and sail for each (its lowest yards bare
   where its numbers say), and a gaff spanker abaft it; its headsails are bent to stays to its bowsprit and any
   jibboom. A lower gun deck's ports are framed on its side, dark within, its guns' muzzles out through them; a side's
   guns are numbered from its bow to its stern across both decks.
   `ship_details.py` adds what the Sloop does not carry: wales, gunport lids, channels with deadeyes and chainplates,
   shrouds with ratlines, stays, a bobstay and dolphin striker, mast hoops, a rudder, catheads with anchors, hawse
   holes, a stern lantern, a windlass, a bell, a binnacle, a skylight, boom gallows, a ship's boat, pin rails, stores
   and coils of rope. Each gun is placed by its own muzzle, measured from its mesh: its wheels on its deck and its
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
   entry in `content/ships/ships.json`. The `ships` workflow does this for every ship built, from any branch
   ([[Model Packs Upload From Any Branch]]). A square sail is measured by its four corners, each named by its side.

## What the code needs

Done for the Schooner, the Brig and the Frigate:

- **Its numbers**: `SCHOONER`, `BRIG` and `FRIGATE` beside `SLOOP`, from their exports, each with DFO's gain for the
  matching rig and its sails; `HullKind` names each by its manifest key. Its arms (`arms_of`): each side's mouths
  fore to aft, its hull's box and each sail's.
- **Square sails** in the rules: a square-rigged hull sails, tacks and turns as the Sloop does. Its way is the Sloop's
  times its rank's, and its gain shapes its handling (how its way comes and goes, and its steerage).
- **A ship's hull, everywhere** in the rules: every ship in a fight carries its hull and sails, fights, is struck and
  rams as it; a captain's rank picks it (`Rank::hull`) and names the ship (the Pirate Brig, the Tithe Frigate); the
  snapshots, a fight's view and the doors carry it.
- **Never its strength**: its canvas drives it no harder than the Sloop's, and its side's broadside takes as much
  from a ship as the Sloop's, however many guns share it ([[Naval Combat]], "Ranks and factions").

- **Drawing them**: every ship is drawn as its own hull in its side's colours, its square sails bellied and their
  yards braced round ([[Sailing]], "Square sails"); a hull with no model yet is drawn as the Sloop.
- **Its drawn size**: every hull grows by one law as the view comes in, never under its true size ([[Game]], "Its
  size coming in").

Left:

- **The ram**: a ram bow that strikes harder than a stem, for the Tithe Ram.
- **The Fluyt**: not yet modelled.
