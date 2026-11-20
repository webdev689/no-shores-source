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
  - crates/naval/src/captain/odds.rs#odds
  - crates/naval/src/fight.rs#Fight
  - crates/naval/src/fight.rs#sail_hurt
  - crates/naval/src/fight_step.rs
  - crates/naval/src/laying.rs#preview
  - crates/naval/src/ram.rs#ram_blow
  - crates/naval/src/ram.rs#overlap
  - crates/naval/src/fight_ram.rs
  - crates/land-wasm/src/fight.rs#fight_step_json
  - client/src/editor/naval.ts#Naval
  - client/src/editor/fighting.ts#Fighting
  - client/src/editor/aim.ts#lookReach
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
  - crates/room/src/pirates.rs#Pirates
  - crates/room/src/threat.rs#held_pace
  - client/src/game/seaCombat.ts#SeaCombat
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
  - crates/naval/src/captain/mod.rs#wary_takes
  - crates/room/src/battle.rs#Fights
  - crates/room/src/flotsam.rs#Flotsam
  - crates/room/src/harbour.rs#Harbours
  - crates/room/src/harbour.rs#Repair
  - crates/room/src/deck_fight.rs
  - crates/room/src/sea_decks.rs#Decks
  - crates/foes/src/crews.rs#deck_crew
  - client/src/game/seaAfter.ts#SeaAfter
  - client/src/network/seaHarbour.ts#harbourOf
---
# Naval Combat

