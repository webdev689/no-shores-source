---
type: system
status: live
code:
  - crates/gear/src/breach.rs#DROWNED_VALE
  - crates/gear/src/breach.rs#breach_cleared
  - crates/gear/src/gate.rs#BreachHard
  - crates/room/src/breach/mod.rs#breach_run
  - crates/room/src/breach/plan.rs#drowned_vale
  - crates/room/src/breach/gate.rs#open_breach_gate
  - crates/room/src/breach/fallen.rs#stands_after
  - crates/room/src/breach/lodestone.rs#Lodestone
  - crates/room/src/breach/mending.rs#keep_mending
  - crates/room/src/breach/choir.rs#keep_choir
  - crates/room/src/breach/ways.rs#keep_ways
  - crates/room/src/breach/shores.rs#keep_shores
  - crates/room/src/breach/steward.rs#keep_steward
  - crates/room/src/breach/seen.rs#BreachSeen
  - crates/protocol/src/breach_wire.rs#breach_offset
  - crates/room-wasm/src/breach_door.rs#breach_json
  - server/breach.ts#Breach
  - server/roomNames.ts#breachAsk
  - server/accounts/finding.ts#BREACH_OPENS
  - content/dungeon/breach-drowned-vale.json
  - tools/modules/breach_gate.py
  - tools/modules/breach_dress.py
  - tools/forge/tools/sprite-forge/barding.py#drowned
---
# Breaches

The Breaches are the game's hardest content: a company of up to eight through a raid of encounters and traversals, at
Normal and Hard ([[The First Breach Follows the Vault of Glass, at Normal and Hard]]). The first is **the Drowned
Vale**, opened at the Sunken Gate in the Gullwing Vale; its opening is fought in the patrol zone and the rest in its
own run ([[The Breach Opens in the Patrol Zone, and the Rest Is Its Own Instance]]). What the owner did not decide is
Claude's ([[The Drowned Vale as Claude Builds It]]).

## How it works

- **Two tiers.** `gear::breach::Tier`: Normal stands its foes at 26 and opens at level 24; Hard at 30, opening at 28
  and only once Normal is won (`Shut::BreachHard`). At Normal the fallen in a running encounter stand again after
  10 s at its stage; at Hard they never stand again of themselves: a company member raises them (hold the interact
  key 3 s within 2.5 m), each raising one of the attempt's 5 revives. Outside a running encounter the fallen stand
  again after 6 s at either tier (`stands_after`). Every living player down 3 s at once wipes the attempt: its foes go,
  the company stands whole at its stage, its revives are whole again, and it begins again as they walk in.
- **The company.** Companies hold eight, as a Breach is taken on by up to eight
  ([[Breaches Drop the Best, at Sea Too, for a Fleet of Eight]]); a Breach's run holds eight and every other run four. It is
  launched from the Playlist: the finder (`/v1/find/node-gullwing-vale--breach-<tier>?launch`) starts the run for the
  launcher's company at once, at its tier's level. Its room is `node-gullwing-vale--breach-<tier>--run-<8>`.
- **The opening, in the patrol zone.** The bake writes where the layout stood the Sunken Gate (the `breach-gate`
  module, area kind `breach`) into Gullwing Vale's node file, and its room stands the gate there. A launched player
  joins the zone with `?breach=<run>`, may arrive there from anywhere, and stands at the gate in their run's company.
  One company holds the gate at a time: **the Waking**. Its three moorings held at once by its living players fill
  the Spire (150 s); fewer let it ebb (at a quarter the pace at Normal, a half at Hard), and a Bulwark sent out claims
  a mooring left empty, which holds nothing while it stands. Waves come from the hollow's four growths. The Spire
  woken, the gate opens to that company alone; lost, the company stands whole at the gate's arrival and the gate is
  free. Everyone in the zone sees the Waking, and the companies inside the run by the name of their run's first player, tier and encounter.
- **Into the run.** The run's room lets a character in only once the zone's room says its company's gate opened
  (`server/breach.ts`), and its first player must be one the run was launched for. Its spaces are the plan's
  (`content/dungeon/breach-drowned-vale.json`): each a module stood at a point of the run's own frame and turned whole
  quarters, laid over the dark, a fall into which kills. Its three seals open as their encounters are won; the Broken
  Stair's six slabs come and go on an 11 s measure, standing 7 s of it. The run tells the zone how far it has come.
- **The Lodestone.** The Breach's relic, taken from its plinth within 2.5 m and set down again. Its bearer fights bare
  handed: their swing is its Strike (three times a blow); Guard raises Hold True (4 m round the bearer, 6 s at most,
  10 s to rest), which cleanses the Rewritten and halves a foe's blow there; the Art key Grounds it once charged
  (20 s): within 8 m it breaks a ward. Left lying 6 s (Hard 4) it unwrites the company.
