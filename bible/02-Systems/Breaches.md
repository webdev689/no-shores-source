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
  - crates/room/src/breach/fallen.rs#breach_lets_revive
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
  and only once Normal is won (`Shut::BreachHard`). The fallen are revived as anywhere ([[Revives]]); the Breach adds
  its own rules on top (`breach/fallen.rs`). At Normal the fallen in a running encounter stand again of themselves,
  unasked, after 10 s at its stage, unless revived sooner; at Hard they never stand again of themselves, and each
  revive spends one of the attempt's 5 revives, none left meaning none (`breach_lets_revive`). Outside a running
  encounter the fallen stand again after 6 s at either tier (`stands_after`); a fall into the dark is not revived, and
  waits as long. Every stand at the stage reached is a respawn there, the stage the Breach's checkpoint, told
  `Checkpoint` as it moves on. At the Waking the same holds for the company holding the gate in its hollow, standing
  again at the gate's arrival, its fallen revived only by its own company. At Hard every blow on a player
  in the run, or of the company in its Waking, weighs 1.25 times. Every living player down 3 s at once wipes the
  attempt: its foes go, the company stands whole at its stage, its revives are whole again, and it begins again as
  they walk in. A player who leaves and comes back keeps what the Breach laid on them: down if they left down (a fall
  too), their mark and its time, and a shore they were taken to (`breach/rejoin.rs`).
- **Its great foes** are matched to the whole company in the run, living or not (each player past the first adds 0.45
  of its health; a Keeper is matched to half the company), then stand at their own times: the Scrivener six, the
  Steward eight, the Mender and the Warden one and a half.
- **The company.** Companies hold eight, as a Breach is taken on by up to eight
  ([[Breaches Drop the Best, at Sea Too, for a Fleet of Eight]]); a Breach's run holds eight and every other run four. It is
  launched from the Playlist: the finder (`/v1/find/node-gullwing-vale--breach-<tier>?launch`) starts the run for the
  launcher's company at once, at its tier's level. Its room is `node-gullwing-vale--breach-<tier>--run-<8>`.
- **The opening, in the patrol zone.** The bake writes where the layout stood the Sunken Gate (the `breach-gate`
  module, area kind `breach`) into Gullwing Vale's node file, and its room stands the gate there. A launched player
  joins the zone with `?breach=<run>`, may arrive there from anywhere, and stands at the gate in their run's company.
  One company holds the gate at a time: **the Waking**. Its three moorings held at once by its living players fill
  the Spire (150 s); fewer let it ebb (at a quarter the pace at Normal, a half at Hard), and a Bulwark sent out claims
  a mooring left empty, which holds nothing while it stands. Waves come from the hollow's four growths, two and one
  more for every two of the company's living holders, six at most. The Spire woken, the gate opens to that company
  alone until its Breach is cleared or a day has passed, and no company whose run opened takes the gate again; lost
  (a wipe, or the Spire standing empty a whole minute), the company stands whole at the gate's arrival and the gate is
  free. The zone hears only the runs it opened, so a run no one was let into shows no company inside. The gate's
  company holds eight at most, and only those the Breach would let in (its tier's level, and Hard's Normal win); one
  refused is told why (`ShutOut`). The gate stands only in the Gullwing Vale's room at Normal seas, its doorway shut by
  rock behind its seal. Everyone in the zone sees the Waking, and the companies inside the run by the name of their run's first player, tier and encounter.
