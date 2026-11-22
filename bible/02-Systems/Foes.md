---
type: system
status: live
code:
  - crates/foes/src/lib.rs#think
  - crates/foes/src/brain.rs#notice
  - crates/foes/src/roles.rs#numbers
  - crates/foes/src/board.rs#Board
  - crates/foes/src/senses.rs#sense
  - crates/foes/src/share.rs#share
  - crates/foes/src/share.rs#sooner
  - crates/foes/src/tuning.rs#SHARE_HOLD
  - crates/foes/src/awareness.rs#stir
  - crates/foes/src/awareness.rs#latch
  - crates/foes/src/awareness.rs#look
  - crates/foes/src/noises.rs#Noise
  - crates/foes/src/director.rs#Director
  - crates/foes/src/director.rs#BANDS
  - crates/foes/src/tactics.rs#decide
  - crates/foes/src/leash.rs#leash
  - crates/foes/src/leash.rs#unoccupied
  - crates/foes/src/brain.rs#Orders
  - crates/foes/src/brain.rs#breaks
  - crates/foes/src/rally.rs#broken
  - crates/foes/src/rally.rs#hold_ground
  - crates/foes/src/leash.rs#fall_back
  - crates/foes/src/brain.rs#keep_to
  - crates/foes/src/flank.rs#drift
  - crates/foes/src/flank.rs#ring_of
  - crates/foes/src/pace.rs#may
  - crates/foes/src/board.rs#go_in
  - crates/foes/src/tuning.rs#BEAT
  - crates/foes/src/react.rs#defend
  - crates/foes/src/tell.rs#throw
  - crates/foes/src/shoot.rs#ranged
  - crates/foes/src/shoot.rs#draw_ticks
  - crates/foes/src/cover.rs#hold
  - crates/foes/src/cover.rs#stances
  - crates/foes/src/noises.rs#stir_of
  - crates/foes/src/board.rs#claim
  - crates/foes/src/lib.rs#NoSpots
  - crates/foes/src/steer.rs#controls
  - crates/foes/src/steer.rs#across
  - crates/foes/src/tuning.rs#OFF_FLOOR_NEAR
  - crates/foes/src/tuning.rs#MELEE_TOKENS
  - crates/foes/src/tuning.rs#POST_SEEK
  - crates/room/src/foes.rs#step_foes
  - crates/room/src/foes.rs#tell_brains
  - crates/room/src/foes.rs#noises
  - crates/room/src/foes.rs#shout
  - crates/room/src/judging.rs#settle
---
# Foes

The brain every foe fights with: DFO's Enhanced AI, its tactics and its telegraphed blows, built upon so foes use the
guard, the parry and the dodge of [[Combat]] too ([[Combat Is Soulframe's, With DFO's Enhanced AI]],
[[Pick - Enhanced AI]]), with project-final's perception, cover, flanking and combat director on top
([[project-final's AI Comes Over Onto DFO's]], [[Pick - project-final AI]]). Who the foes are (factions, types, ranks,
phases) is [[Enemies]].

## How it works

- **One crate for every machine.** The `foes` crate stands on the `combat` crate's rules. Each tick the room hands a
  foe's brain what it knows (the room's tick and seed, every fighter, the course's blocks, routes and firing spots,
  which the room's [[Navmesh]] gives, and the room's director), and the brain asks its fighter for controls and
  buttons, as a player's keys would, telegraphed blows included; the combat rules carry them out. A brain may drive a
  fighter on the players' side, as the Brig's crew are ([[Enemies]]): it fights the factions by a foe's rules (its
  reach, parry window, telegraphed blows and stir), and its telegraphed blows are never judged against a player, nor
  a player's spells against it. What the room saw happen (a swing begun, a shot loosed, a blow landed on it or by it,
  its telegraphed blow's landing, a noise, an ally's shout) it tells the brain, which notes it for its next thought. The foes of a room share a board of turns.
  Chance comes from a hash of the room's seed, the tick, the foe and what is being decided, so the same seed plays the
  same fight.
- **Roles.** Every type of foe fights as one of five roles; its rank scales the role's numbers ([[Enemies]]). Reaction
  is the ticks from seeing a swing begin to answering it; the shares say how often it parries, blocks or dodges a swing
  at it, the rest it takes. As a Major:

| Role | Health | Poise | Weight | Might | Reaction | Parry / block / dodge | Its telegraphed blows |
|---|---|---|---|---|---|---|---|
| Skirmisher | 45 | 18 | light | 1.0 | 15 | 5% / - / 45% | lunge |
| Swordsman | 70 | 35 | medium | 1.0 | 16 | 15% / 35% / 10% | sweep, lunge |
| Brute | 130 | 70 | heavy | 1.1 | - | - / - / - | slam (iron), sweep |
| Archer | 50 | 18 | light | 1.0 | 18 | - / - / 25% | aimed shot |
| Captain | 160 | 60 | heavy | 1.2 | 14 | 25% / 30% / 15% | sweep, lunge, charge, leap |

  A foe may have a level: its health is its rank's times 1.07 for each, and its blows on a player and theirs on it
  are made with the power of [[Gear]], its rank's might and its phase's on top. A player's blows on it strike half
  again and its blows on a player three quarters, at every level ([[Gear]], "Blows"; [[The Balance Pass Goes Halfway Back, and Loot Follows Destiny 1's Order]]). A foe of level 0 has no power, and fights by
  these numbers and those two alone. A garrison's foes stand at their island's levels ([[Enemies]]).

  A skirmisher is a coward: below a fifth of its health it runs, once, for 8 s.
- **Awareness.** A foe's awareness is one level from 0 to 1, raised each tick by the strongest thing that stirs it, and
  it believes that thing's place. Sight of a fighter of another side raises it by up to 5 a second, scaled by how near
  (1 at its feet, nothing at its range: 14 m, a shooter's 51.2 m) and how nearly ahead (nothing at 90 degrees off its
  facing), with nothing between their chests. Noises raise it by their loudness, less with distance, to nothing at their
  reach: a gunshot 2.0 to 40 m, a bow or crossbow 0.7 to 10 m, a swing or a blow landing 1.0 to 15 m (heard where it
  lands), a fighter running 0.42 to 8 m each half second. A noise whose line from it to the foe's chest passes through a
  block or a dungeon's wall ([[Dungeons]]) carries half as loud and half as far. A foe pays no heed to its own side's
  noises. With no target, a foe hears the stir of every foe of another faction, 0.2 a second at its feet to nothing at
  60 m (halved through a block, as any noise), so two factions left apart beyond sight find each other; a player makes
  no such stir. With nothing stirring the level bleeds 0.16 a second, but not while it fights or hunts. Above 0.02 a foe
  is **suspicious**: it turns and walks up to 3 m toward what stirred it. At 1 it is **alert**: it shouts once, waking
  allies within 12 m toward that place, and takes the nearest it sees that its leash lets it fight (or another, sharing
  out: below), or the one that strikes it (a blow alerts at once). Seen farther off than its range, a target is pursued,
  not fought; a shooter pursuing one walks on until it stands 6 m inside its range. Out of sight, its target is hunted
  where it was last seen for 5 s, its turn kept 1.5 s (DFO's stale lease); then it **searches**: walks to within 1.4 m
  of the place, sweeps its gaze at 2.2 radians a second out and back for 2.6 s, then lets go, and its level bleeds back
  to idle. Suspicious, hunting or searching, it stops short of the place behind an ally that already stands nearer it,
  within 1.2 m. The foe's soft lock holds its target, but while it answers a blow, the striker. A player just stood
  again is left be for 3 s, unless they strike first, and their feet make no noise.
- **The veil.** A Veiled fighter ([[Combat]], "Statuses") is not one a foe sees, takes as a target, answers or aims at:
  a foe fighting one lets it go at once and swings or winds up at it no more, though a wind-up already under way still
  lands. Its noises still stir a foe. Its own blow ends the veil, and the foe it strikes takes it as its target.
- **Sharing out.** Foes that see several fighters of another side share themselves out among them. A foe goes for
  the one it could strike soonest: its run there, and a beat for each other foe already fighting that one, as blows
  at one target land a beat apart. It leaves the nearest, or the one it fights, only for one it would strike half a
  beat sooner, and only for one its leash lets it fight. Alert with no target, it weighs every fighter it sees.
  Fighting, it weighs again only while it waits its turn on the ring, free, every 0.27 s (DFO's target timer), and
  only once it has fought its target 5 s. A fighter that strikes it draws it at once, unless the one it fights stands
  within its reach and 0.3 m (as DFO's foes keep a target in sight within 2 m), or a blow drew it in the last 5 s.
  Backing off or running, no blow draws it; mid-blow, winding up or reeling, it turns once free. With one fighter in
  sight a foe fights as it always did; turns, the beat, the line, the flanker, the chase and the leash stay each
  target's own.
- **Moving.** A foe walks and runs at three quarters of a player's pace, 3.3 and 5.7 m/s
  ([[Foes Walk and Run at Three Quarters of a Player's Pace]]). It asks no more of itself (`FOE_PACE`), crossing a
  climb or a drop too: its slower moves
  keep their speeds, and steering apart from its allies may push it a little faster for a moment, but never on along its
  way past its own run, so a player running away gets away. It faces a bearing of its own and turns at 320 degrees a
  second; walking somewhere it turns first and steps only within 45 degrees of its way, so no foe walks backwards. It
  runs to a spot more than 5 m off, and, in its turn, after a target walking away from it faster than 0.5 m/s, which at
  a walk it would never close on: it closes in by as far as the target walks on while its blow comes round, but no
  nearer than their bodies touch, and there keeps the target's pace; it follows it through its swing at a swing's pace,
  so the blow lands. Foes without a turn keep their places on the ring. It finds its way by the room's routes, and stops
  by its distance to the target, never to a route's corner. Foes of one side steer apart inside 1.2 m of each other,
  pushed at up to 0.7 of a walk, and the part of a foe's move that walks into an ally turns aside round it, all of it
  within 0.8 m, so a foe going in slips past an ally rather than through it. Each ally turns the move as asked, not as
  another already turned it, so a foe between two is held back rather than tossed from one to the other. Nothing is
  moved but by its own controls.
- **Climbing.** A foe climbs and drops by the [[Movement]] rules, as a player does, where its way crosses one of the
  [[Navmesh]]'s links. At the link's start it turns square to the block's side, then walks on, neither running nor
  steered apart, pressing jump where the link goes over: the rules vault it, mantle it, catch the lip it jumps for, or
  climb it up a wall too high to grab, or walk it off an edge and drop it. On a wall, or in the air, it presses on the
  way it faces, so it goes up and over whatever its thinking asks. Struck or set down short, it finds its way again from
  where it stands. Its own steps, a hop back from its blow or its circling, hold at an edge more than a step high: only
  a link drops it. Nor do they take hold of a wall too high to grab: faced within the rules' 45 degrees of square into
  such a wall that its step makes no way into, it looks 0.02 radians wider of square that tick and moves on as asked,
  along the wall; only a link climbs it. A target within 4 m across but higher or lower than a blow reaches (1.4 m) is
  as far as the walk to it, so a foe beneath a ledge goes up to it rather than swing at it from below.
- **The leash.** A garrison foe ([[Enemies]]) is leashed to its place in its group, at its post or on its beat, which
  holds still while the group fights ([[Foes Leash to Their Posts and Fall With Their Boss]]). Once its target stands 50
  m from that place, or stands on the ground off the room's navmesh (more than 1.5 m across from the mesh's nearest
  point, or on no level it has), it gives its fight up once no wind-up of its own is under way: its target, its turn,
  the blow it saw coming and its answer, its hunt, its search, its awareness, and a roar its health no longer calls for.
  It sheds its Expose and its Charge ([[Combat]], "Statuses") and walks back by the room's routes, healing each tick the
  share of what it lacks that a tick's walk is of the way left, so it is whole as it arrives (from 40 m, about 12 s),
  then turns to face as its place does and stands idle. Walking back it heeds nothing it sees or hears and shows as
  idle, so the one it gave up on cannot draw it out again at once. A blow on it brings it back, alert with the striker
  as its target; one struck from past its leash it gives up again. A foe a player asked for, or one a Boss called, has
  no post and never leashes. A foe a page playing a course alone stands where it wants it ([[Server]], "A course a page
  plays alone") is posted where it stands and leashes to it; a Boss stood so calls no one in its phases, so a scene that
  places its own foes keeps them as it placed them. A target in the air, hanging, climbing or going over a lip is judged
  by its distance alone, so a foe fights on at one on a wall or over a ledge.
- **Home after a search.** A garrison foe whose search finds no one (its look about ends, or its awareness bleeds back
  first) walks home the same way, healing (from 20 m, about 6 s). On this walk it heeds what it sees and hears as ever:
  they raise its awareness, and once it is alert it takes its target or searches again; short of that it walks on home,
  so a passing stir never leaves it standing short of its post. Either walk home takes a Boss or a Miniboss back to its
  first phase, and the foes it called fall ([[Enemies]]); walking home after a search it roars into no later phase, so
  it arrives whole in its first. With nothing stirring it, a garrison foe keeps to its place: one a stir drew off, or an
  ally walking past moved, walks back to it once idle. While its group walks its beat it keeps up with its place,
  walking at the share of a walk that its distance behind is of 2 m, its own walk at most, and faces its way.
- **Its group.** A garrison foe does as its group asks ([[Enemies]], "A garrison";
  [[Foes Fight in Groups That Lead, Break and Give Ground, After Bungie]]; the numbers are Claude's,
  [[Foe Groups as Claude Builds Them]]):
  - **Broken**, as its group's leader falls, for 8 s it gives its turn up and falls back to cover: a shooter holds its
    fire behind its post's cover, and any foe runs behind the nearest firing spot within 11 m that hides it from its
    target and stands no nearer it, and holds it facing its target, its guard up if it bears a shield. In the open, a
    skirmisher runs from its target as a coward does, a shooter steps back to its place in its group by the room's
    routes, facing its target (with no place, it holds where it stands), and any other huddles on the farther ring a foe
    backs off to, its guard up if it bears a shield. Broken, it neither hunts its target out of sight nor closes on one
    past its range. On the ring it takes no opening but the riposte or the counter it earned; behind cover, or running,
    it answers no blow at all.
  - **Raging**, for the rest of its fight: it takes a turn at once, one over the turns' cap at most, never backs off or
    runs, never parries, blocks or dodges a blow nor holds up its guard, runs at its target, and after a blow only hops
    back before it waits again; it holds no ground its group defends or gives. The beat between blows holds it as it
    holds any foe. Its rage ends as its fight does: its awareness let go, or its leash given up.
  - **Defending**, a fighter hand to hand fights only a target within 8 m of its place in its group, or a target whose
    blow struck it in the last 5 s, or one that has stood within its range (14 m) of its place for a foe's patience (6
    s), until that one goes out of its range again; past that it gives its turn up, keeps to its place and faces its
    target, its guard up if it bears a shield. A shooter hides twice as long between its looks out.
  - **Falling back**, as its group's places move to where it gives ground, a foe fighting gives its turn up and runs
    there by the room's routes, its target and its awareness kept, striking nothing on the way (a wind-up of its own
    it finishes first), and fights again once within 1 m of its place.
  - **Screened**, a leader waits a ring farther out than its place in the line, right behind the shield-bearer of its
    screen its group names, if any, taking no turn, waiting in no line for one and never flanking, so the first of its
    followers to have waited goes in; walked in on, it fights back where it stands. **Going in**, its screen gone, it
    takes a turn at once, one over the cap at most.
- **Turns and the ring.** By the room's heat, one to three foes a target fight it hand to hand at once and one to
  three shoot at it (the director, below). One of those with a turn goes in at a time, the rest keeping to the ring
  until it has struck: it walks in to its reach, squares up within 22.5 degrees, waits 0.3 to 0.9 s and swings once;
  then it hops back for at most 0.4 s, holds its ground 0.8 to 1.6 s, and hands its turn on: the foe that has waited
  longest goes next, and one that has waited 6 s goes in, one over the count at most, so a crowd's patience never
  piles it onto its target. A target who turns its back (more than 110 degrees) on a waiting foe in its place near the
  ring (the flanker, or one in the line), or walks in on one inside the ring's near edge, is open to it without a
  turn, but to one such foe at a time. A foe walked in on fights back where it stands, though another goes in. One
  open to a turned back keeps to the ring like a holder while another goes in, then goes in. Either goes on fighting
  while the target stays that close. A back walking away is no such opening: the one whose turn it is runs after it.
  A foe that blocks holds its guard up on the ring while it waits its turn, as a shield-bearer does: it raises it
  within 0.3 m of the ring's line and keeps it up across the ring's give and the step back in from just past it. A
  holder going in takes the shortest way.
- **The beat.** Blows at one target land one at a time. A foe begins a swing, a telegraphed blow or a shot there only
  if it lands 1.2 s or more after the latest blow another foe has begun there lands, so a person can answer each
  before the next. A shot lands after its flight from where it leaves, ahead of its shooter's chest, to the edge of
  the body it strikes; an aimed shot leaves as its wind-up ends. Of the foes ready in reach that the beat holds back,
  the first held strikes first. A shooter looses only into a beat no foe ready in reach waits for, so its shots fill
  the gap while the next goes in. A foe's own last blow never holds back its next, and its riposte and its counter
  are never held back, so one foe alone fights at its own pace.
- **The line.** The waiting stand on a ring 1.5 m outside their reach, with 0.6 m of give, in a line before their
  group's side of the target: the bearing where the foes fighting it hand to hand stand round it, once the mean of
  their bearings leans a quarter of the way one way, else the way the target faces. A place more than 75 degrees off
  the line's middle moves to the line's nearer end, and the foe walks there while more than 2.5 m round, else circles
  at up to 0.4 of a walk, three times its distance from its place a second, so a place drifting on draws it along
  without a stop; in the line a place closes up toward the middle, stopping 2.5 m short of the next foe that way. So a
  player facing a group sees every foe that waits, with a way out behind.
- **The flanker.** One waiting foe at a time **flanks** instead: a skirmisher before any other, a foe with no shield
  before none, and a shield-bearer never, as it holds the line. Its place drifts 0.4 radians a second away from where
  the target faces, past the line, out to 100 degrees either side of its face, and it keeps flanking through its own
  turn. A foe alone at its target keeps no line: its place flanks the same way, stopping 2.5 m short of the next foe on
  the ring (dead ahead, it takes a side by its number).
- **Room on the ring.** The waiting keep apart. The nearest ring holds as many as stand 2.5 m apart along the line;
  the rest, in the order they wait, stand on a ring 2.5 m farther out, holding as many as fit along its own line, and
  so on, so the next to go in stand nearest; the flanker stands on the nearest. Nearer than 2.5 m to the next on its
  ring, a foe's place moves toward the middle of the room between its neighbours, so a crowded ring evens out. A
  waiting foe stands on its ring's own line, not merely within its give: inside the ring once it has held its ground
  after its blow, it steps back out at 0.4 of a walk. From afar it makes for its own place on the ring rather than for
  its target, so the waiting come in spread round it. A place is no place to wait when a block stands between its
  target's chest and it, as beyond a wall the target stands against, or when a block too high to step onto stands
  within a body's width of it. Making for such a place from afar, or standing where its own place on the ring would
  be one, it makes for its target by the room's routes instead, and comes onto the ring on its own side. On the ring
  its place moves round only into places open to it, so it is never led into a block's face. Stepping back out from
  inside the ring with a block behind it, it steps toward the nearest place round the ring, by twelfths of a turn,
  that is open to it.
- **The director.** The room keeps one heat from 0 to 1 for its fight, at rest 0.35. It rises 0.0022 for each point of
  health the players' side (players and their companions) takes from foes, and of what a foe's shield takes, counted
  as combat is tuned for (divided by what the foe's level grows its health by, so a matched player heats the fight
  alike at any level, and by the players' `PLAYER_HARM`), and 0.09 for each foe they kill, falls 0.006 for each point
  a player or companion loses, counted before the foes' `FOE_HARM` (three times as fast), and eases back to rest with
  a time constant of 6 s. By its heat, the turns: below 0.25 one hand to
  hand and one shooting, from 0.25 two and two, from 0.6 three and two, from 0.85 three and three; a holder keeps its
  turn when they drop. Above 0.6 a bias rising to 0.3 at full heat shortens patience, the swing delay, the beat and
  the ring's gap by its share. A dominating player meets more foes at once; one being beaten, fewer.
- **Swings.** A chop into a raised guard, a sweep when two or more stand in reach before it, a thrust at the edge of
  reach, otherwise a slash, chop or thrust by chance. Its wait before a swing begins in reach and runs on while its
  target sways out to 0.3 m past it. A foe that guards keeps 30 stamina for its guard; short of a swing and that, it
  hands its turn on. Blocked twice running by a guard still raised and facing it, it stops swinging into it: it winds up
  a telegraphed blow if it may, else steps round toward the side the guard faced away from as it was walled, at 0.7 of a
  walk, keeping to that side, and strikes from outside the guard; walled off 2 s, it chops at the guard again. A new
  target starts its count afresh. A foe's riposte after its own parry, its counter after a perfect dodge, and, in its
  turn, a swing at a target spent in its own swing's follow-through, staggered or tending a bow (not one knocked down:
  the iron blow already punished that), are struck at once with a chop.
- **Backing off and running.** A quarter of its health lost inside 3 s (counted from its health at its level as it
  stands), or, for a foe that guards or dodges, its poise four fifths full: it hands its turn on and walks out to a ring
  2 m farther, then holds it facing its target, for 2 s in all, at most once in 10 s.
- **Shooters.** A shooter shoots its own weapon: a bow drawn 1.0 s, a crossbow 1.3 s, a pistolet 1.2 s, a thunderlock
  1.5 s, aiming up for a bolt's or arrow's fall, 0.5 to 1.5 s between shots; its shots strike as a player's quick shot
  does ([[Combat]], [[Ranged Weapons Aim and Fire]]). A foe's gun ball flies at 70 m/s (pistolet) or 110 m/s
  (thunderlock), so it can be read and dodged, where a player's reaches its mark at once. A ranged turn gates a shot
  and a shot spends it; held 5 s unused it goes on, and a shot drawn with it goes too: the shooter lowers its weapon.
  Drawn, it looses in the beat between its allies' blows (above). A drawn shot strikes times the foe's might, as its
  blows do.
- **Cover.** With cover near, a shooter takes a **post**: among the firing spots within 11 m that have cover, one where
  either the spot hides it from where it believes its target is and a step of 1.2 m aside has the line, or the other way
  round. It scores each by 1.5 a metre to walk there, 3 a metre outside its weapon's band of distance (bow 10 to 18 m,
  crossbow 12 to 20, pistolet 8 to 12, thunderlock 14 to 24, a Marksman's half as far again), less up to 3 as its cover
  faces its target squarely, and up to 2.5 more the nearer it stands before its target's face; never nearer its target
  than 7 m (a Marksman's 10.5) nor within 3 m of another's post; the lowest wins. Its walk is costed by the room's
  route there, which goes round blocks: the spots are weighed first with a straight walk, cheapest first, and only the
  cheapest 24 are worked out, their routes for at most 6, stopping once no spot left could cost less; one shooter of
  a room picks a tick, and another that would stands that tick facing its target and picks at the next. A spot hides it
  where a block stands across both the line from its eye (1.6 m up) and the line from its chest to its target's chest,
  and fires where both lines are clear; its step aside is the shortest of 0.6 to 2.0 m, by fifths of a metre, that
  turns its stance about and still does a fifth of a metre short of it, and costs 3 a metre, walked out and back each
  shot. At its post it hides 1.5 to 2.5 s, then looks out for up to 1.5 s (longer while drawing); with its turn it
  draws behind cover, steps out, looses only on a clear line and falls back to reload. One turn in three, by the dice
  of the tick it took the turn, is an aimed shot while it may throw one: it steps out at once, its weapon unraised, aims
  on the line and falls back after; hurt, it hides as it backs off. It picks again when its target moves 4 m from
  where it picked, when the line from its firing point closes or its hiding point opens; looking out and finding no one,
  it picks once more where it believes its target is, and failing again, hunts. Out of sight behind its own cover, it
  keeps its post. With no cover near it fights in the open: without a turn it stands off and holds its fire, never
  circling. A target inside 6 m it walks away from at a full walk, one burst of at most 3 s, out to 7 m (a Marksman's
  9 and 10.5), then shoots; out of time short of that, it shoots from there. Caught (its target inside 2.5 m as its
  burst ends, or while it may not kite) or cornered, it fights close with its fists for 3 s, its post given up, and
  kites again only 8 s after; between 2.5 m and its ring it shoots.

## Answers to blows

A foe answers as a person would, no faster and no surer, at the fight's pace. Alert and seeing a swing begin at it (the
striker within its reach and a metre, aiming at it, and in front of it: a blow from more than 110 degrees off its facing
is not seen coming), it waits its reaction time (13 to 22 ticks by its role and rank, a person's 220 to 370 ms) at the
swings' pace: every swing takes three quarters of its old time ([[Combat]]), and so does reading one, 10 to 17 ticks, so
a foe answers a swing about as often as it did. Then it decides once, by its own shares and what it is doing. A parry
presses the guard 2 to 14 ticks before the blow lands, by the dice, as a person's timing wanders: within 9 (a foe's
parry window, three quarters of a player's) the window spans the landing, earlier it has closed and the guard only
blocks; never later than 2 ticks before. A block raises the guard only if its window will have closed before the blow
lands (raised later it would parry, which a block is not), or keeps one already held; too late for that, it takes the
blow. A dodge hops aside and a little back, still facing the blow, pressed 2 to 14 ticks before the landing. Mid-swing
it can only dodge. A shot, which flies as fast as ever, is read in the whole reaction time, and timed by its distance
and the speed the room says it flies at (an aimed shot's faster than its weapon's plain one): a shield-bearer blocks it,
others may dodge it. Only the swing or shot of a fighter of another side is weighed, never an ally's. Waiting on an
answer, a foe neither swings nor winds up a telegraphed blow; while it answers, it faces the striker. The room judges a
player's blow against a foe where the player's screen showed it but guarding and dodging as it is now ([[Server]]), so
these answers count the same at any lag.

## Telegraphed blows

DFO's TELL. A holder of a melee turn, free, off its cooldown and seen to its target, with no other wind-up within 20 m
of that target, winds one up with DFO's one in ten a classic tick of 1/16 s, here 2.8% a tick (81% a second), when it
would land in the beat (above). In reach (and half a metre) it picks among its blows of reach, each only at a target
that, moving as it moves now, still stands in reach as the blow's shortest wind-up ends; out of it, a charge from 5 to
12 m along a lane clear of blocks or a leap from 3 to 9 m at its target's feet. Its wind-up is the shape's times 0.9 to
1.25, an elite's times 0.9, never under 0.6 s; the combat rules add iron's 0.2 s. A heavy body's slam and ring are iron,
and an elite's blow is iron one time in three. Its cooldown is 8 to 15 s, an elite's 6 to 11, from the end of the
wind-up. A Miniboss's or a Boss's blades feint one wind-up in five, cut at 0.55 of it and never two within three
wind-ups, and swing at once after; a gap-closer, a chain or a shot never feints. Once the room says the blow landed on
someone (it judges each player as their screen showed it, so the foe stands its ground up to half a second for the
word), it is followed, 35% of the time for an elite, by a chained blow: a sweep then a lunge, a lunge or a slam then a
sweep, a ring then a slam, wound up 0.6 s, an elite's ×0.9 as any wind-up, and never under 0.55: long enough for a
person who was just struck to react. A blow that ends without a chain is the holder's turn, spent; one that missed
leaves it overreached, and it hands its turn on. A shooter's shot is aimed one in three, its line as long as its target
is far.

A Minor throws none, and a Major only some of its role's ([[Enemies]]). A Miniboss's two phases (its first throws
more often than an Elite's) and the three of each Boss, its own, are [[Enemies]]'.

## Limits

- A foe answers one blow at a time: a second swing seen while it answers the first is not weighed.
- A wind-up goes on when its foe changes target (DFO's breaks it).
- A shot is taken to leave as the room says it was loosed; a draw is not read.
- Flanking stops at 100 degrees, short of a turned back.
- Foes share themselves out only among the fighters they see, within their range and their arc: a player 25 m from a
  group's fight draws none of it until they come nearer or strike a foe.
- The line's middle follows where its own foes stand, so in a long fight against a still target it wanders slowly.
- Several foes parrying one sweep each riposte at once: a riposte is never held back by the beat.
- A foe with no post, only stirred and never alert, walks up to 3 m toward the stir and stays where it stopped.
- Walking back to its post after a leash a foe heeds no one, so another player may walk beside it unopposed until they
  strike it.
- On a wall or in the air a foe goes on up whatever it is asked; it never lets go of a climb to turn back.
- A foe's dodge is the fight's own hop, not a step: by a ledge's edge it may drop the foe, which then climbs back.