- **Rewritten.** A mark the encounters lay on players; when its time comes the Rewritten are unwritten (killed)
  unless cleansed first.

## The Drowned Vale, in order

| Part | What it is | Its rules |
|---|---|---|
| The Waking | The Spire at the Sunken Gate, in the zone | Above |
| The Descent | Down the old mill race: drops, the fallen wheel across a gap, a jump; a hidden chest off a ledge | A traversal |
| The Mending | The drowned green: three seams | Three stages of 60 s (north; west and east; all three), waves between; Husks walk to an open seam and fuse, each fusion overtaking ground round it (a tenth of health a second); four fusions (Hard three) wipe; the Mender last |
| The Choir | The chapel: seven bells, five desks, the font | Rounds of 3 to 7 bells waking 1 s apart (Hard 0.7 s) and ringing 8 s (Hard 6 s) after the last; broken in waking order or they ring; a ring Rewrites the chapel; the font cleanses, then rests 10 s. Then the Scrivener, warded, at a desk: Ground breaks the ward; every 25 s it marks a desk for 4 s, blotted by a player standing on it, or it moves there; every 30 s it writes, unwriting the Rewritten; a bell wakes every 20 s; fury at 8 minutes |
| The Unlit Ways | The old town's streets between houses bricked shut, and its Watchers | A Watcher sees 14 m in a 40° cone on its sweep; a living player in its sight 0.75 s, or sprinting within 8 m, is seen: at Normal they are unwritten, at Hard the company in 3 s; a Watcher killed, the rest sweep a quarter faster; the Heart's chest opens to an attempt in which no one was seen |
| The Broken Stair | Slabs over the dark | A traversal on the slabs' measure; a hidden chest on a side slab |
| The Two Shores | The keep's hall: the Seam, two rifts | The Warden first; then each rift opens (3 s) while its mooring is held; inside, its Keeper; a Keeper's fall Rewrites its shore, again every 4 s while inside; a shore shut strands those in it (unwritten after 8 s); the Seam tolls every 30 s and fuses Husks as the Mending's seams do |
| The Steward | Its court over the dark | Its first taking at 25 s, then every 70 s (Hard 60 s): four players into one shore, Rewritten; there, five bells broken in order open the way back while the rift's mooring is held from the court; it tolls every 20 s; Grounded at its feet it lies bare 25 s (blows on it five times, the Arts recharging three times as fast); after the fourth taking its next toll unwrites everyone |

## Rewards

- **Each encounter's first clear a week** at each tier pays a Breach Vestige of that tier; the Steward pays two.
  Normal's armour climbs from Prestige 19 to 28, Hard's from 21 to 30: only Hard reaches level 30 ([[Gear]]).
- **The Steward's first clear ever** keeps the banner, the emblem The Drowned Vale; by chance the dye Drowned Vale
  (1 in 5 at Normal, 1 in 3 at Hard) and the horse barding Drowned (1 in 20, 1 in 8), each once.
- **Hidden chests** pay Essence once a week; every find keeps its lore chapter of the book *Soundings* ([[Lore]]).

## On the page

- **Launched from the Playlist** (`playlistBreach.ts`, `breachTrips.ts`): its crest opens Find a Company's Launch at
  its tier; the run found, the page travels to the Gullwing Vale joined with the run, standing at the gate. A refusal
  shows its words.
- **The gate in the zone** (`breachView.ts`, `breachWords.ts`): within 60 m of the gate its banner takes the zone's
  banner's place (the Spire's fill, each mooring held, claimed or free, the companies inside); further off it is one
  line under the zone's own; the compass marks the gate. A company the gate opened to is offered "Enter the Drowned
  Vale" at its doorway.
- **In the run**: its spaces drawn over the dark from the plan (`room_breach`), only the Breach's modules loaded while
  there; its seals while shut, its slabs fading in and out over a second, its bells, the Lodestone (lying, on its
  plinth, or turning 2.3 m over its bearer); each encounter's banner from the snapshot's Breach; the Rewritten ringed
  at their feet and named on their plates; the revives left at Hard. The page predicts on the run's blocks as its
  room stands them (`fighter_breach`). The way out is Use at the Descent's entry, or at the court's portal once won.
- **Raising and following**: holding Use by a fallen company member raises them, its share a ring; while dead, the
  view follows a living company member (`followCamera.ts`), F (RB) choosing the next.

## Its art

Built in Blender ([[Modules]]): the Sunken Gate's hollow (the cliff of split stone and its portal, the Spire of red
crystal, the moorings, the ledges) and each space of the run (`tools/modules/breach_*.py`), every one under 32,000
triangles, its parts and sockets what the rules stand on; the dressing (`breach_dress.py`) is drawn only. The Drowned
horse is a mount look of the forge (`barding.py`), its ridden pictures rendered by the forge's workflow on `main`.
