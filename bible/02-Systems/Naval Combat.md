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
  - client/src/ships/markView.ts#MarkView
  - crates/naval/src/fight.rs#meet
  - crates/naval/src/wire.rs#view_numbers
  - crates/room/src/pirates.rs#Pirates
  - crates/room/src/threat.rs#held_pace
  - client/src/game/seaCombat.ts#SeaCombat
  - crates/naval/src/ranks.rs#SCALES
  - crates/naval/src/ranks.rs#Commission
  - crates/room/src/pirates.rs#commission_at_sea
  - crates/room/src/clash.rs#Clash
  - crates/naval/src/fight.rs#among
  - client/src/ships/shipBars.ts#placeShipBars
  - crates/naval/src/fight.rs#ambush
  - client/src/game/prologue/fightAtSea.ts#StoryFight
---
# Naval Combat

Broadsides, and rams, between players' Sloops and the captains' Sloops of the enemy factions: DFO's naval combat,
rebuilt in Rust ([[Pick - Sailing and Naval Combat]]) on the [[Sailing]] crate's ships. The owner fights one captain
alone in the [[World Editor]], or with other players in a fleet room on the [[Server]]. What the sea's fights become
next, each ending in a sinking or a boarding, against a hull for each rank, is decided and not yet built
([[The Sea Is a Patrol Zone, and the Ship Is Gear]], [[Hulls]]).

## The fight

A fight holds any number of ships by number, each sailed by a player's orders or by a captain's mind, and flying the
players' flag or a faction's (the Grey Tithe's or the pirates'). Each tick, in this order: each player's ship steps once
for each of her orders taken (late orders catch up; with none she lies as she was, riding the swell), each captain
steers and sails, hulls that overlap are pushed apart, each player's stem may ram, the guns load, the captains fire and
then the players, the balls fly, fires burn and sinking ships go down, each player's hands mend her, and a captain who
has sunk, or lies past every ship she may fight and is not fighting, leaves the fight. A player's step under her hurts
is one pure function (`sail_hurt`), which a browser predicting her runs too.

Its guns, the balls striking and falling in the sea, and a ship breaking up are heard where each happens, through the
sea's soundscape ([[Ambience]]), once the owner has picked their recordings.

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
- **The harm** of a ball is half again DFO's (`SHOT_HARM`, the owner's call): by where it struck (holed within 1.1 m
  of the water under it, 40% more; the hull above; the canvas), 85 to 115% by its own roll. A captain's men stand 1.6
  blows each, a player's crew 3.2.
- **A ship** has hull, canvas and men. A captain strikes at her rank's share of her hull (a Major's quarter) or with no
  men left, and goes down over 22 s at none, listing and trimming by her seed and settling slowly, then fast. The rest
  of the volley that made her strike cannot sink her. The player's Sloop is wrecked at none, never sunk: no sail sets,
  her oars pull 35%, her guns are silent. Fires (three at most) burn hull, canvas and men for 15 s. Bare poles leave 35%
  of her way. Braced, she takes half the harm to hull and canvas, but her guns are silent and do not load. Unhurt for 15
  s, with no ship within 700 m that would take her, her hands mend her to half, and a wreck floats again past 15%.
