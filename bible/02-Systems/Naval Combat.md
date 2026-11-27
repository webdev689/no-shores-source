---
type: system
status: live
code:
  - crates/naval/src/ballistics.rs#elevation_for_range
  - crates/naval/src/ballistics.rs#segment_entry
  - crates/naval/src/guns.rs#SWIVEL
  - crates/naval/src/guns.rs#loaded
  - crates/naval/src/random.rs#Mulberry32
  - crates/naval/src/arms.rs#SLOOP_ARMS
  - crates/naval/src/gunnery.rs#volley
  - crates/naval/src/gunnery.rs#zone_radius
  - crates/naval/src/damage.rs#shot_harm
  - crates/naval/src/shots.rs#step_balls
  - crates/naval/src/shots.rs#stop_of
  - crates/naval/src/captain/mod.rs#Captain
  - crates/naval/src/captain/engage.rs#engage
  - crates/naval/src/captain/aim.rs#captain_guns
  - crates/naval/src/captain/aim.rs#Judgement
  - crates/naval/src/captain/odds.rs#odds
  - crates/naval/src/fight.rs#Fight
  - crates/naval/src/fight_helm.rs#sail_hurt
  - crates/naval/src/boost.rs#Boost
  - crates/naval/src/fight_step.rs
  - crates/naval/src/fight_focus.rs#spread_after
  - crates/naval/src/laying.rs#preview
  - crates/naval/src/laying.rs#on_water
  - crates/naval/src/ram.rs#ram_blow
  - crates/naval/src/ram.rs#overlap
  - crates/naval/src/fight_ram.rs
  - crates/land-wasm/src/fight.rs#fight_step_json
  - client/src/editor/naval.ts#Naval
  - client/src/editor/fighting.ts#Fighting
  - client/src/editor/aim.ts#lookReach
  - client/src/editor/aimCamera.ts#AimCamera
  - client/src/editor/aimStation.ts#aimStation
  - client/src/editor/aimCamera.ts#wayAboard
  - client/src/editor/aimCamera.ts#laidNearest
  - client/src/editor/aimCamera.ts#laidAlong
  - client/src/editor/shipClear.ts#orbitClearance
  - client/src/editor/shipClear.ts#swingOf
  - client/src/editor/naval.ts#aimOf
  - client/src/ships/aimView.ts#AimView
  - client/src/game/seaSight.ts#aimLineOf
  - client/src/ships/effects.ts#Effects
  - client/src/ships/fightFeel.ts#FightFeel
  - client/src/rules/feelEvents.ts#feelOf
  - client/src/ships/shipHarm.ts#ShipHarm
  - client/src/ships/harmDrawn.ts#harmedCanvas
  - client/src/ships/flotsam.ts#Flotsam
  - client/src/ships/fightSounds.ts#playCues
  - client/src/ships/markView.ts#MarkView
  - crates/naval/src/fight.rs#meet
  - crates/naval/src/wire.rs#view_numbers
  - crates/room/src/hostiles.rs#Hostiles
  - crates/room/src/friendlies.rs#Friendlies
  - crates/room/src/threat.rs#held_pace
  - client/src/game/seaCombat.ts#SeaCombat
  - client/src/ships/shipCrew.ts#captainInFight
  - crates/naval/src/ranks.rs#SCALES
  - crates/naval/src/ranks.rs#Commission
  - crates/room/src/sighting.rs#rank_for
  - crates/room/src/sighting.rs#sight_for
  - crates/room/src/chart.rs#Charted
  - crates/room/src/clash.rs#Clash
  - crates/naval/src/fight.rs#among
  - client/src/ships/shipBars.ts#placeShipBars
  - crates/naval/src/rigging.rs#Rigging
  - crates/naval/src/rigging.rs#masts_of
  - crates/naval/src/fight_events.rs#Event
  - crates/naval/src/captain/odds.rs#wary_takes
  - crates/room/src/battle.rs#Fights
  - crates/room/src/flotsam.rs#Flotsam
  - crates/room/src/harbour.rs#Harbours
  - crates/room/src/harbour.rs#Repair
  - crates/room/src/deck_fight.rs
  - crates/room/src/sea_decks.rs#Decks
  - crates/foes/src/crews.rs#deck_crew
  - client/src/game/seaWord.ts#SeaWord
  - client/src/network/seaHarbour.ts#harbourOf
  - crates/naval/src/fight.rs#ambush
  - client/src/game/prologue/fightAtSea.ts#StoryFight
---
# Naval Combat

Broadsides, and rams, between players' ships, each in the hull its player sails ([[Shipyard]]), and the enemy factions'
captains, each in its rank's hull: DFO's naval
combat, rebuilt in Rust ([[Pick - Sailing and Naval Combat]]) on the [[Sailing]] crate's ships. The owner fights one
captain alone in the [[World Editor]], or with other players in a fleet room on the [[Server]]. At sea a fight ends
in a sinking and what floats, or in a captain striking and a boarding; a player who loses washes up at a port city,
and the damage stays until repaired ([[The Sea Is a Patrol Zone, and the Ship Is Gear]],
[[The Waters Come From the Islands]], [[Hulls]], [[The Sea's Fights, Waves and Close Views Get a Detailed Pass]], [[The Sea Fight Looks and Aims as DFO's Does]]). A ship is "it" ([[Ships Are It, Not Her]]).

## The fight

A fight holds any number of ships by number, each sailed by a player's orders or by a captain's mind, and flying the
players' flag or a faction's (the Grey Tithe's). A captain of the players' faction, a friendly ship of the traffic,
flies their flag (`Flag::numbered`). Each tick, in this order: each player's ship steps once
for each of its orders taken (late orders catch up; with none it lies as it was, riding the swell), each captain
steers and sails, hulls that overlap are pushed apart, each player's stem may ram, the guns load, the captains fire and
then the players, the balls fly, fires burn and sinking ships go down, each player's hands mend their ship, and a captain who
has sunk, or lies past every ship they may fight and is not fighting, leaves the fight. A player's ship's step under its hurts
is one pure function (`sail_hurt`), which a browser predicting it runs too.

Its guns, the balls striking and falling in the sea, and a ship breaking up are heard where each happens, through the
sea's soundscape ([[Ambience]]).

## How it works

- **A ball** is a point under gravity alone (9.81 m/s², no drag), leaving its gun at the gun's speed plus the deck's
  way. Its flight is a closed form of its launch, swept as a segment from where it was to where it is, so no step bends
  a shot or tunnels one through a hull.
- **A gun is laid, not pointed.** A broadside fires square to the hull ([[Ship Guns Keep Square Broadsides]]); the
  gunner sets only the range, and the low arc that lands there is found within the carriage. Each gun's mouth rides
  the ship's heel; the lay stays its upright hull's. Every ship's guns, a player's and a captain's
  ([[Captains Lay Gun by Gun, and Each Ship's Aim Follows Its Guns]]), are each elevated for that range from their own
  port and deck (`Lay::laid_on`), so a second gun deck throws as far as the first, and a captain's misjudged range is
  as far off at every gun. Square, a battery longer than the ship it fires at throws its end guns' balls past that
  ship's ends, the more so as the range opens.
- **The guns** are DFO's swivel, three a side: 55 m/s, -10 to 14 degrees, 149 m at most from the ship's deck. A broadside
  ripples 0.09 s a gun, each ball from where its port is by then, scattered by the volley's seed (more for a poorer
  gunner). No battery bears within 35 degrees of its bow or 40 of its stern. Each side reloads on its own clock: a
  captain's 4 to 7.2 s by its crew left; the player's Sloop's ten hands load its guns in 5.6 s whole, up to 10.1 s with
  none left ([[Crew]], "Hands"), another hull at its class's pace ([[Shipyard]]).
- **The loads** are round, grape, chain and heated shot, with DFO's factors over round shot: grape is slower and wider
  and kills men (less as its flight lengthens), chain tears canvas, heated shot sets a ship alight. A loaded side drawn
  for a new load takes half its reload; one loading keeps its progress.
- **A look on a ship** lays for the point it meets (DFO's `lookOnShip`): the look's ray from the aim's eye is tested
  against the ship's hull's box and its standing sails' boxes (none where a mast has fallen, as a ball passes there)
  out to the laid gun's longest throw and 60 m, the nearest entry taken.
  The side is laid on that point, its range out along the fire and its own height. A look on the ship's canvas lays chain
  for that very point and every other load for its hull's middle. The point is led along the fire by the ship's way over the
  ball's flight there. A look that meets no part of the ship lays for where its ray meets the water (`on_water`; the
  ground where it is dry), the swell felt as a ball laid there would come down on it (DFO's own flight time out to it),
  so the balls come down under the sight whatever the swell: the ray is felt on toward the water in steps no swell
  rising 0.4 m a metre could meet, until it stands within a centimetre of it, 64 steps at most, out to the laid gun's
  longest throw and 60 m. A look level or over the horizon, one past that, and a look with no ray lay for the water's
  range on a sea at rest at the ship's heave; so does a ray from an eye
  more than 100 m from the player's own ship (`LOOK_EYE_M`: the fight camera's 75 m out from 6 m over it, and the way
  the ship makes meanwhile), so no page lays on a ship by looking from beside it ([[The Server Is the Authority Over Everything]]). Whatever the ray meets, the side fires
  square to the hull, its elevation within its guns' carriage. A release fires that same lay, felt on the water of
  that tick.
- **A held lay narrows**, as Black Flag's broadside does ([[Aiming a Ship Follows Black Flag, From Its Deck]];
  `fight_focus.rs`): a player's volley fired the moment its lay is taken scatters twice as wide as its guns' own,
  settling evenly to theirs over 1.5 s of holding. The rules count it by the player's orders, a tick an order holding a
  lay on the same side; one on the other side begins it again, one holding none lets it go, and a tick with no orders
  keeps it. A Gunner's broadside scatters as the guns' own. The preview's landing zone is as wide as the volley would
  scatter, as long as it has been held and as the ship's fitting trims it, and the preview carries how much wider it is
  (`Preview::spread`) to the page. A fleet room's page counts its own hold by the orders it sends, as the room counts
  them (`FleetSession`); a page whose orders lag past the room's wait has its hold begun again by the room's standing
  orders, so then its zone reads narrower than the volley scatters.
- **The aim shows each gun's end**: its ball, unscattered, flown by the same law a fired ball flies by (in the fight's
  ticks) with the target where its way will have carried it by then, to where it stops. The lay is on target only when one
  of those balls meets the target, canvas or hull. Its landing zone's radius is DFO's: half the width the crew scatters the
  gun's yaw across at the splashes' mean range (at least 2 m wide), and never under 1.6 m.
- **What stops a ball** is the first hull of another flag, water or ground it meets: a player's ball passes through
  another player's ship, and a captain's through any ship of the captain's own faction. A ball tears through any canvas it crosses
  (once a ship) and flies on. The water is the swell's surface under it, and the ground the land's, sampled every 4 m.
- **The harm** of a ball is half again DFO's (`FIGHT_HARM`, [[Ships Sail and Hit Half Again Harder in Sea Fights]]): by
  where it struck (holed within 1.1 m of the water under it, 40% more; the hull above; the canvas), 85 to 115% by its
  own roll. A captain's men stand 1.6 blows each, a player's crew 3.2.
- **A ship** has hull, canvas and men. A captain strikes at their rank's share of their hull (a Major's quarter) or with no
  men left. Any ship, the player's too, goes down over 20 s at none (`Sinking`, then gone), listing and trimming
  by its seed (a player's by none) and settling slowly, then fast; going down, its guns are silent and its helm takes
  no orders. The rest of the volley that made a captain strike cannot sink their ship. A player's ship never strikes. Fires
  (three at most) burn hull, canvas and men for 15 s, each as strong against its ship as the ball that set it: 1.4
  hull a second times the shooter's level strength (a captain's) and what both ships' fittings made of the ball
  (`apply_burning`), so a fire keeps its worth as levels rise; a ball that does its target no harm, its ship four
  levels or more below, sets none. Bare poles leave 35% of a ship's way. Braced, a ship takes half the harm
  to hull and canvas, but its guns are silent and do not load. Unhurt for 15 s, with no hostile ship within 700 m that
  would take it (a friendly captain never would), its hands mend it to half of its hull and of the canvas its standing sails hold.