- **Into the run.** The run's room lets a character in only once the zone's room says its company's gate opened
  (`server/breach.ts`), and its first player must be one the run was launched for. Its spaces are the plan's
  (`content/dungeon/breach-drowned-vale.json`): each a module stood at a point of the run's own frame and turned whole
  quarters, no two sharing ground, laid over the dark, a fall into which kills. Bodies vault in the run but never climb
  (`Floor::Dark`), so its walls and the Ways' bars hold. Its three seals open as their encounters are won; the Broken
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
| The Mending | The drowned green: three seams | Three stages of 60 s (north; west and east; all three), waves between; Husks walk to an open seam and fuse, each fusion overtaking ground round it (a tenth of health a second), the walkers standing whatever the waves; four fusions (Hard three) wipe; the Mender last |
| The Choir | The chapel: seven bells, five desks, the font | Rounds of 3 to 7 bells waking 1 s apart (Hard 0.7 s) and ringing 8 s (Hard 6 s) after the last; broken in waking order (a few blows each) or they ring; a wave stands as each round wakes; a ring Rewrites every living player in the run; the font cleanses, then rests 25 s. Then the Scrivener, warded, at a desk, its aimed shot telegraphed, at half health quicker with two Flickers called behind it: Ground breaks the ward; every 25 s it marks a desk for 4 s, blotted by a player standing on it, or it moves there; every 30 s it writes, unwriting the Rewritten; a bell wakes every 20 s; fury at 8 minutes |
| The Unlit Ways | The old town's streets between houses bricked shut, and its Watchers | A Watcher sees 14 m in a 40° cone on its sweep; a living player in its sight 0.75 s, or sprinting within 8 m, is seen: at Normal they are unwritten, at Hard the company in 3 s; Watchers cannot be harmed; won when every living member of the company stands on the Stair; the Heart's chest opens to an attempt in which no one was seen |
| The Broken Stair | Slabs over the dark | A traversal on the slabs' measure; a hidden chest on a side slab |
| The Two Shores | The keep's hall: the Seam, two rifts | The Warden first; then each rift opens (3 s) while its mooring is held; inside, its Keeper; a Keeper's fall Rewrites its shore, again every 4 s while inside; a shore shut strands those in it (unwritten after 8 s); the Seam tolls every 30 s and fuses Husks as the Mending's seams do |
| The Steward | Its court over the dark | Its first taking at 25 s, then every 70 s (Hard 60 s) on a fixed clock: half the living players in the run not away, up to four, into one shore, Rewritten; any still away when the next taking comes are unwritten first; there, five bells broken in the order shown in the court open the way back while the rift's mooring is held from the court (by two at Hard, or as many as are left there; with none left, the bells alone); it tolls 20 s after each taking and every 20 s; Grounded at its feet it lies bare 25 s, once between takings (blows on it five times, the Arts recharging three times as fast), and a company that never lays it bare cannot fell it before its last toll; it sweeps and lunges, at two thirds slams with two Husks called beside it, at one third rings; after the fourth taking, when a fifth would come it unwrites everyone, and every 20 s after; its fall wins, bringing back any still in a shore |

## Rewards