Broadsides, and rams, between players' Sloops and the enemy factions' captains, each in her rank's hull: DFO's naval
combat, rebuilt in Rust ([[Pick - Sailing and Naval Combat]]) on the [[Sailing]] crate's ships. The owner fights one
captain alone in the [[World Editor]], or with other players in a fleet room on the [[Server]]. At sea a fight ends
in a sinking and what floats, or in a captain striking and a boarding; a player who loses washes up at a port city,
and the damage stays until repaired ([[The Sea Is a Patrol Zone, and the Ship Is Gear]],
[[The Waters Come From the Islands]], [[Hulls]], [[The Sea's Fights, Waves and Close Views Get a Detailed Pass]]).

## The fight

A fight holds any number of ships by number, each sailed by a player's orders or by a captain's mind, and flying the
players' flag or a faction's (the Grey Tithe's or the pirates'). Each tick, in this order: each player's ship steps once
for each of her orders taken (late orders catch up; with none she lies as she was, riding the swell), each captain
steers and sails, hulls that overlap are pushed apart, each player's stem may ram, the guns load, the captains fire and
then the players, the balls fly, fires burn and sinking ships go down, each player's hands mend her, and a captain who
has sunk, or lies past every ship she may fight and is not fighting, leaves the fight. A player's step under her hurts
is one pure function (`sail_hurt`), which a browser predicting her runs too.

## How it works

- **A ball** is a point under gravity alone (9.81 m/s², no drag), leaving its gun at the gun's speed plus the deck's
  way. Its flight is a closed form of its launch, swept as a segment from where it was to where it is, so no step bends
  a shot or tunnels one through a hull.
- **A gun is laid, not pointed.** A broadside fires square to the hull ([[Ship Guns Keep Square Broadsides]]); the
  gunner sets only the range, and the low arc that lands there is found within the carriage. Each gun's mouth rides
  her heel; the lay stays her upright hull's.
- **The guns** are DFO's swivel, three a side: 55 m/s, -10 to 14 degrees, 149 m at most from her deck. A broadside
  ripples 0.09 s a gun, each ball from where its port is by then, scattered by the volley's seed (more for a poorer
  gunner). No battery bears within 35 degrees of her bow or 40 of her stern. Each side reloads on its own clock: 5.6 s
  single-handed, 4 to 7.2 s with a crew.
- **The loads** are round, grape, chain and heated shot, with DFO's factors over round shot: grape is slower and wider
  and kills men (less as its flight lengthens), chain tears canvas, heated shot sets her alight. A loaded side drawn
  for a new load takes half its reload; one loading keeps its progress.
- **A look on her** lays for the point it meets (DFO's `lookOnShip`): the look's ray from the aim eye is tested
  against her hull's box and her sails' boxes out to the laid gun's longest throw and 60 m, the nearest entry taken.
  The side is laid on that point, its range out along the fire and its own height. A look on her canvas lays chain
  for that very point and every other load for her hull's middle. The point is led along the fire by her way over the
  ball's flight there. A look that meets no part of her lays for the water's range. A release fires that same lay.
- **The aim shows each gun's end**: its ball, unscattered, flown by the same law a fired ball flies by (in the fight's
  ticks) with her where her way will have carried her by then, to where it stops. The lay is on target only when one
  of those balls meets her, canvas or hull. Its landing zone's radius is DFO's: half the width the crew scatters the
  gun's yaw across at the splashes' mean range (at least 2 m wide), and never under 1.6 m.
- **What stops a ball** is the first hull of another flag, water or ground it meets: a player's ball passes through
  another player's ship, and a captain's through any ship of her own faction. A ball tears through any canvas it crosses
  (once a ship) and flies on. The water is the swell's surface under it, and the ground the land's, sampled every 4 m.
- **The harm** of a ball is DFO's: by where it struck (holed within 1.1 m of the water under it, 40% more; the hull
  above; the canvas), 85 to 115% by its own roll. A captain's men stand 1.6 blows each, a player's crew 3.2.
- **A ship** has hull, canvas and men. A captain strikes at her rank's share of her hull (a Major's quarter) or with no
  men left. Any ship, the player's Sloop too, goes down over 20 s at none (`Sinking`, then gone), listing and trimming
  by her seed (a player's by none) and settling slowly, then fast; going down, her guns are silent and her helm takes
  no orders. The rest of the volley that made a captain strike cannot sink her. A player's Sloop never strikes. Fires
  (three at most) burn hull, canvas and men for 15 s. Bare poles leave 35% of her way. Braced, she takes half the harm
  to hull and canvas, but her guns are silent and do not load. Unhurt for 15 s, with no ship within 700 m that would
  take her, her hands mend her to half of her hull and of the canvas her standing sails hold.
- **Her rig** (`rigging.rs`). Each sail's share of her canvas is the pull it gives at its crest over her whole canvas's
  (`sailing::helm::canvas`). A ball on her canvas counts its canvas harm to the sail whose box it entered first; once a
  sail's harm passes its due (its share of her whole canvas) it tears away (`SailLost`), and her canvas holds no more
  than her standing sails' shares, so her drive loses its share. A bare spar struck again, every sail of its mast gone,
  brings the mast down (`MastFell`), and balls pass where its sails stood. Her masts are where her square sails and
  gaffs stand, their fore edges taken from the bow aft, one mast while each lies within 2 m of the last; a staysail
  stands on her foremost mast: the Sloop has one, the Schooner two, the Brig two and the Frigate three.
- **What a tick tells** (`fight_events.rs`), beside the World Editor's events and each on the fight's tick it happened
  on: a ball's splash where it fell; a ball that struck a ship, where in her own frame and on her hull, a sail still set
  or her rig where its sail is gone; a sail torn away; a mast fallen; colours struck; a ship going down; a piece of what
  floats laid, and gathered; and players gone aboard her.
- **Chance** is one seeded stream (DFO's mulberry32), drawn in a fixed order, so a fight is the same on every machine.

## The captain

She sails her rank's hull under the player's own helm, so her pace is her hull's by the player's law. She sees every
ship she may fight (each player's, and each afloat captain's of another faction) and keeps, for each, whether it struck
her lately and whether she spares it. DFO's captain commands a swing and a share of sail; here the swing is a share of
her rudder and the sail the rung whose way is nearest. Under the ladder's law the wind's eye costs her 0.55 of her way,
so she never tacks.

- **Whom she fights.** A captain is bold one time in four by her seed, an Elite and above always. A bold one takes on a
  ship she may fight within 750 m; a wary one only a wreck, a hull nearly gone, or a ship she outguns 5 to 4 by DFO's
  fighting power (the time each takes to make the other strike, by each ship's whole rank: her hull and men, her guns'
  harm and reload). Struck by a ship, she is hostile to it for 5 minutes. Of the ships she would fight and does not
  spare, she takes the nearest, the one she already fights reckoned a fifth nearer (as DFO ranks them), and runs from
  the nearest that struck her within 320 m. What she remembers of a chase, a wreck, her mark's way and the side she
  presented is let go when she marks another ship.
- **Her course.** She bends round every hull about her that will pass within both their reaches (each half of half her
  box's beam and length) and 15 m, the bends of each summed, as DFO's traffic does. Far off, she steers to intercept. A
  ship running from her she runs down astern, then sheers out to its beam. Otherwise she brings the side that costs
  least to bear on where her balls will meet him, bent off the beam to open or close her range of 50 m, and once
  presented keeps station with sail. She bends round his hull and sounds the land ahead, swinging off a foul course.
- **Her guns.** A side loaded, in reach, near her beam, bearing soon and whose lay would strike runs out: the tell.
  It fires no sooner than 1.3 s on, within her gunners' window, long or short by their want of skill. One run out too
  long unfired, or that loses its mark, is run in. She never fires on a wreck.
- **When she breaks off.** A captain runs below her rank's share of her hull (a Major's 30%); a wary one runs from a
  ship that outguns her. A chase that gains nothing in 150 s is given up, and a wreck left after 30 s. She leaves the
  fight when she has sunk, or lies past 1.9 km from every ship she may fight (each player's, and each afloat captain's
  of another faction) and is not fighting; the editor's fight ends when its one captain leaves.

## Ranks and factions

Every captain sails for a faction at a rank ([[Enemies Come in Five Ranks, After Destiny]],
[[Enemy Factions Start With the Grey Tithe]], [[Enemies]]): she is named for her faction and her hull, on her plate
and in the panel: the Tithe Sloop, Schooner, Brig or Frigate, or the Pirate Sloop, Schooner, Brig or Frigate. Her rank
picks her hull ([[Hulls]]): a Minor and a Major sail the Sloop, an Elite the Schooner, a Miniboss the Brig and a Boss
the Frigate. Her rank scales her, a Major at the numbers of the rest of this note:

| Rank | Hull and men | Way | Gun damage | Reload | Aim error | Temper | Runs | Strikes |
|---|---|---|---|---|---|---|---|---|
| Minor | ×0.6 | ×0.9 | ×0.9 | ×1.2 | ×1.3 | by her seed | under 30% | at 25% |
| Major | ×1 | ×1 | ×1 | ×1 | ×1 | by her seed | under 30% | at 25% |
| Elite | ×1.8 | ×1.1 | ×1.1 | ×0.9 | ×0.8 | always bold | under 30% | at 20% |
| Miniboss | ×3 | ×1.2 | ×1.2 | ×0.8 | ×0.7 | always bold | under 15% | at 10% |
| Boss | ×5 | ×1.3 | ×1.3 | ×0.7 | ×0.6 | always bold | never | at 5% |

Her men are as many as her hull makes them (6 to 94, whole men), so hull and men give out in the same proportion at
every rank: a hull hit takes a man or two, and her men give out at about four fifths of her hull, as a Major's do. Her
way pulls her canvas and her oars alike, so a higher rank runs down a lower one, and a Boss outlasts a Minor; two of one
rank keep pace. Aim error scales both her lay's long and short and her volley's scatter. A captain sees every player's
ship and every afloat, unstruck ship of another faction, and chooses, engages and breaks off with them as with a
player's; she never fights her own faction, and a struck ship is nobody's enemy. Any foe's hit provokes her. Over each
captain's ship in a fight stands her plate, as a foe's ([[Interface]]): her faction's emblem, and her name, with an
Elite's or a Miniboss's mark, above a bar of her hull, red, orange or yellow by rank, her losses read as a foe's;
no plate covers another. A Boss's stands across the top of the screen with her faction's name.

A hull changes her size, her boxes, her sails, her handling, her stem and how many guns she carries, never her
strength: the table above is the whole of it. A bigger box is struck more often, so her canvas and men are her class's
times her rank's times her exposure: the fight's hit share on her box over the Sloop's, from the Sloop's guns at the
duel's 110 m by a captain's gunners (the Schooner 1.44, the Brig 1.65, the Frigate 1.88). Her hull points take it too,
less for a taller hull's hits holing her less often (the Schooner 1.39, the Brig 1.58, the Frigate 1.79), so the same
fire takes as long to make any hull of one rank strike. Her canvas drives her no harder than the Sloop's, so her rank's way alone
sets her speed ([[Sailing]], "The other hulls").
A side's broadside weighs the Sloop's times her rank's gun damage, spread evenly over that side's guns (the Schooner's
five, the Brig's seven, the Frigate's ten across her two gun decks): each ball is the Sloop's, rounded as hers, and the
ship it strikes takes its share of it, three over the guns a side, carrying the parts of a point or a man until they
make one; its chance to set her alight is that share of the Sloop's ball's. So every broadside of one rank takes as
much hull, canvas, men and fire from her, whatever hull fires it. Each gun reloads and scatters as the Sloop's. Her
balls fly from her own mouths, a ball meets her own hull's and sails' boxes, and she rams, is rammed and is kept apart
by her own hull's box. A captain sizing up a ship reckons her hit share against that ship's hull.

## How a fight ends

At sea ([[Server]], "The sea"), each a rule the owner chose ([[The Sea's Fights, Waves and Close Views Get a Detailed
Pass]]) with Claude's numbers:

- **Sinking, and what floats** (`flotsam.rs`). A captain's ship that goes down lays, where she went, 3 pieces for a
  Minor, 4 a Major, 5 an Elite, 6 a Miniboss and 8 a Boss, for each player who fought her, kept for that player alone
  as a land drop is, within 30 m, drifting downwind at 0.3 m/s and gone after 180 s. A player's ship within 25 m of one
  of their pieces gathers it. Each piece is a kill's drop by the gear loop's own law ([[Gear]], "Drops") for a foe of
  her rank at her level (her water's): its Vestige by the rewards' foe her rank names (a Minor the Skirmisher's chance,
  a Major the Swordsman's, an Elite the Brute's, a Miniboss and a Boss the Captain's sure one), an Ammo box by her rank,
  and from a Miniboss or a Boss an Ammo crate; what the player has no room for is lost with the piece. For an Elite or
  higher one piece of each player's is a chest, rolled as a foe one rank higher. A piece looks like a crate or a barrel
  (half each by its draw) or a chest.
- **Striking, and boarding.** A captain who strikes lies hove to with her colours down. For 90 s any player in the
  fight may board her: their ship within 30 m of hers, both under 2 m/s. With no one aboard by then she is scuttled
  (`Sinking`) and lays what floats. A struck captain never sails off from the fight. The page tells the player her
  colours are down and to come alongside; E asks to board her (`seaAfter.ts` `boardable`, the fight's controls let E
  through), and the sea's line says "Boarders away" as the boarder goes from their helm to her deck.
- **Her deck** (`deck_fight.rs`, `sea_decks.rs`). The sea room holds the deck fight, so the one authority over the fight
  knows when her deck is won and when the last boarder leaves, and no second room is trusted with it: a room on land
  built as a node's room is, its floor her deck's grid of heights from her hull's manifest (in her own frame, a wall off
  her planks), its ring her deck's bounds, its spawns at her rails amidships, half a metre in from her outermost plank
  (`rail_spot`; at her helm where no plank lies across her middle). A boarder comes over her rail on the side their own
  ship lies, clear of her masts (which stand on her middle line), facing her bow and her crew; one who falls stands
  again at the rail nearest. So the land
  combat runs unchanged on her deck, with each boarder's character. Her crew is her faction's deck types for her rank
  (`foes::crews`): a Minor three Minors; a Major four, the Bosun (the pirates' Brute) a Major; an Elite five, the Bosun
  an Elite; a Miniboss six, the Tithe-Mate (the pirates' Captain) the Miniboss; a Boss Captain Brannoc Thule and six.
  The plain hands are the faction's skirmisher, swordsman and shot in turn (the Deckhand, Hookman and Pistoleer; the
  pirates' Skirmisher, Swordsman and Archer), standing two abreast along her deck from 2 m forward of amidships, 1.6 m
  apart, facing aft, at her level. Clearing her deck opens her hold: what floats, twice over, every chest a rank higher
  still, for each boarder. A boarder leaves her deck (back aboard their own ship) once her crew has fallen, and a
  minute after it fell every boarder still aboard is sent back; she is scuttled when the last one has left her. A
  boarder's own ship takes no orders or course while they stand on her deck. Her deck room fights with the boarder's
  character, the real one even when the accounts answer after boarding, and gives it back with what was won aboard.
  The sea's snapshot carries each deck to its boarders alone: their numbers there, her hull, her deck room's own
  snapshot, and the ticks her won deck holds them yet; their gear while aboard is her deck room's, sent through the
  sea's link, and every boarder's dress is sent again as each one comes over her side, who had no welcome to bring it.
- **The fight on her deck, on the page** (`deckBoarding.ts`, `deckFight.ts`). Once the sea says the player stands on
  her deck, the page plays on foot there exactly as on land: the same `Foot`, controls, first and third person,
  display, bars and marks, her crew drawn as the land's foes and the other boarders as players. Its link is the sea's:
  land inputs sent through it, which the room hands to her deck room, and each of her deck room's snapshots handed on
  from the sea's (`SeaRoom.hearDeck`). The page predicts on her grid of heights by the movement crate and the fight's
  rules (`fighter_heights`), as the room steps it. Everything on her deck is in her own frame, laid into the world as
  her ship lies in the fight (the captain nearest where she lay, her heading, heave, pitch and roll): figures by
  `deckToWorld`, the camera's eye riding her and level, and the marks, arcs, blood and display through her deck's turn
  (`deckTurn`) after the world camera's matrix. The third-person camera keeps a clear line to the boarder past her
  masts, booms, gaffs and yards (`spars.ts`, boxes from her manifest's sails, for the camera alone), pulling in as on
  land it does off walls. No figure's card stands nearer the eye than a metre, so a foe in a melee seen through the
  player's own eyes never fills the view (`cardStand`, on land too). While she holds the player the fight's keys and
  pointer are the foot's.
  Won, the display says "Her deck is yours" over her hold's take as the room laid it ("Her hold: 2 crates, a chest"),
  and the keys begin "E: back aboard your ship · 45 s left"; E or the minute's end, the room has the boarder
  back at their own ship's helm and the view is the sea's fight's again. Beaten, they wash up (below). On her deck
  every key but E, Enter (respawn), the menu's and Escape is the fight's on foot.
- **Losing.** A player whose ship goes down, or who is beaten on a deck with no boarder left standing there, washes
  up at the port city nearest by the sea's way round land (`world::traffic::SeaWays`, on the traffic's sea mask: one
  search from every port when the room opens gives each cell of open water its nearest, so asking is a lookup): on foot in its social space, their ship moored at its roadstead at rest, a sunk one with 10% of her hull, 25%
  of her canvas and half her men, a beaten boarder's with the hurts she had (a sunk ship's if she is going down). A
  player who leaves the sea mid-fight is kept as the fight has her, and at the port city she would wash up at. Every
  boarder of a deck lost is let go of the fight, and she is scuttled with no one aboard.
- **Kept damage.** A player's ship's hull, canvas and men are kept as shares of whole, with their berth at sea and in
  their character (`ship`, in ten-thousandths), across sessions, until repaired; she starts every fight with them, and
  her voyage sails at her pace times the canvas she keeps (never under half), in the room and the page alike. Where
  the sea last kept her is kept too (`ship_at`, to the metre): back at sea she lies there, whatever the page first
  said, and the page is told (`MOORED`).
- **Repair** (`harbour.rs`). Within 3 km of a port city's roadstead, at rest and out of a fight, Manage offers "Repair
  her" (R): free, she is made whole evenly over a second for each hundredth she is missing (the most of hull, canvas
  and men), 100 s at most. Setting a course, heaving to for a fight or leaving the sea stops it where it stood.
- **Its weather.** Each fight at sea, and each fight among captains alone (`clash.rs`), takes the swell and the wind
  where and when it began (`sea_weather.rs`, sheltered by the coasts and calm by the port cities' roadsteads) and
  keeps them while it lasts; a player joining it fights in its weather, a fight among captains a player came on keeps
  its own, and what floats drifts down the wind of the fight it came from.
- **Many in a fight** (`battle.rs`). Any player not fighting who comes within 750 m of a ship of a fight joins it, a
  fight with players in it too, their Sloop hove to under a number of their own; every player in it fights every
  captain, and players never harm one another (a ball passes through a ship of its own flag). A hostile ship at sea
  within 750 m of a fight joins it on her own side, under sail where she lay: she fights players and captains of other
  factions. Each player sees the fight from their own ship: their view numbers it as the player's and the fight's first
  captain as its captain. A player whose ship goes down leaves it; when its last captain has left it, its players sail
  on from where it left them, each keeping her hurts. Everyone in it is told who joins.
- **Wary captains** fall on a ship they outgun, by DFO's `takesPrize` (`navalAI.js`: "a wary one only a prize she
  outguns WARY_ODDS to one, or one crippled or holed under GRAPPLE_HULL", `WARY_ODDS = 1.25`, `GRAPPLE_HULL = 0.35`):
  in a fight by her own mind, and at sea a wary ship steers for a player not fighting in her sight whose Sloop she
  would take as her kept hull leaves it (`come_for`), and meets them within 750 m (`wary_takes`).
- **What a player is told** goes to that player alone: the sea's snapshot is cut for each player, what floats, kept
  hurts, the sea's own messages and a deck's own snapshot reaching only those they are for.

## Ramming

DFO's law of the ram. A player's stem, 1 m above her waterline at her bow, strikes the hull of a ship of another flag
it comes within 1.2 m of, at the face it stands farthest outside of: her side, or her bow or stern. It rams when her
way along her keel, at the most over the last 0.6 s, closes on that face at 1.6 m/s or more.

- **The blow** is 0.15 of the lesser of the two whole hulls, times the closing way over 8 m/s (never more than whole),
  and 0.4 of that into her bow or stern. It never takes her hull under a quarter, where she strikes: a ram brings a
  ship to strike and no further. It takes a man for every 40 points it deals, over her men's toughness, by a roll
  drawn from the fight's stream.
- **The recoil**: the rammer takes 0.6 of the blow back (half that braced), and a ram is only as hard as she can pay
  for within her own room over her line, one point short of it, so her own ram never makes her strike and a hull at its
  line rams nothing. A wreck rams nothing.
- **One ram a tick** for each player, none on the same ship again within 3 s, and her remembered way is spent on it.
  A ram provokes the captain struck. Captains do not ram.
- **Hulls kept apart.** Two hulls whose boxes overlap on the flat are each pushed out half the overlap, and each loses
  the share of her way that drove squarely into it. DFO kept the player's own boat apart by Come Sail Away's sweep;
  here every ship is pushed alike, so the room can do it.

For the owner's Sloop and the Pirate Sloop, a ram at 8 m/s into her side deals 36 and costs the rammer 22; six from
whole bring the Pirate Sloop to strike.

## In the World Editor

While sailing, `F` calls a pirate captain, a Major in her Sloop, onto the ring 650 to 1000 m round the Sloop, where the
water floats her, heading across her waters on a slant; `F` again sends her off. The fight then steps the Sloop in her
helm's place. Holding the right mouse aims: the camera stands at the aim eye past the ports on the side looked at, the
look's bearing picks the side, and where it meets the water is the range, on at 30 m a degree past the dip (DFO's
lookReach), unless the look is on her: then the guns are laid on the point it meets. Letting go fires the lay held; a
left click holds fire, the wheel changes shot, and `C` braces.

Her ship is drawn in her hull and her faction's colours ([[Sailing]], "Her look"), and the water cuts her footprint
as it does the player's. The balls and the lay's arcs are small lit spheres, and the fight looks as "How it looks"
says. The panel shows both ships' hull, canvas and men, the guns' reload and load, DFO's messages,
and "BROADSIDE! Brace (C)." while her guns stand run out. Each arc of the lay starts where its ball leaves, a
ripple after the gun before it and carried on by her way, and runs only to where that ball stops: a larger red mark
where it strikes her, and a ring of the landing zone's radius where it splashes. The arcs are red, and
the panel reads "Laying the ... guns: on target.", only when an unscattered ball strikes her.

## How it looks

Only the look of it: the rules say what happened, in the fight's events and its view, and `FightFeel` turns each into
puffs of small lit spheres (`Effects`), harm kept on the ship it struck (`ShipHarm`, on her rig), flotsam and sounds.
The view's own numbers stand in where no event says more: her canvas's share left holes her sails, a ship `struck`
lowers her colours and one `sinking` goes down.

The room's own events (`SailLost`, `MastFell`, `Struck`, `Sinking`, `Flotsam`, `Gathered`, `Boarding`) reach the feel
by their own names through one mapping (`feelOf`, `rules/feelEvents.ts`, which every layer may read), on every fight path: the sea room's view, the fleet room's
snapshot (whose events carry the sea's kinds after its own, 12 to 19) and the World Editor's fight. A ball's `Splash`
and `Hit` come with its shot's own events, the hit carrying where on her it struck in her frame and the part. Each
ship's harm is kept by the number the events name her by: at sea the player is 0, the first captain 1, and each other
captain's number comes with her in the view, so one leaving the fight never moves another's holes onto her.

- **A gun fired** (`muzzle`): a flash at its mouth for 0.1 s, and ten puffs of white powder smoke that roll a few
  metres out the way the ball went, slowing, lift off the water and drift downwind at 1.5 m/s, thinning most of the
  way within a few seconds and gone by 7 s, so what it hid (her holes, the foam, what floats) shows again. A
  broadside's guns each smoke from their own mouths, so the smoke hangs along her side a while.
- **A ball in flight** keeps its sphere and leaves a faint grey trail, a puff every 0.04 s that lasts half a second.
- **A ball in the water** (`Splash`): a column of water thrown up, white at its head and the sea's own colour lower
  down, that rises about 4 m for a round shot, spreads as it rises and falls back in a second, its size by its ball
  beside a round shot's (the ball last seen aloft nearest where it fell; 0.6 to 2 times); a ragged patch of foam
  over where it fell for about 2.5 s; and a push on the water's ripples ([[Water]], "In the water").
- **A hit** (`Hit`, its point in her frame and the part struck; until the rules send them, the world point turned into
  her frame and the zone): on her hull, 32 chips, most of her side's paint, burst out of her side and fall to the
  water, and a ragged hole, a dark middle in a rim of splintered raw timber that reads on any paint, stays there for the fight; on a sail (a rig hit within
  1.5 m of a cell of canvas), that cell is shot through for good, with a few shreds drifting down; elsewhere in her
  rig, a puff of splinters at the spar. A ram's stem throws her splinters but leaves no hole.
- **Torn sails**: her sails' holes grow with her canvas's harm ([[Sailing]], "Her sails"). A sail torn away
  (`SailLost`) rips from its yard, head first, falls to leeward over her side onto the water, and floats there 40 s
  as she sails on from it before it sinks. A fallen mast (`MastFell`) leans over her leeward side with its yards and
  sails, slowly then fast, for 3 s until its head is in the water, then drifts astern and is gone after 40 s.
- **Fire**: flames and dark smoke up from her deck, along a third of her length, for each fire the view gives her.
- **Struck** (`Struck`): her flag comes down her mast in 4 s to a metre over its foot and is gone.
- **Sinking** (`Sinking`): over 20 s she settles, slowly then fast, by her worse-hit end (her bow if her holes lie
  forward of her middle, trimmed 10 degrees), lists up to 20 degrees to the side most holed, and goes under; from
  halfway down until 8 s after, foam and rising bubbles fill the water over her length. Her flotsam (`Flotsam`:
  crates, barrels and a chest, which the rules lay) rides the swell the water draws where it lies (bobbing 0.12 m every
  4 s where the page draws none), drawn at the size the view draws ships and lit and shadowed as the land is, each
  under a gold mark 2.5 m over it that stands as large on the screen at any distance (some ten pixels across at the
  fight's camera), until gathered (`Gathered`: a ring of gold glints rises from it and a little water is thrown up)
  or the fight is over.
- **Sounds**: each plays the game's own recording where it has one: a ball in the water plays its splash
  (`shot.splash`). The sound sheet has none yet for a gun fired, a ball through a hull or a sail, a sail torn away, a
  mast falling, colours struck, a ship sinking, what floats laid or gathered, or a boarding: each stays silent until
  the owner picks one.
- **From above**: at the raised view, where the ships are drawn larger ([[Overworld]]), every puff, ball, hole and
  piece of flotsam is drawn as many times larger about the point it came from, as the wakes are, so the fight reads
  from there; close in, all are their true size. The sea's splashes push its ripples as wide.

## At sea

The sea room ([[Server]]) sails hostile ships among the players' on the [[Overworld]]: DFO's director, trimmed to
pirates alone ([[The Sloop Is Painted, Sails the Overworld and Meets Pirates]]), the Grey Tithe's beside them.

- **Who comes.** Each player at sea rolls half a minute after reaching the water and then every 60 to 140 s; a roll that
  falls due while they fight comes as the fight ends. While fewer than three hostile ships sail within their sight of
  them, a roll brings a ship 0.8 of the time, and she is hostile 0.3 of that (DFO's open sea: 30 of its factions' 100).
  The water at the player's ship decides who comes ([[The Waters Come From the Islands]], [[World Map]], "Waters"):
  none in Overlook's home waters (the roll is spent), a pirate in the pirates' waters, a Tithe ship in the Grey Tithe's,
  and either, half each, in a contested water or on the seam. Her rank comes by the lowest level of her water's band:

  | Band starts at | Minor | Major | Elite | Miniboss |
  |---|---|---|---|---|
  | under 10 | 0.50 | 0.40 | 0.10 | 0 |
  | 10 to 12 | 0.35 | 0.45 | 0.20 | 0 |
  | 13 to 18 | 0.25 | 0.45 | 0.25 | 0.05 |
  | 19 to 25 | 0.15 | 0.45 | 0.30 | 0.10 |
  | 26 and up | 0.10 | 0.40 | 0.35 | 0.15 |

  No Boss comes by a roll: the Boss Frigate sails only at the Grey Tithe's sea strike, which is not built. Her level is
  drawn evenly from the band, as a garrison foe's is; it is carried and shown, and her strength in a fight stays her
  rank's. Her faction and rank are drawn as she comes and kept on her (`sighting.rs`). The rolls wait real seconds, and
  are drawn from a seed the sea takes as it opens (the server's from the runtime's random numbers, the page's from its
  own), so each sea sends its ships in an order of its own, as DFO draws its rolls ([[Pirates Must Be Met at Sea]]).
- **Sight.** A ship is sighted from `max(5 000 m, 30 s × (12 + 2.4) m/s × pace)` of a player, their voyage's pace (at
  rest counted as 1): 5 km at the helm, 8.6 km at ×20, 25.9 km at ×60, 43.2 km at ×100, so one met head-on stays in
  sight half a minute and more. Each keeps the largest sight she has been given, from the pace of the player nearest
  her, and goes once no player is within 1.1 times it.
- **Where.** Between 0.9 and 1 of her sight out from the player, within 60 degrees of their heading while under way and
  anywhere at rest; a bold ship, under way above ×10, within her meeting cone off their course shrunk to 0.8 of it
  (`meeting_arc`), no nearer than 450 m to any player, where open water lies between and out of home waters. Of the
  ten tries that fit, a pirate takes the one nearest a coast, keeping near coves; a Tithe ship the one nearest a
  friendly lane (a leg of a route between the port cities, `world::traffic`) within 50 km, heading along it the way
  nearer her slant toward the player. With no lane that near, she comes as a pirate does. Every other ship heads across
  the player's waters on a slant. She sails at the Sloop's 2.4 m/s times her rank's way (Minor 0.9, Major 1, Elite 1.1,
  Miniboss 1.2). Blocked by land or the edge of home waters, which no hostile ship enters (one a fight among captains
  left inside them may sail out), she takes the open heading nearest her last, a twenty-fourth of a turn at a time
  either way, so she follows the coast round; with none open she goes about. Her temper is her
  seed's: an Elite and a Miniboss are always bold, any other one in four.
- **Coming for the player.** A bold ship that has sighted a player who is not fighting comes for them (`come_for`):
  she steers to intercept, heading to where their ship will be when she can reach it at her way on that player's
  clock (lead pursuit; straight at them where she cannot reach them, as when they sail away faster), turning at most
  at a Sloop's helm rate, 10 degrees a second of her clock. She keeps after the one she came for while they stay in
  her sight and out of a fight, until she meets them (750 m) or loses them. A wary ship keeps her own course: the
  player may chase her, evade her or let her pass. On the voyage's clock she sails at a fifth of the ship's way (a
  Major; 0.18 to 0.24 by rank), so she can meet a ship holding her course only from within the cone sin(angle) <= her way / 12 m/s off it
  (11.5 degrees for a Major); lead pursuit cannot widen it. So a bold ship comes there (above, "Where"), and a player
  who holds their course meets her, one who turns away evades her, until she loses them. The voyage's hold keeps its
  own law as she comes near along the way.
- **The chase.** A player who chases a ship (the page tells the room whom, `Sea::chase`) and comes within 750 m of
  her begins the fight with her whatever her temper, as a bold ship that meets a player does; a wary one runs as
  captains run. The room lets go of the chase once she has left the sea.
- **Her clock.** As DFO's sea keeps the world's time, she sails on the clock of the player nearest her: their
  voyage's pace as it is held (144 m/s at ×60), the world's own while they lie at rest, and real time where another
  player sails within 1.2 km of that one, a shared sea.
- **The voyage held.** As DFO holds a fast journey, a voyage eases down as a hostile ship comes near along its way: its
  pace is capped so the player takes 0.6 s of real time or more to reach her sight (750 m), closing at their ship's 12
  m/s and the fastest rank's 2.88, down DFO's ladder by fives, never under ×5. Her way is judged along every leg of her course she would
  sail through that tick at her own pace, so no turn of a course slips past it. Within 700 m of a hostile ship of either
  temper, sailing or in a fight among captains, it is held to ×1, the world's own time (`threat.rs`). The room sails
  each ship at that pace and sends it as her pace; the page sails its own at the room's pace, drawn to where the room
  has her, and the voyage's line says it is held.
- **Rivals meet** (`clash.rs`). A bold ship within 750 m of a ship of another faction, neither in a fight, meets the
  nearest: both leave the sea and fight there with no player, on the fight of many ships, which the room steps each
  tick. Each ship stays where the fight has her, and the snapshot shows her among the ships at sea there. The fight
  lasts while one of them fights on; then one who struck, sank or runs leaves the sea, and the rest sail on from where
  it left them. Two that sailed on meet again only once out of each other's sight. A fight with no ship a player keeps at
  sea (within 1.1 times her sight) leaves the sea, as a ship does. Ships of one faction never meet.
- **Joining.** A player not fighting who comes within 750 m of any ship of such a fight, or of a fight with players in
  it, joins it: their Sloop heaves to there and is put into it with the hurts she keeps, and its captains choose whom
  to fight by their own law, the one each fights reckoned nearer ("How a fight ends").
- **The meeting.** A bold ship within 750 m of a player who is not fighting meets them: she leaves the sea and the fight
  begins with her where she lay, under sail, and the player's Sloop hove to (`Fight::meet`). The room steps it each tick
  by the players' orders on the fight of many ships, so her stem may ram the captain's, on waters made from the coasts
  (open sea, the swell on it, dry land on them), until every captain has sunk or gone; its last view is shown once,
  and the players sail on from where it left them, keeping their hurts.
- **In the game** the view pans down over 1.5 s from the raised sea to their Sloop, every ship easing on the way from
  the size the sea draws her to her true size as on the sea's other views near her ([[Game]], "At sea"); the fight is
  the World Editor's (its look and lay, effects and panel), its controls A and D, W and S, the right button to aim and
  let go to fire, a left click to hold fire, the wheel for the load and C to brace; the sea's own wait for its end.
  Every captain in it is drawn with her name over a bar of her hull, her plate as far over her highest sail as the
  Sloop's stands over hers (`plateOverM`). Then the view pans back up. Hostile ships at sea
  are drawn as the Overworld's ships are, each in her hull and her faction's colours with her footprint on the water, those fighting each other where
  the room has them. A ship that comes into view is drawn under the sails she sails by, already set (`seaShips.ts`).

## In a fleet room

With `?room=` in the World Editor's address, Sail joins a fleet room ([[Server]]) instead, on the open sea: every
player's Sloop and every captain called in fight in one fight, the room's. F calls a captain onto the ring round her
(four at most in a room), of the faction and rank chosen in the panel (the pirates' Major if none), X sends them all
off. Captains of different factions fight each other there as they fight players. Her lay's arcs are laid in the
browser by the same functions the room fires by (`preview`), among the ships the room last showed.

## One crate, every machine

Alone, the fight lives in `land-wasm` beside the open landmass: a request begins it, steps it by the player's orders (up
to a second's ticks, presses on the first alone) or ends it, and opening another landmass ends it too. A begin may name
her captain's rank (a Major's unless it does), and she sails its hull; each ship's answer names her hull. Its state
never crosses, so requests and answers are JSON. A scripted fight's fingerprint at the end of each leg is pinned
natively and through WebAssembly, and the same fight's against each hull ([[Agree to the Bit]]). In a fleet room the
room's crate holds the fight, and a browser predicts its own ship through `room-wasm` by the same steps.

## Limits

- Every captain sails her rank's hull, the Tithe's and the pirates' alike; there is no iron ram bow (the Tithe Ram)
  and no Fluyt yet, no other classes, and no ambient traffic.
- A player's view of a fight shows its captains; the other players' Sloops in it are drawn from the sea's ships, where
  the fight has them, without their pose or hurts.
- On her deck the camera stays level while she rolls, as on the player's own deck, so the crosshair aims a hair off
  where her heeled deck's frame would put it; the view cuts to her deck, with no pan down.
- A player washed up walks into the port city's social space once the page has opened the landmass it stands on, as
  it does for any coast she nears.
- A captain's men give out at about four fifths of her hull at every rank, so her rank's run and strike shares of her
  hull are seldom reached; striking at them would take men who stand more blows, a Major's too.
- Two captains of one rank keep pace: a bold one gives up the chase of a wary one sailing away after 150 s.
- Players do not ram one another.
- At sea there are no ports' waters (DFO's crown waters, fewer pirates by a port) and no notoriety. A voyage near a
  pirate is held, never stopped: DFO's Travel Options encounter, which stops a journey with a roll to avoid it, has not
  come over. A fight's land is the coasts' outlines.
- Above ×10 a bold ship is sighted only ahead, within her cone, kilometres out; at ×10 and below, and at rest, she
  comes anywhere a wary one does, where she cannot meet a ship holding her course. Following a coast round, she does not plan her way round an island.
- A pirate sails on the clock of the player nearest her, while another player's voyage is held as if she closed on
  them at their own: for the few ticks one player is nearest while she bears down on another, she may close faster
  than that one's hold allows.
- A page laying its guns is not told which of a ship's masts have fallen, so its lay may meet rig a ball now passes.
- She cruises on her course until she sees a player's ship; DFO's captains wander between waypoints.
- No magazine blast yet. A fleet room's fights do not send the sea's own events.
- Hulls are kept apart by their boxes on the flat; the player's helm is not refused a turn into another hull, as Come
  Sail Away's was, she is pushed back out of it.