- **Its rig** (`rigging.rs`). Each sail's share of a ship's canvas is the pull it gives at its crest over the ship's whole canvas's
  (`sailing::helm::canvas`). A ball on the ship's canvas counts its canvas harm to the sail whose box it entered first; once a
  sail's harm passes its due (its share of the ship's whole canvas) it tears away (`SailLost`), and the ship's canvas holds no more
  than its standing sails' shares, so its drive loses that sail's share. A bare spar struck again, every sail of its mast gone,
  brings the mast down (`MastFell`), and balls pass where its sails stood. The ship's masts are where its square sails and
  gaffs stand, their fore edges taken from the bow aft, one mast while each lies within 2 m of the last; a staysail
  stands on its foremost mast: the Sloop has one, the Schooner two, the Brig two and the Frigate three.
- **What a tick tells** (`fight_events.rs`), beside the World Editor's events and each on the fight's tick it happened
  on: a ball's splash where it fell; a ball that struck a ship, where in its own frame and on its hull, a sail still set
  or its rig where that sail is gone; a sail torn away; a mast fallen; colours struck; a ship going down; a piece of what
  floats laid, and gathered; and players gone aboard a ship.
- **Chance** is one seeded stream (DFO's mulberry32), drawn in a fixed order, so a fight is the same on every machine.
- **The pace** of every ship in a fight, a player's or a captain's, is 1.8 times its pace at sea, under sail and under
  oars alike (`FIGHT_PACE`: half again, [[Ships Sail and Hit Half Again Harder in Sea Fights]], and a fifth on that,
  [[Ships Sail Faster, Turn Twice as Fast and Burst on Shift in Sea Fights]]),
  and it swings twice as fast and answers its helm twice as soon (`FIGHT_TURN`): the Sloop makes about 4.8 m/s with
  the usual breeze on its quarter, swings at up to about 28 degrees a second under sail and 40 on its oars, and from
  slow its rudder takes hold twice as fast. A captain reckons its own swing at a fight's (`swing_rate`).
- **The burst** (`boost.rs`, [[Ships Sail Faster, Turn Twice as Fast and Burst on Shift in Sea Fights]]): a tap of Shift drives a player's ship's sails and oars half again for 4 s; once the
  burst is over it recharges for 12 s, so it may burst again 16 s after the tap. A tap while it bursts or recharges
  does nothing, nor does one on a ship going down (its burst is kept). Captains never burst. The fight's view carries each
  ship's burst, the share still to run and the share of its recharge done, which the ship's bar shows on the burst's
  ring, lit and draining as it runs, then swept dark as it recharges with its last seconds counted, the browser
  turning the shares to seconds by the burst's 4 s and 12 s (`ships/shipAbilities.ts`; "How it looks", "The
  readout"). Sailing between ports has no burst: only a fight's helm has one, and a fleet room's fight has none.
- **The burst's look** ([[Other Ships Wear Their Players' Marks, the Sea Map Has No Fog, and New Players Ride a Bay That Bursts]], `ships/burstWake.ts`): as a ship's burst begins its bow
  heaves up a sheet of spray to either side (16 drops each) and a ring of foam spreads under its stern; while it runs,
  spray flies off both bows (14 drops each a second) and foam is laid astern (9 puffs a second, each spreading for
  some 3 s where it was laid), so a bursting ship draws a white road behind it; as it ends, a last low fall of spray
  at the bow and a wide ring of foam as it settles. Every ship's, read from the view's burst, none for one going
  down. Its puffs are the fight's own spray and foam (`Effects`), in its budget and drawn as theirs are.
- **Ship power** ([[Ship Power]]): a player's ship whose character the sea holds is fitted each tick (`fitting.rs`):
  its harm on each captain and each captain's on it by its level, Attack and Defense against the captain's level, and
  its trim from its modules and posted officers, among them its Gunner firing the broadside it does not lay, its
  Bosun keeping way its torn canvas costs it, and its Carpenter patching part of each ball's hull harm back; and its
  Atheric module's own work (`fight_exotics.rs`): a ball below the waterline holing twice as hard, a sinking reloading
  its guns, its hull mending, a last stand once a fight, way kept with torn canvas, way from each ball striking it, a
  ship struck in the rigging turning slower, and the ships near it sailing slower. A ship slowed is seen sailing
  slower, and a mend is seen in its hull, as a Carpenter's patching is.
- **The wind** a fight on the land worker sails in (the World Editor's and the story's) is the world's where each
  ship is, read each minute of world time; a fight a story plays is told its own instead, the weather drawn round it
  ([[Prologue]]), so a storm drawn is a storm sailed.

## The captain

They sail their rank's hull under the player's own helm, so their pace is their hull's by the player's law. They see every
ship they may fight (each player's, and each afloat captain's of another faction) and keep, for each, whether it struck
them lately and whether they spare it. DFO's captain commands a swing and a share of sail; here the swing is a share of
their rudder and the sail the rung whose way is nearest. Under the ladder's law the wind's eye costs them 0.55 of their way,
so they never tack.

- **Whom they fight.** A captain is bold one time in four by their seed, an Elite and above always. A bold one takes on a
  ship they may fight within 750 m; a wary one only a hull nearly gone, or a ship they outgun 5 to 4 by DFO's
  fighting power (the time each takes to make the other strike, by each ship's whole rank: its hull and men, its guns'
  harm and reload). Struck by a ship, they are hostile to it for 5 minutes. Of the ships they would fight and do not
  spare, they take the nearest, the one they already fight reckoned a fifth nearer (as DFO ranks them), and run from
  the nearest that struck them within 320 m. What they remember of a chase, their mark's way and the side they
  presented is let go when they mark another ship.