- **Chance** is one seeded stream (DFO's mulberry32), drawn in a fixed order, so a fight is the same on every machine.
- **The pace** of every ship in a fight is half again her pace at sea, under sail and under oars alike
  (`FIGHT_PACE`, the owner's call).
- **The wind** every ship sails in is the world's where she is, read each minute of world time; a fight a story
  plays is told its own instead, the weather drawn round it ([[Prologue]]), so a storm drawn is a storm sailed.

## The captain

She sails a Sloop under the player's own helm, so her pace is the player's. She sees every ship she may fight (each
player's, and each afloat captain's of another faction) and keeps, for each, whether it struck her lately and whether
she spares it. DFO's captain commands a swing and a share of sail; here the swing is a share of her rudder and the sail
the rung whose way is nearest. Under the ladder's law the wind's eye costs her 0.55 of her way, so she never tacks.

- **Whom she fights.** A captain is bold one time in four by her seed, an Elite and above always. A bold one takes on a
  ship she may fight within 750 m; a wary one only a wreck, a hull nearly gone, or a ship she outguns 5 to 4 by DFO's
  fighting power (the time each takes to make the other strike, by each ship's whole rank: her hull and men, her guns'
  harm and reload). Struck by a ship, she is hostile to it for 5 minutes. Of the ships she would fight and does not
  spare, she takes the nearest, the one she already fights reckoned a fifth nearer (as DFO ranks them), and runs from
  the nearest that struck her within 320 m. What she remembers of a chase, a wreck, her mark's way and the side she
  presented is let go when she marks another ship.
- **Her course.** She bends round every hull about her, the bends of each summed, as DFO's traffic does. Far off,
  she steers to intercept. A ship running from her she runs down astern, then sheers out to
  its beam. Otherwise she brings the side that costs least to bear on where her balls will meet him, bent off the beam
  to open or close her range of 50 m, and once presented keeps station with sail. She bends round his hull and sounds
  the land ahead, swinging off a foul course.
- **Her guns.** A side loaded, in reach, near her beam, bearing soon and whose lay would strike runs out: the tell.
  It fires no sooner than 1.3 s on, within her gunners' window, long or short by their want of skill. One run out too
  long unfired, or that loses its mark, is run in. She never fires on a wreck.
- **When she breaks off.** A captain runs below her rank's share of her hull (a Major's 30%); a wary one runs from a
  ship that outguns her. A chase that gains nothing in 150 s is given up, and a wreck left after 30 s. She leaves the
  fight when she has sunk, or lies past 1.9 km from every ship she may fight (each player's, and each afloat captain's
  of another faction) and is not fighting; the editor's fight ends when its one captain leaves.

## Ranks and factions

Every captain sails for a faction at a rank ([[Enemies Come in Five Ranks, After Destiny]],
[[Enemy Factions Start With the Grey Tithe]], [[Enemies]]): the Grey Tithe's ship is the Tithe Sloop, the pirates'
the Pirate Sloop. Until the planned hulls are built every rank sails the Sloop's ([[Hulls]]). Her rank scales her, a
Major at the numbers of the rest of this note:

| Rank | Hull and men | Way | Gun damage | Reload | Aim error | Temper | Runs | Strikes |
|---|---|---|---|---|---|---|---|---|
| Minor | ×0.6 | ×0.9 | ×0.9 | ×1.2 | ×1.3 | by her seed | under 30% | at 25% |
| Major | ×1 | ×1 | ×1 | ×1 | ×1 | by her seed | under 30% | at 25% |
| Elite | ×1.8 | ×1.1 | ×1.1 | ×0.9 | ×0.8 | always bold | under 30% | at 20% |
| Miniboss | ×3 | ×1.2 | ×1.2 | ×0.8 | ×0.7 | always bold | under 15% | at 10% |
| Boss | ×5 | ×1.3 | ×1.3 | ×0.7 | ×0.6 | always bold | never | at 5% |

Her men are as many as her hull makes them (6 to 50, whole men), so hull and men give out in the same proportion at
every rank: a hull hit takes a man or two, and her men give out at about four fifths of her hull, as a Major's do. Her
way pulls her canvas and her oars alike, so a higher rank runs down a lower one, and a Boss outlasts a Minor; two of one
rank keep pace. Aim error scales both her lay's long and short and her volley's scatter. A captain sees every player's
ship and every afloat, unstruck ship of another faction, and chooses, engages and breaks off with them as with a
player's; she never fights her own faction, and a struck ship is nobody's enemy. Any foe's hit provokes her. Over each
captain's ship in a fight stands her plate, as a foe's ([[Interface]]): her faction's emblem, and her name, with an
Elite's or a Miniboss's mark, above a bar of her hull, red, orange or yellow by rank, her losses read as a foe's;
no plate covers another. A Boss's stands across the top of the screen with her faction's name.

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

While sailing, `F` calls a pirate captain onto the ring 650 to 1000 m round the Sloop, where the water floats her,
heading across her waters on a slant; `F` again sends her off. The fight then steps the Sloop in her helm's place.
Holding the right mouse aims: the camera stands at the aim eye past the ports on the side looked at, the look's bearing
picks the side, and where it meets the water is the range, on at 30 m a degree past the dip (DFO's lookReach), unless
the look is on her: then the guns are laid on the point it meets. Letting go fires the lay held; a left click holds
fire, the wheel changes shot, and `C` braces.

Her Sloop is drawn darker from the same model, and the water cuts her footprint as it does the player's. The balls,
the lay's arcs, and each event's flash and smoke, spray and ripples, splinters, dust, and fire aboard
are small lit spheres. The panel shows both ships' hull, canvas and men, the guns' reload and load, DFO's messages,
and "BROADSIDE! Brace (C)." while her guns stand run out. Each arc of the lay starts where its ball leaves, a
ripple after the gun before it and carried on by her way, and runs only to where that ball stops: a larger red mark
where it strikes her, and a ring of the landing zone's radius where it splashes. The arcs are red, and
the panel reads "Laying the ... guns: on target.", only when an unscattered ball strikes her.

## At sea

The sea room ([[Server]]) sails hostile ships among the players' on the [[Overworld]]: DFO's director, trimmed to
pirates alone ([[The Sloop Is Painted, Sails the Overworld and Meets Pirates]]), the Grey Tithe's beside them.

- **Who comes.** Each player at sea rolls half a minute after reaching the water and then every 60 to 140 s; a roll that
  falls due while they fight comes as the fight ends. While fewer than two hostile ships sail within 1.9 km of them, a
  roll brings a ship 0.8 of the time, and she is hostile 0.3 of that (DFO's open sea: 30 of its factions' 100); no other
  ship sails yet. By her seed half of those sail for the Grey Tithe and half are pirates, a Minor 0.3 of the time, a
  Major 0.5 and an Elite 0.2. The rolls wait real seconds, and are drawn from a seed the sea takes as it opens (the
  server's from the runtime's random numbers, the page's from its own), so each sea sends its ships in an order of its
  own, as DFO draws its rolls ([[Pirates Must Be Met at Sea]]).
- **Where.** On the ring 650 to 1000 m round their ship, no nearer than 450 m to any player, where open water lies
  between, heading across their waters on a slant; she sails on at 2.4 m/s, going about at land, and goes once no
  player is within 1.9 km. Her seed sets her faction, rank and temper: an Elite is always bold, any other one in four.
- **Her clock.** As DFO's sea keeps the world's time, she sails on the clock of the player nearest her: their
  voyage's pace (144 m/s at ×60), the world's own while they lie at rest, and real time where another player sails
  within 1.2 km of that one, a shared sea.
- **The voyage held.** As DFO holds a fast journey, a voyage eases down as a hostile ship comes near along its way: its
  pace is capped so the player takes 0.6 s of real time or more to reach her sight (750 m), closing at their ship's 12
  m/s and her 2.4, down DFO's ladder by fives, never under ×5. Her way is judged along every leg of her course she would
  sail through that tick at her own pace, so no turn of a course slips past it. Within 700 m of a hostile ship of either
  temper, sailing or in a fight among captains, it is held to ×1, the world's own time (`threat.rs`). The room sails
  each ship at that pace and sends it as her pace; the page sails its own at the room's pace, drawn to where the room
  has her, and the voyage's line says it is held.
- **Rivals meet** (`clash.rs`). A bold ship within 750 m of a ship of another faction, neither in a fight, meets the
  nearest: both leave the sea and fight there with no player, on the fight of many ships, which the room steps each
  tick. Each ship stays where the fight has her, and the snapshot shows her among the ships at sea there. The fight
  lasts while one of them fights on; then one who struck, sank or runs leaves the sea, and the rest sail on from where
  it left them. Two that sailed on meet again only once out of each other's sight. A fight with no ship within 1.9 km
  of a player leaves the sea, as a ship does. Ships of one faction never meet.
- **Joining.** A player not fighting who comes within 750 m of any ship of such a fight joins it: their Sloop heaves
  to there and is put into it, and its captains choose whom to fight by their own law, the one each fights reckoned
  nearer.
- **The meeting.** A bold ship within 750 m of a player who is not fighting meets them: she leaves the sea and the fight
  begins with her where she lay, under sail, and the player's Sloop hove to (`Fight::meet`). The room steps it each tick
  by the player's orders on the fight of many ships, so her stem may ram the captain's, on waters made from the coasts
  (open sea, the swell on it, dry land on them), until she sinks or is gone; its last view is shown once, and the player
  sails on from where it left them.
- **In the game** the view pans down over 1.5 s from the raised sea to their Sloop, every ship easing on the way from
  the size the sea draws her to her true size as on the sea's other views near her ([[Game]], "At sea"); the fight is
  the World Editor's (its look and lay and effects), its controls A and D, W and S, the right button to aim and
  let go to fire, a left click to hold fire, the wheel for the load and C to brace; the sea's own wait for its end.
  Where the editor's panel lists its lines, the game's HUD shows her ship's panel, the fight's task and DFO's
  messages as toasts ([[Interface]], "A sea fight's panel").
  Every captain in it is drawn with her name over a bar of her hull. Then the view pans back up. Hostile ships at sea
  are drawn as the Overworld's ships are, darker, each with her footprint on the water, those fighting each other where
  the room has them. A ship that comes into view is drawn under the sails she sails by, already set (`seaShips.ts`).

## An ambush

The prologue's ambush ([[The Game Opens With a Story Mission at Sea]]) is the same fight, begun as `Fight::ambush`:
the player's Sloop put to sea as she lies, and each captain set where and how the story gives her, numbered from 1
on, her temper drawn from her own seed. Every one comes to fight her at once: bold whatever her temper, and cruising
straight for her until she is in sight (750 m). A captain set where the water does not float her is refused. The
land door's begin takes an optional `captains` list (each one's `x`, `y`, heading, faction and rank, and an optional
`way` in m/s: given, she comes on under sail at it, else she lies at rest); its view carries every captain after the
first in `others`, as the sea room's wire does. A captain going down carries, besides her `founder`, how she will lie
once sunk (`sunk_founder`) and in how many seconds (`sinks_in`), so a drawing that lets go of the fight can carry her
on under as the rules would. A fight begun with more than one captain is sighted on the panel by how many and the
nearest ("3 ships are sighted, the nearest 820 m off."). The game's `SeaCombat` steps a fight
on any `FightSource`, the sea room's or the land door's, so the story's fight (`StoryFight`) is the sea's own: its
aim, lay, effects, HUD and bars, her ship's panel naming her (the Brig). The story places each captain by her
bearing off the player's bow and her distance, heading for her unless told, and puts every ship to sea under the
sail and way she was sighted with, her rig drawn on from the one she was last drawn with; hears from each step a ball striking
her, hers striking a captain, a captain going down and one sunk; and its task counts the ships left to beat.
An ambush keeps rules of its own, and only it: it is fought to the end, so no captain sails off out of it; the
player's ship is never wrecked in it (a ball, a ram's recoil or a fire leaves her a point of hull); and it is over
(`beaten`) once every captain has sunk, is going down, or has struck, her crew having given up the fight. It draws
the player's ship as the Brig and every captain as a Sloop, each posed on the swell it is handed (a storm's too), for
the drawing only; a captain's hurts and her going down settle, trim and list her on that swell by what the land door
sends of each (`founder`). By the rules every ship in it is still a Sloop.