- **Each encounter's first clear a week** at each tier pays a Breach Vestige of that tier; the Steward pays two.
  Normal's armour climbs from Prestige 19 to 28, Hard's from 21 to 30: only Hard reaches level 30 ([[Gear]]). Its
  weapons come in two sets, Normal's and Hard's, a piece won at Hard named Forged after its set ("Lattice Sword
  (Forged)", "Lattice Hauberk (Forged)", as Destiny's raid weapons are Adept:
  [[Breach Weapons Come Normal and Forged]]; `itemName`), its Breach perks at their stronger Forged grade
  ([[Forged Perks Are Stronger, and Hard Armour Is Forged Too]]; [[Gear]], "The Breaches' perks"). Normal's weapons
  never carry an element and the Forged always do
  ([[A Breach's Normal Weapons Carry No Element, and Its Forged Ones Always Do]]).
- **The Steward's first clear ever** keeps the banner, the emblem The Drowned Vale; by chance the dye Drowned Vale
  (1 in 5 at Normal, 1 in 3 at Hard) and the horse barding Drowned (1 in 20, 1 in 8), each once.
- **Hidden chests** pay Essence once a week; every find keeps its lore chapter of the book *Soundings* ([[Lore]]).

## On the page

- **Launched from the Playlist** (`playlistBreach.ts`, `breachTrips.ts`): its crest opens Find a Company's Launch at
  its tier ("Launch", never "Go alone"); its card says it is played online with a company, the Prestige each tier
  reaches and the standing-again times. The run found, the page travels to the Gullwing Vale joined with the run,
  standing at the gate. A refusal shows its words: the gate's own (112), "Too far from the gate." (100), that the gate
  did not answer, or why the gate's company shut a player out (`ShutOut`: full, under the level, Hard before Normal).
- **The gate in the zone** (`breachView.ts`, `breachWords.ts`): within 60 m of the gate its banner takes the zone's
  banner's place (the Spire's fill, each mooring held, claimed or free by the holding company's living players, the
  holding company, "Your company" to its own, its revives at Hard, the companies inside); further off it is one line
  under the zone's own; the compass marks the gate. The Spire's fill rises as a pillar of light the whole zone sees,
  and its company hears the tension music while it fills. The seal stands in its doorway until the gate opens to the
  viewer's company, which sees the doorway as the dark of the way in (the seal's shape black, a violet sheen low in
  it) and is offered "Enter the Drowned Vale" there. The Waking's moments and stings reach only its
  company and those in the hollow.
- **In the run**: its spaces drawn over the dark from the plan (`room_breach`), only the Breach's modules loaded while
  there and let go on any way out (the seal's in the gate's zone too); heard underground. It is lit as underground
  (`breachLook.ts`, `drawRun`): a sky of its own, with no sun or moon, a cool light from above about three quarters
  of a clear noon's (so its floor reads, a median of at least 0.12 in sRGB where no lamp reaches), and everything
  fading into the dark from 40 m to black at 120 m; the lamps nearest the eye (16, none too faint to show) of those
  its pieces give, each read from where the piece's crystal, fire and glass lie (red at the seals, bells, the Seam and
  the clusters, as bright as the square of their glow; warm at the Choir's candles and rose window, the shore's hearth
  and sconces, the Heart's lantern), pooling round what burns at least twice as bright as the floor, and a carried
  torch or lantern; the figures in the same light as the stone, fading into the dark with it. Every frame of the
  dungeons' scene writes the sky it is drawn under, so a dungeon entered straight from the run draws under none of
  the run's. A shore is drawn only while a player stands in
  it, a rift to it is opening or open, or the Steward's taken are there. Its seals while shut, its slabs fading in and
  out over a second, its bells (a dim one asleep at each bell socket no bell foe holds), the hidden chests (the plain
  chest dim while it will not pay, the heroic chest, its crystal alight, once it will, thrown open once it has),
  the Lodestone (lying, on its plinth, or turning 2.3 m over its bearer); each encounter's banner from the snapshot's
  Breach, with its limits and its clocks (fusions of 4, Hard 3; the round of 5; a desk's marking, a bell's ringing,
  the Scrivener's fury; the takings of 4; the court's mooring "held 1 of 2"); a teaching line as each encounter begins
  and a won line as it ends; the Rewritten ringed at their feet and named on their plates; the revives left at Hard.
  The call over the banner is a short word that settles ("Seen!", "Take the stone!", "Stranded!"). The page predicts,
  aims and sees on the run's blocks as its room stands them (`fighter_breach`). The way out is Use at the Descent's
  entry, or at the court's portal once won.
- **Its marks** (`breachMarks.ts`): the compass's stage reached, way on, way out and Lodestone; rings on the ground for
  the open seams and their overtaken reach, the font lit or resting, the marked desk, each Watcher's cone (14 m, 40°)
  and its hearing (8 m), the moorings' reach, each rift's mouth and way back (open, filling or shut) and the court's
  way-back mooring (an arc for each holder it needs); the Steward's order while the taken are away as the numerals I to
  V in the court over the rift's mooring, each shore bell carrying its place's numeral. A ring that warns is dashed, so
  it is told from a safe one by shape as well as colour. Which Choir bell comes next is never marked.
- **Its moments** (`breachMoments.ts`), each once, at its place: a bell (each waking at its own note), a mooring, a
  rift, a desk, a Keeper's shore, the marked or seen player. The great foes' waking plays the Elite Boss's sting and
  the music's peak; a wipe names its cause ("Your company fell: the Lodestone lay too long."), and the company
  unwritten is told in words; a revive is told as the game tells it ([[Revives]]).
- **The Lodestone's bearer** is drawn bare handed with no crosshair; its key strip reads Strike, Hold True and Ground;
  any Art key Grounds it once charged. Use takes up the Lodestone before a revive while it lies counting down.
- **Falling, reviving and following**: the game's death screen and revive prompt ([[Revives]], "On the page") say the
  Breach's truth where it differs (`StandingAgain`): "Standing again in 9 s" (10 s at Normal in a running encounter or
  the Waking, 6 s outside one), at Hard "A company member can revive you · 3 revives left" or, with none left, that
  they stand again once the encounter is won or the company falls, as for a fall into the dark; Respawn is offered
  only when the room would take it. There is no revive prompt with no revives left, nor over the Waking's company for
  one outside it (`mayRevive`). While dead, once their fall has played, the view follows a living company member, in
  the run or at the gate (`followCamera.ts`), its key naming who ("Following Ada · Next").