- **Their course.** They bend round every hull about them that will pass within both their reaches (each half of half its
  box's beam and length) and 15 m, the bends of each summed, as DFO's traffic does. Far off, they steer to intercept,
  until the range is their reach and what their turning circle and their helm's ease close as they come round: so they are
  round to their broadside as the range comes to their reach, as a player who turns at it is, and rank, not the order of
  the turns, decides the fight. A ship running from them they run down astern, then sheer out to its beam. Otherwise
  they bring the side that costs least to bear on where their balls will meet him, laid abeam once they will be round
  within their reach, else bent off the beam to open or close their range of 50 m, and once presented keep station with
  sail. They bend round his hull and sound the land ahead, swinging off a foul course.
- **Their guns.** A side loaded, in reach, near their beam, bearing soon and whose lay would strike runs out: the tell.
  Their reach is reckoned centre to centre as a player's balls strike them: their guns' reach, their own half beam out to their
  mouths, and the mark's depth along the line of fire (half its length end-on, half its beam abeam); their lay strikes if
  it passes through the mark's middle or its near side.
  It fires no sooner than 1.3 s on, within their gunners' window, long or short by the gunners' want of skill. Their
  gunners lead the mark by its way as they last saw it (smoothed over a second, so a mark that comes about is led
  where it was going), and each volley they misjudge as its side runs out
  ([[Ships Show Their People, and Captains' Gunners Misjudge]]): where the mark stands across their line as they fire
  (up to 80 m at the mark), its speed (up to 80%) and course (up to 40°) as they lead it, and their elevation (up to
  3°), each at their whole want of skill and a Major's rank, scaled by both, and most often small (the mean of two
  draws). The volley flies wide by what they misjudge across the mark, as the ship swings under them, but never more
  than the 13° off its beam it ever fires within (`BEAR_DEG`), so the broadside stays square
  ([[Ship Guns Keep Square Broadsides]]). Against a Sloop sailing on or weaving, a Minor's balls strike its hull 14 to
  33 times in a hundred (0.3 to 1.2 hull hits a minute), a Major's about half (1.5 to 8), an Elite's to a Boss's 44 to
  64 in a hundred (5 to 34 a minute) (`captain_gunnery`, six fights of 4 minutes a rank). Their misjudged elevation never passes
  what their carriage depresses or raises to. One run out too long unfired, or that loses its mark, is run in.
- **When they break off.** A captain runs below their rank's share of their hull (a Major's 30%); a wary one runs from a
  ship that outguns them. A chase that gains nothing in 150 s is given up. They leave the fight when they have sunk, or,
  not fighting, lie past 1.9 km from every ship they may fight (each player's, and each afloat captain's of another
  faction), or, engaged by no captain, have lain out of all their guns' reach for 150 s, as long as they give a chase:
  so a wary ship a player chased into a fight it will not take breaks off, and the fight ends for both. The editor's
  fight ends when its one captain leaves.

## Ranks and factions

Every captain sails for a faction at a rank ([[Enemies Come in Five Ranks, After Destiny]],
[[Enemy Factions Start With the Grey Tithe]], [[Enemies]]): they are named for their faction and their hull, on their plate
and in the panel: the Tithe Sloop, Schooner, Brig or Frigate; a friendly ship fighting for the players the Merchant
Sloop, Schooner, Brig or Frigate. A friendly ship is a Major, always bold, in the hull the traffic gives it
(`Fight::enlist_in`, `Commission::build_in`); every other captain's rank picks their hull ([[Hulls]]): a Minor and a Major sail the Sloop, an Elite the Schooner, a Miniboss the Brig and a Boss
the Frigate. Their rank scales them, a Major at the numbers of the rest of this note:

| Rank | Hull and men | Way | Gun damage | Reload | Aim error | Temper | Runs | Strikes |
|---|---|---|---|---|---|---|---|---|
| Minor | ×0.6 | ×0.9 | ×0.9 | ×1.2 | ×1.3 | by their seed | under 30% | at 25% |
| Major | ×1 | ×1 | ×1 | ×1 | ×1 | by their seed | under 30% | at 25% |
| Elite | ×1.8 | ×1.1 | ×1.1 | ×0.9 | ×0.8 | always bold | under 30% | at 20% |
| Miniboss | ×3 | ×1.2 | ×1.2 | ×0.8 | ×0.7 | always bold | under 15% | at 10% |
| Boss | ×5 | ×1.3 | ×1.3 | ×0.7 | ×0.6 | always bold | never | at 5% |

Their level raises them as a foe's raises it on land
([[A Ship's Level Raises Its Strength, and the Tiers Reach the Sea]], [[Foes]]): their hull, their men and their guns'
harm are the table's times the land's `foe_health_times` at their level, 1.07 a level (×1.31 at level 4, ×6.2 at level
27, `Hostile::strength`, `Captain::raised`); a ship of level 0, as the editor stands one, is the table's. A wary ship
sizes a Sloop up at its raised strength. Their way, reload, aim and when they run and strike stay their rank's.

Their men are as many as their hull makes them (6 to 94, whole men), so hull and men give out in the same proportion at
every rank: a hull hit takes a man or two, and their men give out at about four fifths of their hull, as a Major's do. Their
way pulls their canvas and their oars alike, so a higher rank runs down a lower one, and a Boss outlasts a Minor; two of one
rank keep pace. Aim error scales their lay's long and short, their gunners' misjudgement and their volley's scatter. A captain sees every player's
ship and every afloat, unstruck ship of another faction, and chooses, engages and breaks off with them as with a
player's; they never fight their own faction, and a struck ship is nobody's enemy. Any foe's hit provokes them. Over each
captain's ship in a fight stands their plate, as a foe's ([[Interface]]): their faction's emblem, and their name, with an
Elite's or a Miniboss's mark, above a bar of their hull, red, orange or yellow by rank, their losses read as a foe's;
no plate covers another. A Boss's stands across the top of the screen with their faction's name. Out of a fight, each
other player's ship wears the plate that player wears on land ([[Interface]], "Players").

For a captain, a hull changes the ship's size, its boxes, its sails, its handling, its stem and how many guns it
carries, never its strength: the table above is the whole of it. A player's ship has its hull's class's numbers
instead ([[Shipyard]], "Each hull's numbers"). A bigger box is struck more often, so its canvas and men are its class's
times its rank's times its exposure: the fight's hit share on its box over the Sloop's, from the Sloop's guns at the
duel's 110 m by a captain's gunners (the Schooner 1.44, the Brig 1.65, the Frigate 1.88). Its hull points take it too,
less for a taller hull's hits holing it less often (the Schooner 1.39, the Brig 1.58, the Frigate 1.79), so the same
fire takes as long to make any hull of one rank strike. Its canvas drives it no harder than the Sloop's, so its rank's way alone
sets its speed ([[Sailing]], "The other hulls").
A side's broadside weighs the Sloop's times its rank's gun damage, spread evenly over that side's guns (the Schooner's
five, the Brig's seven, the Frigate's ten across its two gun decks): each ball is the Sloop's, rounded as the Sloop's, and the
ship it strikes takes its share of it, three over the guns a side, carrying the parts of a point or a man until they
make one; its chance to set that ship alight is that share of the Sloop's ball's. So every broadside of one rank takes as
much hull, canvas, men and fire from a ship, whatever hull fires it. Each gun reloads and scatters as the Sloop's. Its
balls fly from its own mouths, a ball meets its own hull's and sails' boxes, and it rams, is rammed and is kept apart
by its own hull's box. A captain sizing up a ship reckons their hit share against that ship's hull.

## How a fight ends

At sea ([[Server]], "The sea"), each a rule the owner chose
([[The Sea's Fights, Waves and Close Views Get a Detailed Pass]]) with Claude's numbers:

- **Sinking, and what floats** (`flotsam.rs`). A captain's ship that goes down lays, where it went, 3 pieces for a
  Minor, 4 a Major, 5 an Elite, 6 a Miniboss and 8 a Boss, for each player who fought it, kept for that player alone as
  a land drop is, within 30 m, drifting downwind at 0.3 m/s and gone after 180 s. A player's ship within 25 m of one of
  their pieces, anywhere along the way it sailed that tick, gathers it. What floats for a player is their account's: dropped and joined again, the pieces still
  floating are theirs again (`Sea::own`), and so is what a fight they fought still owes them (its flotsam, ship XP and
  bounties when a captain goes down), once however often they joined it. A ship drops as one foe of its rank at its
  level does (its water's, raised by the sea's tier), by the gear loop's own law ([[Gear]], "Drops"): the first piece
  laid for each player holds its Vestige by its rank's chance (at Elite or Abyss times the tier's reward, as a harder
  voyage's kill on land, `loot_kill`), an Ammo box by its rank, and from a Miniboss or a Boss an Ammo crate. Every piece
  holds the ship's salvage ([[Ship Power]], "Found"); what the player has no room for is lost with the piece. For an
  Elite or higher one piece of each player's is a chest, its salvage rolled as a ship one rank higher. A piece looks
  like a crate or a barrel (half each by its draw) or a chest.
- **Striking, and boarding.** A Tithe captain who strikes lies hove to with their colours down. For 90 s any player in
  the fight may board the captain's ship: their ship within 30 m of it, both under 2 m/s, and its deck holding a crew.
  With no one aboard by then it is scuttled (`Sinking`) and lays what floats. A struck Tithe captain never sails off
  from the fight. A friendly ship holds no crew for boarders: one that strikes leaves its fight at once, afloat, and
  sails on for its port (`sailed_off`), never held struck nor scuttled. The page tells the player its
  colours are down and to come alongside, naming it ("The Tithe Brig's colours are down: …"); E asks to board it
  when the sea's snapshot says the player may (`may_board`, from `Fights::alongside`, the rule a boarding is taken by;
  the fight's controls let E through), and the sea's line says "Boarders away: the Tithe Brig's crew stands to meet
  them." as the boarder goes from their helm to its deck.
- **Its deck** (`deck_fight.rs`, `sea_decks.rs`). The sea room holds the deck fight, so the one authority over the fight
  knows when the struck ship's deck is won and when the last boarder leaves, and no second room is trusted with it: a
  room on land built as a node's room is, its floor the deck's grid of heights from the ship's hull's manifest (in the
  ship's own frame, a wall off its planks), its ring the deck's bounds, its spawns at the ship's rails amidships, half a
  metre in from its outermost plank (`rail_spot`; at its helm where no plank lies across its middle). A boarder comes
  over its rail on the side their own ship lies, clear of its masts (which stand on its middle line), facing its bow and
  its crew; one who falls lies until an ally revives them, standing where they lay, or they respawn, standing at the
  rail nearest ([[Revives]]). So the land combat runs unchanged on its deck, with each
  boarder's character. Its crew is its faction's deck types for its rank (`foes::crews`): a Minor three Minors; a Major
  four, the Bosun a Major; an Elite five, the Bosun an Elite; a Miniboss six, the Tithe-Mate the Miniboss; a Boss
  Captain Brannoc Thule and six. The plain hands are the Grey Tithe's skirmisher, swordsman and shot in turn (the
  Deckhand, Hookman and Pistoleer),
  standing two abreast along its deck from 2 m forward of amidships, 1.6 m apart, facing aft, at its level. Its deck
  room takes the sea's tier, so its crew's kills pay XP and Aurem as a harder voyage's; they drop no Vestige or item, as
  the hold is the boarding's loot. Clearing its deck opens its hold: what floats, twice over, for each boarder, every
  chest's salvage a rank higher still, and its drop what a foe one rank above the ship would leave; on top of the lot
  every player who fought it takes when it is scuttled. A boarder leaves its deck (back aboard their own ship) once its
  crew has fallen, and a minute after it fell every boarder still aboard is sent back; it is scuttled when the last one
  has left it. A boarder's own ship takes no orders or course while they stand on the struck ship's deck: as they board,
  its helm, brace and lay let go and its sails are furled, so it drifts to a stop beside the struck ship; as they come back aboard, its sails are set again
  at the rung they stood at when they boarded. Its deck room
  fights with the boarder's character, the real one even when the accounts answer after boarding, and gives it back with
  what was won aboard. The sea's snapshot carries each deck to its boarders alone: their numbers there, the ship's hull,
  its deck room's own snapshot, and the ticks its won deck holds them yet; their gear while aboard is its deck room's,
  at the sea's minute, sent through the sea's link, and the sea's once more as they step off; and every boarder's dress
  is sent again as each one comes over its side, who had no welcome to bring it.
- **The fight on a struck deck, on the page** (`deckBoarding.ts`, `deckFight.ts`). Once the sea says the player stands on
  the struck ship's deck, the page plays on foot there exactly as on land: the same `Foot`, controls, first and third person,
  display, bars and marks, its crew drawn as the land's foes and the other boarders as players. Its link is the sea's:
  land inputs sent through it, which the room hands to the ship's deck room, and each of its deck room's snapshots handed on
  from the sea's (`SeaRoom.hearDeck`). The page predicts on the deck's grid of heights by the movement crate and the fight's
  rules (`fighter_heights`), as the room steps it. Everything on the deck is in the ship's own frame, laid into the world as
  the ship lies in the fight (the captain nearest where it lay, its heading, heave, pitch and roll): figures by
  `deckToWorld`, the camera's eye riding it and level, and the marks, arcs, blood and display through the deck's turn
  (`deckTurn`) after the world camera's matrix. The third-person camera keeps a clear line to the boarder past its
  masts, booms, gaffs and yards, and stays inboard of its sides (`spars.ts`: boxes from its manifest's sails, and walls
  past its outermost plank on each row and across its bow and stern, for the camera alone), pulling in as on land its
  does off walls. In first person no other figure's card stands nearer the eye than a metre, so a foe in a melee never
  fills the view (`cardStand`'s `nearest`, on land too). While the deck holds the player the fight's keys and
  pointer are the foot's.
  Won, the display says "Its deck is yours" over its hold's take as the room laid it ("Its hold: 2 crates, a chest"),
  and the keys begin "E back aboard your ship · 45 s left"; E or the minute's end, the room has the boarder
  back at their own ship's helm and the view is the sea's fight's again. Beaten, they wash up (below). On its deck
  every key but E, Enter (respawn), the menu's and Escape is the fight's on foot.
- **Losing.** A player whose ship goes down, or who is beaten on a deck with no boarder left standing there, washes
  up at the port city nearest by the sea's way round land (`world::traffic::SeaWays`, on the traffic's sea mask: one
  search from every port when the room opens gives each cell of open water its nearest, so asking is a lookup): on foot in its social space, their ship moored at its roadstead at rest, a sunk one with 10% of its hull, 25%
  of its canvas and half its men, a beaten boarder's with the hurts it had (a sunk ship's if it is going down). A
  player who leaves the sea mid-fight is kept as the fight has them, less the hands who fell on a deck they leave
  from, and at the port city they would wash up at; one who
  leaves under a third of their ship's hull is kept as sunk (`LEFT_AS_SUNK`). Every boarder of a deck lost is let go of the
  fight, and the struck ship is scuttled with no one aboard; a captain going down or struck in a fight its last player left (gone,
  or gone down) goes down all the same, laying what floats for those who fought it. The page says washing up one way, in its notice and on the
  veil alike: "Your ship went down: you washed up at Sunspire; your ship lies at its roadstead."
- **The sea's minute.** The sea holds the Unix minute its host sets (`Sea::minute`, through `set_minute` as a room on
  land takes it). The bounties count the captains' ships sunk or taken in the sea room itself, once the activities
  branch lands; until then a ship gone down is told to no host.
- **Kept damage.** A player's ship's hull, canvas and men are kept as shares of whole, with their berth at sea and in
  their character (`ship`, in ten-thousandths), across sessions, until repaired; it starts every fight with them, and
  its voyage sails at its pace times the canvas it keeps (never under half), in the room and the page alike. Where
  the sea last kept it is kept too (`ship_at`, to the metre, and `ship_heading`, in thousandths of a radian; none for
  a ship left mid-fight, which lies at a port): back at sea it lies there, turned as it lay, whatever the page first
  said, and the page is told (`MOORED`). The sea sails no course of the ship's before the accounts have answered for the player's
  character: a course asked meanwhile waits, and sails once they answer with none kept (or the page sends an input
  before its token); given back later, even mid-fight, the ship is moored where it was kept, that fight over for it. A fight's waters run past the world's
  edge, but the ship is kept within it: where the fight has it, where it washes up and where its next course starts.
  What changes the player's character at sea (a piece gathered, a fight's hurts, a repair done or stopped, washing up) is sent
  to the player as their gear, five times a second at most, and so saved within 2 s ([[Accounts]]).
- **Repair** (`harbour.rs`). Within 3 km of a port city's roadstead, at rest and out of a fight, Manage offers
  "Repair: free, lying at rest within 3 km of a port city" (R; the reach is the rules', from the waters' table): free, the ship is made whole evenly over a second for each hundredth it is missing (the most of hull, canvas
  and men), 100 s at most. Setting a course, heaving to for a fight or leaving the sea stops it where it stood.
- **Its weather.** Each fight at sea, and each fight among captains alone (`clash.rs`), takes the swell and the wind
  where and when it began (`sea_weather.rs`, sheltered by the coasts and calm by the port cities' roadsteads) and
  keeps them while it lasts; a player joining it fights in its weather, a fight among captains a player came on keeps
  its own, and what floats drifts down the wind of the fight it came from.
- **Many in a fight** (`battle.rs`). Any player not fighting and not in Overlook's home waters who comes within 750 m of a ship of a fight joins it, a
  fight with players in it too, their ship hove to under a number of their own; every player in it fights every
  captain, and players never harm one another (a ball passes through a ship of its own flag). A hostile ship at sea
  within 750 m of a fight joins it on its own side, under sail where it lay: it fights players and captains of other
  factions. Each player sees the fight from their own ship: their view numbers it as the player's and the fight's first
  captain as its captain. A player whose ship goes down leaves it; when its last captain has left it, its players sail
  on from where it left them, each keeping their hurts. Everyone in it is told who joins.
- **Wary captains** fall on a ship they outgun, by DFO's `takesPrize` (`navalAI.js`: "a wary one only a prize she
  outguns WARY_ODDS to one, or one crippled or holed under GRAPPLE_HULL", `WARY_ODDS = 1.25`, `GRAPPLE_HULL = 0.35`):
  in a fight by their own mind, and at sea a wary ship steers for a player not fighting in its sight whose Sloop it
  would take as the Sloop's kept hull leaves it (`come_for`), and meets them within 750 m (`wary_takes`), never in
  Overlook's home waters.
- **What a player is told** goes to that player alone: the sea's snapshot is cut for each player, what floats, kept
  hurts, the sea's own messages and a deck's own snapshot reaching only those they are for.

## Ramming

DFO's law of the ram. A player's stem, 1 m above its ship's waterline at its bow, strikes the hull of a ship of another flag
it comes within 1.2 m of, at the face it stands farthest outside of: that ship's side, or its bow or stern. It rams when the
rammer's way along its keel, at the most over the last 0.6 s, closes on that face at 1.6 m/s or more.

- **The blow** is half again DFO's 0.15 of the lesser of the two whole hulls (`FIGHT_HARM`), times the closing way
  over 8 m/s (never more than whole), and 0.4 of that into the bow or stern. It never takes the struck hull under a
  quarter, where that ship strikes: a ram brings a ship to strike and no further. It takes a man for every 40 points it deals, over its men's toughness, by a roll
  drawn from the fight's stream.
- **The recoil**: the rammer takes 0.6 of the blow back (half that braced), and a ram is only as hard as the rammer can pay
  for within its own room over its line, one point short of it, so its own ram never makes it strike and a hull at its
  line rams nothing. A ship going down rams nothing.
- **One ram a tick** for each player, none on the same ship again within 3 s, and the rammer's remembered way is spent on it.
  A ram provokes the captain struck. Captains do not ram.
- **Hulls kept apart.** Two hulls whose boxes overlap on the flat are each pushed out half the overlap, and each loses
  the share of its way that drove squarely into it. A hull that half would ground, as the ground refuses a ship's own
  move, stays where it is, losing that way all the same, and the other takes the whole push where that leaves it
  afloat, so no ship is pressed onto a coast it could not then sail off. DFO kept the player's own boat apart by Come Sail Away's sweep;
  here every ship is pushed alike, so the room can do it.

For the owner's Sloop and the Tithe Sloop, a ram at 8 m/s into its side deals 36 and costs the rammer 22; six from
whole bring the Tithe Sloop to strike.

## In the World Editor

The editor sails the Sloop, or the hull its address names (`?hull=schooner`, `brig` or `frigate`), as that hull's
rules and drawing. While sailing, `F` calls a Grey Tithe captain, a Major in their Sloop, onto the ring 650 to 1000 m
round the ship, where the water floats it, heading across its waters on a slant; `F` again sends the captain off. The
fight then steps the ship in its helm's place. Holding the right mouse aims as the game's fight does ("The aim, as DFO's"): the camera goes round to
the battery's eye aboard on the side looked at and looks off it at the lay, and a drag up or down lays the range, unless the view's
middle is on the captain's ship: then the guns are laid on the point it meets. Letting go fires the lay held; a
left click holds fire, the wheel changes shot, `C` braces, and `Shift` bursts.

The captain's ship is drawn in their hull and their faction's colours ([[Sailing]], "Its look"), and the water cuts its footprint
as it does the player's. The balls are small lit spheres, the lay is drawn over the water as the game's fight draws
it, and the fight looks as "How it looks" says. The player's own hull, canvas, crew and guns are the readout's plate and ship's bar,
beside the card and the tally, as at sea ("How it looks", "The readout"). The panel shows a line for each captain
within 400 m (nearest first, their mode in plain words: closing, cruising, running, struck, going down), DFO's messages naming each ship by
its own name, and "Broadside from the Tithe Brig: C to brace." for the nearest captain whose guns stand run out. A
captain is sighted in the voyage's one sentence: "A Tithe Sloop sighted, 1.0 km off.". Each arc of the lay starts
where its ball leaves, a ripple after the gun before it and carried on by the Sloop's way, and runs only to where that ball
stops. The panel reads "Laying the ... guns: on target." only when an unscattered ball strikes the captain's ship and that side can
fire.

## How it looks

Only the look of it: the rules say what happened, in the fight's events and its view, and `FightFeel` turns each into
puffs (`Effects`, after DFO's `navalEffects.js`), harm kept on the ship it struck (`ShipHarm`, on its rig), flotsam,
sounds and, on the player's own ship, jars of the eye. Smoke, spray and foam are soft round puffs blended over what
is behind them, smoke swelling as it thins and carried by a 4 m/s wind; flash, flame, embers and glints are light
added unlit; splinters, shreds and planks are solid and lit. The puffs are drawn after the water, far to near, hidden
where the scene stands nearer (`puffView.ts`), at most 2,048 a frame, the nearest kept, and fading softly to nothing
over the last 2.5 to 0.3 m to the eye (`nearFade.ts`), as the fires' smoke does; their floats are written each frame
into arrays the view keeps (`PuffScratch`), so laying them makes nothing new. Each glow gives its stepped halo through
the light layer, as the land's bright things do. DFO's lights on the hulls round a flash (26 m for 0.12 s) or a burning ship (16 m, three at
most) are kept as the effects' `light` marks but not drawn: the ships' shader takes no point lights yet, and the
light layer drew their whole reach as a disc over the sky and sea. At most 900 puffs
live at once; past that, spray, foam and glints go first, then splinters, shreds and embers, then flashes and planks,
and smoke last.
The view's own numbers stand in where no event says more: a ship's canvas's share left holes its sails, a ship `struck`
lowers its colours and one `sinking` goes down.

The room's own events (`SailLost`, `MastFell`, `Struck`, `Sinking`, `Flotsam`, `Gathered`, `Boarding`) reach the feel
by their own names through one mapping (`feelOf`, `rules/feelEvents.ts`, which every layer may read), on every fight path: the sea room's view, the fleet room's
snapshot (whose events carry the sea's kinds after its own, 12 to 19) and the World Editor's fight. A ball's `Splash`
and `Hit` come with its shot's own events, the hit carrying where on the ship it struck in its frame and the part. Each
ship's harm is kept by the number the events name it by: at sea the player is 0, the first captain 1, and each other
captain's number comes with them in the view, so one leaving the fight never moves another's holes onto their ship.
A captain is hostile to the player in the view when it is not of the players' side, whichever ship it marks now: a
Tithe ship fighting a friendly one is the player's foe for the compass, the music, the broadside warning and the card,
and a friendly ship never is. The first captain keeps its place in the view once it has left the fight, but no longer
as hostile to the player, so the task does not count it among the ships left to beat.

- **A gun fired** (`muzzle`): a bloom at its mouth for 0.11 s and a tongue of fire along the shot, its light, and
  eight puffs of powder smoke that roll out down the shot, slow to the wind and hang as a bank down the ship's side 9 to
  14 s, swelling to 6 to 10 m across as they thin; a gun of the player's own ship jars the eye (1.1).
- **A ball in flight** keeps its sphere and leaves a faint grey trail, a puff every 0.04 s that lasts half a second,
  carried off on the wind as the guns' smoke is.
  A ball coming within 8 m of the player's hull whistles once where it passed; one of the player's going out never does.
- **A ball in the water** (`Splash`): a column of spray thrown up and falling back, a spout of a few drops nearly
  straight up over it (10 m/s, a heavy ball's 14), and a ring of foam spreading flat on the water for 2.4 s (a heavy
  ball's larger, 3.2 s); a push on the water's ripples ([[Water]], "In the water"). A fall within 6 m of the player's hull
  throws a sheet of its water over the rail toward the deck and rocks the eye, the more the nearer (0.7 at the ship's side).
- **A hit** (`Hit`, its point in the struck ship's frame and the part struck; until the rules send them, the world point turned into
  its frame and the zone): on its hull, ten splinters, most of its side's paint, thrown out and falling to the water,
  a puff of smoke and a small flash, and a ragged hole, a dark middle in a rim of splintered raw timber that reads on
  any paint, stays there for the fight; a hole below its waterline also leaves two planks afloat for some 18 s. On a
  sail (a rig hit within 1.5 m of a cell of canvas), that cell is shot through for good, with nine pale scraps
  fluttering down; elsewhere in its rig, a burst of splinters at the spar. A ram's stem throws its splinters but leaves
  no hole. A ball striking the player's own ship jars the eye (1.6, a hole 2.5) and tells the side it came from.
- **Torn sails**: a ship's sails' holes grow with its canvas's harm ([[Sailing]], "Its sails"). A sail torn away
  (`SailLost`) rips from its yard, head first, falls to leeward over the ship's side onto the water, and floats there 40 s
  as the ship sails on from it before it sinks. A fallen mast (`MastFell`) leans over the ship's leeward side with its yards and
  sails, slowly then fast, for 3 s until its head is in the water, then drifts astern and is gone after 40 s.
- **Fire**: unlit flames, embers rising and gouts of dark smoke up from the ship's deck, along a third of its length, for
  each fire the view gives it.
- **Run out**: a captain's battery running out glints at four ports along each side run out, about thirty flickers a
  second, while their guns stand out.
- **Battered**: under three fifths of its hull, the player's ship smokes grey along its deck, more as it is hurt.
- **Its people** (`seaCombat.ts` `ships`, `ships/shipCrew.ts`): each captain's ship carries its captain at its wheel
  and its hands about its deck ([[Game]], "At sea"), as many of its hull's hands as its men left of its whole, one at
  least while any are. Struck, its hands stay and its captain steps off the wheel, about a metre to port and a little
  forward on the wheel's own level, looking out the way they stepped; going down or gone, no one is seen aboard. While
  a side stands run out, half the hands seen (rounded up) walk to that side's guns on the deck they walk, one a gun
  fore to aft, and stand there facing out; run in, they walk on. The ship whose deck the player stands on shows none:
  its crew there is the fight on foot's.
- **Struck** (`Struck`): the ship's flag comes down its mast in 4 s to a metre over its foot and is gone.
- **Sinking** (`Sinking`): over 20 s the ship is drawn in the pose the rules send (their `founder`: it lists up to 32
  degrees to the side its seed says, trims 20 degrees by one end, settles slowly and then plunges), the page adding
  none of its own; from halfway down until 8 s after, rings of foam and the air boiling up in drops fill the water over
  its length. A ship going down afire blows its magazine at 55% of the time, 1.5 to 4.5 s in, decided by its own
  number and the room's tick it began going down, so everyone in the fight sees the same: a fireball, a column of
  smoke, splinters and a big splash, jarring the eye 2.4 at its side and less to none at 160 m. Its flotsam (`Flotsam`:
  crates, barrels and a chest, which the rules lay) rides the swell the water draws where it lies (bobbing 0.12 m every
  4 s where the page draws none), drawn at the size the view draws ships and lit and shadowed as the land is, each
  under a gold mark 2.5 m over it that stands as large on the screen at any distance (some ten pixels across at the
  fight's camera), until gathered (`Gathered`: a ring of gold glints rises from it and a little water is thrown up)
  or the fight is over.
- **Sounds**: each plays the game's own recording where it has one, over DFO's sea distances (full within the first,
  gone past the second, metres): a gun fired `ship.cannon` (30, 2400), heard past 260 m as the far roll
  `ship.cannon-far` (70, 3000) crossfaded over 60 m either side and played once a volley; a ball striking a ship
  `ship.hit` (16, 1000); a magazine `ship.blast` (26, 1800); a boarding's grapnels `ship.grapple` (6, 240); a captain
  running out `ship.runout` (24, 900); a side of the player's come ready `ship.ready` (10, 80); a ship going down
  `ship.sinking` (18, 420); a ball going by the player's ship `ship.whistle` (8, 90); a ball in the water `shot.splash` (12, 600).
  Each `ship.` cue plays the owner's Freesound pick
  ([[Every Sound Comes From Freesound, and the Music Rests Between Pieces]]), the sinking the sea's break-up; each is
  silent until its recording has come.
- **The eye's jars** (`shake.ts`): each swells over 0.3 s and dies away over 0.5 s, moving the eye up to 0.15 m and
  turning it up to a degree a unit of jar, the jars at once added together.
- **The readout** (drawn by `combat/seaReadout.ts` from `plus/seaFight.ts`'s words, fed by `ships/fightDisplay.ts`,
  shown by the HUD at sea and over the World Editor's view): the Sloop's plate at the top left (its hull, canvas and
  crew, and whether it burns); its abilities at the bottom left, where the Arts stand on foot ([[A Ship's Abilities Stand at the Bottom Left, as the Arts Do]]), each in a ring over its
  key (each broadside's reload, the side laid glowing gold, the burst, the brace and the shot loaded); the card under
  the compass on the ship the look is on (the captain nearest where the Sloop's laid guns fall, else the nearest), and its volley's tally under the sight, in every fight from its first frame to its
  last ([[Interface]], "The sea fight's readout"). The panel leaves the Sloop's own hurts and guns to it. While a hostile captain afloat
  stands with a battery run out at the Sloop, the broadside warning stands directly under the card (under the compass while none shows), never over the sight or the ship aimed at, written over the sea with no panel and few words: BROADSIDE, the tell burning as a fuse, and the brace by its key ([[Interface]], "The broadside warning"; [[The Broadside Warning Is Written Over the Sea, Not a Panel]], and the compass's mark of every captain with a battery run out at the Sloop is lit. At
  sea the panel's lines are not written over the world: each captain's hurts are its plate and the card, the lay the
  sight's aim line and the broadside the warning, and DFO's messages ("The Tithe Sloop surrenders!") stand as notices
  at the top right; the hints are the fight's keys alone. On a struck ship's deck it gives way to the fight on foot's
  display.
- **From above**: at the raised view, where the ships are drawn larger ([[Overworld]]), every puff, ball, hole and
  piece of flotsam is drawn as many times larger about the point it came from, as the wakes are, so the fight reads
  from there; close in, all are their true size. The sea's splashes push its ripples as wide.

## At sea

The sea room ([[Server]]) sails hostile ships among the players' on the [[Overworld]]: DFO's director, trimmed to
the Grey Tithe's ships alone ([[Pirates Are Replaced by the Grey Tithe]]). A ship lying parked while its player is
ashore ([[Server]], "Parked ships") is out of play: no hostile ship sights, chases or meets it.

- **The Harbourmaster's hulk** (`sea_lessons.rs`): a captain on the opening's gunnery lesson who sails within 900 m of
  the struck Tithe Sloop moored off Overlook is put into a fight of their own with it, as one met at sea is: it lies
  hove to, fires nothing, is never scuttled nor boarded, leaves the fight once they are 1,500 m off it (900 m once
  their ball is in), and lays and pays nothing as it goes down ([[Quests]], "The lessons").

- **Who comes.** Each player at sea rolls half a minute after reaching the water and then every 30 to 70 s
  ([[Hostile Ships and Islands Show on the Sea Map, Travel Goes Anywhere at Sea, and Home Waters End 10 km Out]]); a roll that
  falls due while they fight comes as the fight ends. Every travel, in the ship's own water or to another, waits the next roll at least half a
  minute, never sooner than it would have come, so travelling on brings no more ships than sailing. While fewer than three hostile ships sail within their sight of
  them, a roll brings a hostile ship by the band of the water the player is in, so their water sets how many come
  (`hostile_chance`): 0.18 in the first island's band (1 to 4), rising evenly by 0.0225 a band to 0.36 in the last (26
  to 30); a water with no band rolls as the first. (DFO's open sea brought one 0.24 of the time in every water.)
  The water at the player's ship decides who comes ([[The Waters Come From the Islands]], [[World Map]], "Waters"):
  none in Overlook's home waters, within 10 km of its coast (the roll is spent), a Tithe ship in every other, the
  Lantern Sea past them and the Lattice's waters too
  ([[The Ruined Cities' Waters Are the Lattice's, and Their Ruins Are Overtaken]]). Its rank comes by the lowest level of its water's band:

  | Band starts at | Minor | Major | Elite | Miniboss |
  |---|---|---|---|---|
  | 1 (and none) | 0.50 | 0.40 | 0.10 | 0 |
  | 4 | 0.34 | 0.44 | 0.22 | 0 |
  | 7 | 0.30 | 0.47 | 0.23 | 0 |
  | 10 | 0.27 | 0.49 | 0.24 | 0 |
  | 13 | 0.25 | 0.45 | 0.25 | 0.05 |
  | 16 | 0.20 | 0.45 | 0.27 | 0.08 |
  | 19 | 0.15 | 0.45 | 0.30 | 0.10 |
  | 22 | 0.13 | 0.43 | 0.32 | 0.12 |
  | 26 | 0.10 | 0.40 | 0.35 | 0.15 |

  A row for each island's band, each rank moving one way from band to band (Minors fewer, Elites and Minibosses
  more); the rows at 16 and 22 lie evenly between those beside them, and those at 4, 7 and 10 send few enough Minors
  and enough Elites that an hour at sea keeps within the band from level 5
  ([[The Sea and the Abyss Run Again Are Retuned Into the Band]], [[Activities]], "The band").

  No Boss comes by a roll: the Boss Frigate sails only at the Grey Tithe's sea strike, which is not built. Its level is
  drawn evenly from the band, as a garrison foe's is, and raised by the sea's tier as a foe's on land: two levels in an
  Elite sea, three in an Abyss one (`Difficulty::raise`), the ranks that come the same. A host sets a sea's tier as its
  sets a node's room's (`Sea::set_difficulty`, the door's `room_difficulty`); the server opens one sea, at Normal.
  Its level raises its strength
  in a fight (above, "Ranks and factions"). Its faction and rank are drawn as it comes and kept on it
  (`sighting.rs`). The rolls wait real seconds, and
  are drawn from a seed the sea takes as it opens (the server's from the runtime's random numbers, the game's worker's from its
  own), so each sea sends its ships in an order of its own, as DFO draws its rolls.
- **Sight.** A ship is sighted from `max(5 000 m, 30 s × (12 + 2.4) m/s × pace)` of a player, their voyage's pace (at
  rest counted as 1): 5 km at the helm, 8.6 km at ×20, 25.9 km at ×60, 43.2 km at ×100 and 86.4 km at ×200, so one
  met head-on stays in sight half a minute and more. Each keeps the largest sight it has been given, from the pace of
  the player nearest it, and goes once no player past home waters is within 1.1 times it.
- **Where.** Between 0.9 and 1 of its sight out from the player, within 60 degrees of their heading while under way and
  anywhere at rest; a bold ship, under way above ×10, within its meeting cone off their course shrunk to 0.8 of it
  (`meeting_arc`), no nearer than 450 m to any player, where open water lies between and out of home waters. Of the
  ten tries that fit, it takes the one nearest a friendly lane (a leg of a route between the port cities,
  `world::traffic`) within 50 km, heading along it the way nearer its slant toward the player; with no lane that near,
  the one nearest a coast, heading across the player's waters on a slant. A hostile ship sails at the Sloop's 2.4 m/s times its rank's way (Minor 0.9, Major 1, Elite 1.1,
  Miniboss 1.2). Blocked by land or the edge of home waters, which no hostile ship enters (one a clash left inside them takes
  only steps away from their coast, so it sails out), it takes the open heading nearest its last, a twenty-fourth of a turn at a time
  either way, so it follows the coast round; with none open it goes about. Its temper is its
  seed's: an Elite and a Miniboss are always bold, any other one in four.
- **Home waters end a fight.** Every captain afloat and unstruck in a fight whose players all lie inside home waters
  breaks off and leaves it, as one out of reach does ([[Home Waters Shelter Fully, Islands Keep Clear of the Lanes, and Travel Fades Out and In]]).
- **Coming for the player.** A bold ship that has sighted a player who is not fighting and not in home waters comes
  for them (`come_for`; home waters shelter a player whole, [[Home Waters Shelter Fully, Islands Keep Clear of the Lanes, and Travel Fades Out and In]]):
  it steers to intercept, heading to where their ship will be when it can reach it at its way on that player's
  clock (lead pursuit; straight at them where it cannot reach them, as when they sail away faster), turning at most
  at a Sloop's helm rate, 10 degrees a second of its clock. It keeps after the one it came for while they stay in
  its sight and out of a fight, until it meets them (750 m) or loses them. A wary ship keeps its own course: the
  player may chase it, evade it or let it pass. On the voyage's clock a hostile ship sails at a fifth of the player's ship's way (a
  Major; 0.18 to 0.24 by rank), so it can meet a ship holding its course only from within the cone sin(angle) <= its way / 12 m/s off it
  (11.5 degrees for a Major); lead pursuit cannot widen it. So a bold ship comes there (above, "Where"), and a player
  who holds their course meets it, one who turns away evades it, until it loses them. The voyage's hold keeps its
  own law as it comes near along the way.
- **The chase.** A player who chases a ship (the page tells the room whom, `Sea::chase`) and comes within 750 m of it
  begins the fight with it whatever its temper (outside home waters), as a bold ship that meets a player does; a wary
  one runs as captains run. The room lets go of the chase once it has left the sea.
- **Its clock.** As DFO's sea keeps the world's time, a hostile ship sails on the clock of the player nearest it past
  home waters, who keeps it at sea (a player inside them sets neither its clock nor its sight): their
  voyage's pace as it is held (144 m/s at ×60), the world's own while they lie at rest, and real time where another
  player sails within 1.2 km of that one, a shared sea.
- **The voyage held.** As DFO holds a fast journey, a voyage eases down as a hostile ship comes near along its way: its
  pace is capped so the player takes 0.6 s of real time or more to reach its sight (750 m), closing at their ship's 12
  m/s and the fastest rank's 2.88, down DFO's ladder by fives, never under ×5. The player's way is judged along every leg of their course they would
  sail through that tick at their own pace, so no turn of a course slips past it. Within 700 m of a hostile ship that
  would engage this player (bold, chased by them, one `wary_takes` would fall on their ship, or one in a clash, which a
  player in sight joins), it is held to ×1, the world's own time (`threat.rs`, `holds`); a wary ship
  that will not engage caps the pace by the ladder alone. A ship in Overlook's home waters is neither held nor slowed
  by any hostile ship, as none meets it there. The room sails
  each ship at that pace and sends it as the ship's pace; the page sails its own at the room's pace, drawn to where the room
  has it, and the voyage's line says it is held.
- **A Tithe ship attacks a friendly ship** (`friendlies.rs`, `clash.rs`). A bold Tithe ship within 750 m of a friendly
  ship of the traffic under way (not lying at its berth, its id not taken), or of one sailing on off its route,
  attacks the nearest: both leave the sea and fight there with no player, on the fight of many ships, which the room
  steps each tick. The friendly ship fights for the players: the players' faction at Major, in the hull the traffic
  gives it, at the Tithe ship's level and sight. Its traffic id is taken until its voyage would have ended (the rest of
  its way at 60 m/s, and its 600 s at its berth), so the page draws it once. Each ship stays where the fight has
  it, and the snapshot shows it there, the friendly one among the friendly ships. The fight lasts while either fights
  on; then one who struck, sank or runs leaves the sea, a Tithe ship that won sails on as hostile ships do, and a
  friendly ship afloat (at once, one that strikes) sails on for its route's far port at the traffic's 5 m/s by what
  is left of its route (back to its leg first, then corner by corner), round any coast in its way, home waters or not, kept while a player is within 1.1 times its sight and gone at its port or once none is. Two that
  parted meet again only once they have been 750 m apart. None meets a friendly ship lying in Overlook's home waters,
  which hold no hostile ship. A fight with no ship a player past home waters keeps at sea leaves the sea, as a ship does. Two Tithe
  ships never meet.
- **Joining.** A player not fighting, and not in Overlook's home waters, who comes within 750 m of any ship of such a fight, or of a fight with players in
  it, joins it: their ship heaves to there and is put into it with the hurts it keeps, beside the friendly ship, and
  its captains choose whom to fight by their own law, the one each fights reckoned nearer ("How a fight ends"). It is
  won once every Tithe ship is beaten: each pays as a Tithe ship beaten, nothing is paid or lost for the friendly ship
  (`SeaFight::friends`), and one sunk lays nothing that floats. Afloat as the fight ends, it sails on for its port.
- **The meeting.** A bold ship within 750 m of a player who is not fighting, and not in Overlook's home waters, meets
  them: it leaves the sea and the fight begins with it where it lay, under sail, and the player's ship hove to
  (`Fight::meet`). The room steps it each tick by the players' orders on the fight of many ships (a press, the fire,
  a load, a climb or a burst, is kept until a step uses it, however many orders come in the tick), so the Sloop's stem
  may ram the captain's, on waters made from the coasts (open sea, the swell on it, dry land on them), until every
  captain has sunk or gone; its last view is shown once, in the next snapshot however many ticks the room caught up before it (`Fights::sent`),
  and the players sail on from where it left them, keeping their
  hurts.
- **In the game** the view pans down over 1.5 s from the raised sea to their ship, every ship easing on the way from
  the size the sea draws it to its true size as on the sea's other views near the Sloop ([[Game]], "At sea"); the fight is
  the World Editor's (its look and lay, effects and panel), its controls A and D, W and S, the right button to aim and
  let go to fire, a left click to hold fire, the wheel for the load while aiming and the camera's zoom otherwise, C to
  brace, and Shift to burst; the sea's own wait for its end, and the ship's console is hidden. Where the editor's panel lists its lines,
  the game's HUD shows the fight's readout, its task in the tracker and DFO's messages as notices ([[Interface]]).
  Every captain in it is drawn with their name over a bar of their hull, their plate as far over their highest sail as the
  Sloop's stands over its own (`plateOverM`). Then the view pans back up. Hostile ships at sea
  are drawn as the Overworld's ships are, each in its hull and its faction's colours with its footprint on the water, those fighting each other where
  the room has them. A ship that comes into view is drawn under the sails it sails by, already set (`seaShips.ts`).

## The aim, as DFO's

The owner: the sea fight looks and aims as DFO's does ([[The Sea Fight Looks and Aims as DFO's Does]]), but for the
eye's station and where it looks, which follow Black Flag ([[Aiming a Ship Follows Black Flag, From Its Deck]]). Ported from
DFO's `aimCamera.js`, `navalRender.js`, `navalHud.js`, `navalLoads.js` and `seaZoom.js`:

- **The side** is the one the camera looks toward as the aim is taken, the nearer one even over the bow or the stern,
  and it is held until the aim is let go ([[A Held Aim Keeps the Camera on Its Side]]). Taken again on the other side,
  the view eases home first and then to the other battery, never across the ship. Between the camera's own place and
  the battery the eye goes out to one distance that clears its hull and every sail's swing all the way round, and 0.6 m
  over and under each, felt every 5° and every half metre of its climb or drop (`roundShip`), round at that distance
  the shorter way to a point abeam of its station at its height, and then straight in over the rail, square to the side
  (`wayAboard`).
- **The eye** (`AimCamera`) eases over DFO's 0.22 s, smoothstepped, to its battery's station (`aimStation`), aboard as
  Black Flag's is: over its own deck, its rail and guns along the foot of the view
  ([[Captains Lay Gun by Gun, and Each Ship's Aim Follows Its Guns]]). Each hull's station is searched for once a page
  (and as a sea fight opens), its spots tried best first: within 4 m of its battery's ends, where no canvas comes
  within a metre in any wind from ahead round to astern on either side, its sails set and trimmed as its rig trims
  them (`byCanvas`: the canvas itself, so a square yard braced round its mast sweeps a wedge, not the box its swing
  spans), nor within 0.8 m of a mast 0.4 m thick each side of its line, its way in from abeam passing through no sail;
  2 m over the deck at best (a sailor's eye, under a square course's foot), 1.7 m at least, 0.4 m over its rail, its
  rail's top at least 10° under the look to the water at its guns' nearest lay, so the rail stands at the foot of the
  view (the rail read as the highest its deck stands within 2.5 m along its keel: the deck's grid holds where a body
  stands, so a bulwark shows in it only by its posts); by its battery's middle, out toward the side laid at three
  quarters of its half beam at best, so its masts' canvas keeps out of the view. Each stands within half a metre of
  its guns' middle: the Sloop's 1.6 m forward of its mast, 2 m out; the Schooner's between its masts, 2.9 m out; the
  Brig's between its masts, 3.6 m out and 1.2 m over its rail; the Frigate's forward of its mainmast, 4.3 m out and
  0.9 m over its rail. A hull whose rig left no such spot would
  keep an eye 1.5 m out past its side, clear of its sails' swing. It rides the ship as drawn, its heave, pitch and heel (the story's Brig on the story's
  swell), from the same answer of the rules the frame draws the ship from, so the ship holds still in the view however
  unevenly the answers come; the view itself stays level, and narrows 15% as it eases in (`AIM_ZOOM`) in the sea's fights and the
  story's. Once it is there, no way round is looked for again, however the ship heels. A sinking ship's guns are silent:
  its eye never moves.
- **Where it looks**: off the side, at the water its guns are laid on square off its battery's middle, so the crosshair at the view's middle
  stands on the landing zone. A drag left or right does nothing while the aim is held; a drag up or down lays the
  guns farther or nearer, the range read from the drag as DFO's lookReach reads a look from the eye's height (where
  it meets the water, then on at 30 m a degree past the dip, up to 0.15 rad over the horizon), and the view pitched
  down to that point. The range is held between the guns' nearest (their lowest elevation, -10°, from their mouths,
  or, while the rules answer that the guns stand there, where their balls fall as the ship lies now, which a crest
  under it carries farther: `laidNearest`) and their longest throw from where they leave. The rules lay where the
  view's middle meets the water, so the landing zone stands under the crosshair. The view turns along the keel so
  its middle stands over the volley's fall (`laidAlong`): the ship's own way the balls carry, and a look grazing the
  swell that meets a crest short of the range asked (read from the lay's ends, eased over 0.25 s so a late answer
  never jerks it). Measured on the rules' swell, the fall stands within a few pixels of the crosshair on a 1080-line
  screen, settled (`seaAim.test.ts`). The
  look's ray runs from the eye along the view's middle, so a ship under the crosshair is laid on. Let go, the camera
  goes on round the ship looking the way the aim looked, so it eases home without a swing; out of the aim the orbit
  keeps its own clamp, 0.05 to 1.2 rad down.
- **The fight's camera** stands back from the ship's middle, 6 m over its waterline, at least as far as clears every
  part of the ship its look back passes through (`orbitClearance`): its hull's box and each sail's box as far as it
  swings, and 2 m more; the wheel's zoom goes no nearer. Swung fast, it eases out only that last metre: it never
  stands nearer than a metre clear.
- **The sight** (`seaSight.ts`): a crosshair at the view's middle while aiming, in the sea's fights and the story's,
  and under it DFO's aim line at the face's 11 px (DFO's 13) in
  the HUD's outline: the side and its shot, the range the guns are laid to (the mean of where each gun stops, out
  along the fire from the ship's ports), "(longest)" within a metre of their longest throw, " - on target" in red while the
  side can fire, or dimmed " - reloading 4.2 s", " - braced" or " - guns silent".
- **What the aim shows** (`aimOf`, drawn by `AimView`, one a GPU that every fight draws with, `aimViewOf`): each gun's unscattered flight to where the rules stop it,
  fanned out from the volley's middle fall in step with its flight as far as the lay scatters wider than its guns' own
  (the rules' `spread`, above), its fall and ring with it, so the arcs close in as the aim is held (the volley's middle
  taken from the balls that come down, never one still aloft); a
  ribbon 0.003 of the view's height across at any distance, dashed every 6 m of flight (the second half 0.35 as
  strong) and marching out at 9 m/s; each splash a ring flat on the sea, at least 1.6 m across its radius, and a post
  of light 3.4 m tall over it, the ring DFO's foam ring (brightest at 0.7 of its radius, lit from 0.42 to 0.98 of
  it, so a grazing look still reads it); each strike a 2.2 m mark where the ball meets the target, stood a half mark out of
  its side toward the eye so its hull never hides half of it. DFO's three tones: brass laid, red
  on target, grey while the side cannot fire (loading, braced, its guns silent). The ring is blended over the sea; the
  posts, strikes and arcs are light added onto the frame, unlit and unfogged; all are drawn over the finished
  picture after the water, hidden where the world's depth stands nearer.
- **The wheel**: while aiming a notch steps the load, but only after 0.18 s of quiet since the last, so a trackpad's
  stream of small turns steps it once; out of the aim it zooms the fight's camera, a notch half again nearer or
  farther, from 11.4 m (DFO's nearest, or as near as clears the ship) to the fight camera's own 75 m.
- **The screen**: a captain's plate stands under the compass, never over it; the sea's status line ("Fighting") stands
  in the top right corner while the fight's readout shows, off the sky the aim looks at.

The World Editor's fight and its fleet room aim the same way (`easedAimOf`) but for the zoom, keeping their field of
view, their look laid from the aim's last
frame, and draw the lay with `AimView` after the water; a drag across while aiming turns nothing there either. Let
go, the editor's camera eases back to its own place round the ship. The editor keeps its own camera: a drag past
the guns' nearest or longest runs on unheld until it comes back, and its fight's orbit keeps no clearance off the
ship (its zoom comes to 3 m).

## An ambush

The prologue's ambush ([[The Game Opens With a Story Mission at Sea]]) is the same fight, begun as `Fight::ambush`:
the player's Sloop put to sea as it lies, and each captain set where and how the story gives it, numbered from 1
on, its temper drawn from its own seed. Every one comes to fight the player's ship at once: bold whatever its temper,
and cruising straight for that ship until it is in sight (750 m). A captain set where the water does not float it is
refused. The
land door's begin takes an optional `captains` list (each one's `x`, `y`, heading, faction and rank, and an optional
`way` in m/s: given, it comes on under sail at it, else it lies at rest); its view carries every captain after the
first in `others`, as the sea room's wire does, each with its number in the fight (`id`, the first 1), as its events
name it: a captain gone from the fight is left out, and every plate, message and count follows it by that number. A
captain going down carries, besides its `founder`, how it will lie
once sunk (`sunk_founder`) and in how many seconds (`sinks_in`), so a drawing that lets go of the fight can carry it
on under as the rules would. A fight begun with more than one captain is sighted on the panel by how many and the
nearest ("3 ships are sighted, the nearest 820 m off."). The game's `SeaCombat` steps a fight
on any `FightSource`, the sea room's or the land door's, so the story's fight (`StoryFight`) is the sea's own: its
aim, lay, effects, HUD and bars, the player's ship's panel naming it (the Brig). The story places each captain by its
bearing off the player's bow and its distance, heading for the player's ship unless told, and puts every ship to sea
under the sail and way it was sighted with, its rig drawn on from the one it was last drawn with; hears from each step
a ball striking the player's ship, the player's striking a captain, a captain going down and one sunk; and its task counts the ships left to beat.
An ambush keeps rules of its own, and only it: it is fought to the end, so no captain sails off out of it; the
player's ship never goes down in it (a ball, a ram's recoil or a fire leaves it a point of hull); and it is over
(`beaten`) once every captain has sunk, is going down, or has struck, its crew having given up the fight. It draws
the player's ship as the Brig and every captain as a Sloop, each posed on the swell it is handed (a storm's too), for
the drawing only; a captain's hurts and its going down settle, trim and list it on that swell by what the land door
sends of each (`founder`). By the rules every ship in it is still a Sloop.

## In a fleet room

With `?room=` in the World Editor's address, Sail joins a fleet room ([[Server]]) instead, on the open sea: every
player's Sloop and every captain called in fight in one fight, the room's. F calls a captain onto the ring round the player's Sloop
(four at most in a room), of the faction, rank and level chosen in the panel (a Grey Tithe Major of no level if none), and fits the caller's
ship at the ship level chosen ([[Ship Power]], "In the fleet room"); X sends them all
off. The Sloop's lay's arcs are laid in the
browser by the same functions the room fires by (`preview`), among the ships the room last showed.

## One crate, every machine

Alone, the fight lives in `land-wasm` beside the open landmass: a request begins it, steps it by the player's orders (up
to a second's ticks, presses on the first alone) or ends it, and opening another landmass ends it too. A begin may name
its captain's rank (a Major's unless it does), and the captain sails its hull, and the player's hull (the Sloop's
unless it does); each ship's answer names its hull. Its state
never crosses, so requests and answers are JSON. A scripted fight's fingerprint at the end of each leg is pinned
natively and through WebAssembly, and the same fight's against each hull ([[Agree to the Bit]]). In a fleet room the
room's crate holds the fight, and a browser predicts its own ship through `room-wasm` by the same steps.

## Limits

- The aim's station keeps clear of the rig's canvas and masts, not its shrouds, stays or spars: one may cross a corner
  of the view, as a Schooner's shroud does at the foot of its own. The Brig's and the Frigate's eyes stand among
  their courses' height, between the wedges their braced yards sweep, so in some winds a course's edge shows at a
  corner of the view.
- A captain's odds and the hulls' hull points (`captain::odds::hit_share_at`) count its gunners' scatter and window,
  not what they misjudge each volley, so a captain reckons itself a better shot than it is when it chooses to fight
  or run, and each hull's hull points are scaled to an exact gunner's fire.
- Every Tithe captain sails their rank's hull, a friendly ship the traffic's; there is no iron ram bow (the Tithe Ram)
  and no Fluyt yet, and no other classes.
- A player's view of a fight shows its captains; the other players' Sloops in it are drawn from the sea's ships, where
  the fight has them, without their pose or hurts.
- On a struck ship's deck the camera stays level while it rolls, as on the player's own deck, so the crosshair aims a hair off
  where its heeled deck's frame would put it; the view cuts to its deck, with no pan down.
- A player washed up walks into the port city's social space once the page has opened the landmass it stands on, as
  it does for any coast the ship nears.
- In the story's ambush the player's ship is drawn as the Brig but sails and fights as a Sloop, and its captains
  never leave it but by sinking: one who runs is chased, and the fight waits for it.
- A captain's men give out at about four fifths of their hull at every rank, so their rank's run and strike shares of their
  hull are seldom reached; striking at them would take men who stand more blows, a Major's too.
- Two captains of one rank keep pace: a bold one gives up the chase of a wary one sailing away after 150 s.
- Players do not ram one another.
- The World Editor's fight and its fleet room draw no one aboard the captains' ships.
- At sea there are no ports' waters (DFO's crown waters, fewer hostile ships by a port) and no notoriety. A voyage near a
  hostile ship is held, never stopped: DFO's Travel Options encounter, which stops a journey with a roll to avoid it, has not
  come over. A fight's land is the coasts' outlines.
- Above ×10 a bold ship is sighted only ahead, within its cone, kilometres out; at ×10 and below, and at rest, it
  comes anywhere a wary one does, where it cannot meet a ship holding its course. Following a coast round, it does not plan its way round an island.
- A hostile ship sails on the clock of the player nearest it, while another player's voyage is held as if it closed on
  them at their own: for the few ticks one player is nearest while it bears down on another, it may close faster
  than that one's hold allows.
- A page laying its guns is not told which of a ship's masts have fallen, so its lay may meet rig a ball now passes.
- A captain cruises on their course until they see a player's ship; DFO's captains wander between waypoints.
- A magazine's blast is drawn only: it harms no ship.
- Hulls are kept apart by their boxes on the flat; the player's helm is not refused a turn into another hull, as Come
  Sail Away's was, the ship is pushed back out of it.