## In a fleet room

With `?room=` in the World Editor's address, Sail joins a fleet room ([[Server]]) instead, on the open sea: every
player's Sloop and every captain called in fight in one fight, the room's. F calls a captain onto the ring round her
(four at most in a room), of the faction and rank chosen in the panel (the pirates' Major if none), X sends them all
off. Captains of different factions fight each other there as they fight players. Her lay's arcs are laid in the
browser by the same functions the room fires by (`preview`), among the ships the room last showed.

## One crate, every machine

Alone, the fight lives in `land-wasm` beside the open landmass: a request begins it, steps it by the player's orders
(up to a second's ticks, presses on the first alone) or ends it, and opening another landmass ends it too. Its state
never crosses, so requests and answers are JSON. A scripted fight's fingerprint at the end of each leg is pinned
natively and through WebAssembly ([[Agree to the Bit]]). In a fleet room the room's crate holds the fight, and a
browser predicts its own ship through `room-wasm` by the same steps.

## Limits

- Every captain sails a Sloop, of either faction at any rank; no other classes, and no ambient traffic. In the
  ambush the player's ship is drawn as the Brig but sails and fights as a Sloop.
- An ambush's captains never leave it but by sinking: one who runs is chased, and the fight waits for her.
- At sea a fight holds one player at most: a player joins only a fight among captains, and a ship at sea never joins
  a fight already under way. In the game's fight only the first captain's fires show; the panel and DFO's messages
  tell of every captain.
- A captain's men give out at about four fifths of her hull at every rank, so her rank's run and strike shares of her
  hull are seldom reached; striking at them would take men who stand more blows, a Major's too.
- Two captains of one rank keep pace: a bold one gives up the chase of a wary one sailing away after 150 s.
- Players' balls do not strike other players' ships, and players do not ram one another.
- At sea there are no ports' waters (DFO's crown waters, fewer pirates by a port) and no notoriety. A voyage near a
  pirate is held, never stopped: DFO's Travel Options encounter, which stops a journey with a roll to avoid it, has not
  come over. A fight's land is the coasts' outlines, and a fight leaves no hurts on the Sloop after it.
- Only a bold pirate takes a player on; DFO's wary captains also fall on a ship they outgun.
- A pirate sails on the clock of the player nearest her, while another player's voyage is held as if she closed on
  them at their own: for the few ticks one player is nearest while she bears down on another, she may close faster
  than that one's hold allows.
- Her canvas is always drawn, so her sails always take balls; it does not come down as her sail share falls.
- She cruises on her course until she sees a player's ship; DFO's captains wander between waypoints.
- No boarding, crew, sounds, flotsam or magazine blast yet: the rest of step 3 of the pick.
- Hulls are kept apart by their boxes on the flat; the player's helm is not refused a turn into another hull, as Come
  Sail Away's was, she is pushed back out of it.