## Its art

Built in Blender ([[Modules]]): the Sunken Gate's hollow (the cliff of split stone and its portal, the Spire of red
crystal, the moorings, the ledges) and each space of the run (`tools/modules/breach_*.py`), every one under 32,000
triangles, its parts and sockets what the rules stand on, every piece's socket on its floor clear of every part; the
dressing (`breach_dress.py`) is drawn only. The Drowned horse is a mount look of the forge (`barding.py`).

Its light comes from its pieces as built: wherever a module wears crystal, glow (a flame) or glass, the page gathers
it into lamps 3 m across (`moduleLights.ts`), one lamp for a light the grid cuts in two, and out of the piece's
solids where crystal on a wall's faces gathers inside it, so a piece rebuilt lights where it now burns. Crystal on
both faces of a wall thinner than 3 m gathers to one lamp, set out on one side only. Stained glass (`glass`) is
drawn as leaded panes of ruby, cobalt, amber, green and pale, lit from behind; the drowned floors' water ripples
slowly and glints with the lamps over it ([[Modules]], "In the game").

## Limits

- **The Drowned horse is not rendered yet.** Its ridden strips come only from a forge run started by hand
  (`forge.yml`, `figures` = `horseidle,horsewalk,horsegallop|horse_drowned`), which writes to R2 and so waits for the
  owner's named yes; its first-person frames (`fpride.py --looks`) are in no workflow. Until then the page draws the
  bare horse under it. The swatches' count sets every look's stripes, so that run redraws the other four looks too.
- **The Scrivener and the Steward** wear the Idol's and the Heart's bodies until their own are drawn.
- **The page copies some of the rules' numbers** (the standing-again times, the hollow's reach, the Choir's rounds and
  the font's rest, a Watcher's hearing, a shore's strand, the Scrivener's fury, a Bulwark's claim, the court's
  holders, the fusions and takings that end an attempt, the stages, the Prestige each tier reaches): a change to one in
  the rules changes it in the page too. A player already paid a hidden chest this week sees it shut.
- **Small companies**: one or two cannot hold the Spire's three moorings; their Waking is lost when the Spire stands
  empty a minute.
- **At Hard, a fall into the dark in the Unlit Ways** is not waited for: the living alone must reach the Stair, as the
  Vault let a few finish its maze. Claude's reading; the owner may want every player.
- **The Two Shores' crossing rule at Hard** (the Lodestone may not cross a rift) never binds yet: no Keeper is warded.
  A Hard ward on the Keepers would give it weight; that is a new mechanic, for the owner.
- **The run's light casts no shadows**: a lamp lights every face turned to it within its reach, through anything
  standing between (a face turned away takes none, so no wall is lit on its far side); only the 16 nearest the eye
  light the run. In the Unlit Ways, red pools on both walls of a corridor where a crossing's crystal stands between
  them, which is right, but a wall beyond another is lit as if the first were not there.
- **Stained glass is on the page before any piece wears it**: until the modules are rebuilt with `glass`, the Choir's
  rose window and the shore's lancets wear `glow` and read as a flat warm disc.
- **Played offline only**: tested by the rules' and the page's tests, never in a deployed room; its light was
  pictured by drawing the run's pieces through the page's own drawer and sky offline, never in a live run.
