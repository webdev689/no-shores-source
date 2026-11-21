---
type: system
status: live
code:
  - crates/room/src/public/mod.rs#schedule
  - crates/room/src/public/mod.rs#open_public
  - crates/room/src/public/mod.rs#keep_public
  - crates/room/src/public/fissure.rs#play_fissure
  - crates/room/src/public/raid.rs#play_raid
  - crates/room/src/public/chest.rs#open_chest
  - crates/room/src/public/walk.rs#walk_inert
  - crates/room/src/public/seen.rs#public_seen
  - crates/gear/src/chests.rs#open_chest
  - crates/layout/src/grounds.rs#mark
  - crates/layout/src/grounds.rs#store_boxes
  - crates/layout/src/grounds.rs#grounds_of
  - crates/navmesh/src/lib.rs#join
  - crates/foes/src/factions.rs#LATTICE
  - crates/protocol/src/public_wire.rs#public_offset
  - crates/room-wasm/src/public_door.rs#parting
  - client/src/network/publicMessages.ts#publicOf
---
# Public Events

Saltmere's patrol zones run public events on a clock, as Destiny 1's do: the Fissure, where the Lattice pour out of
the ground until players seal it with crystal, and the Grey Tithe's raid on a hamlet's stores. The owner decided what
they are ([[Public Events Run on a Clock, After Destiny 1]], [[Public Events Are Built in Full, on Claude's Autonomy]]);
the numbers and the rest are Claude's ([[Public Events as Claude Builds Them]]). The server's room is the only
authority: the page draws what each snapshot says.

## How it works

**The clock.** Each of the three zones (`saltgrass-downs`, `gullwing-vale`, `driftwood-moors`) runs one event every 15
minutes of wall time, the zones 5 minutes apart, so somewhere on Saltmere one begins every 5 minutes. A zone
alternates its two, and the zone after it runs the other one at the same time. `schedule(zone, minute)` gives the
event a Unix minute falls in and the minute it starts; it is a pure function, so the room, the page and the tests agree.
The host sets the room's minute about once a second; an event begins in the first tick its minute comes, and a room
opened during one starts it with the countdown its start minute leaves, to the minute. A room keeps no event across
its closing. A room left empty stops ticking but may stay open: when the minute it is given jumps, its event keeps no
more than the countdown its start minute leaves, and one past its end is ended quietly, with no result, no chests and
its foes gone (unjumped, two minutes past its end). An event has 8 minutes; won or failed, its result shows for 12
seconds, and the next is shown from then.

**The grounds.** The layout marks them with its other sites ([[Layouts]]): three stores in each hamlet, on clear
ground beside its houses within 35 m of its plaza, 8 m apart, 1.5 m clear of every building, set piece and prop and 2 m
off every way; the point its raiders come in from, 36 m out toward the zone's nearest camp (the Vale has none: from the
shore); their two banners, 28 m out, 6 m either side; and in each wilds where its fissure opens, 12 m (or 9, or 15)
from its middle beside the obelisk its battlefield stands there, on ground 15.4 m east and west and 9.8 m north and
south (the fissure's own mesh, square to the grid, its long side east and west) clear of the obelisk, the ruins and
everything standing, and the spot its crystal growth rises, 14 to 20 m from the fissure. A store stands square to the
grid as one of three stacks (the page draws store `n` as the stack after its own), and its box, which a body runs
into on the page and in the room alike, covers that stack and the plundered one it turns into: 2.604 by 2.049 by 1.73
m high, 2.5 by 2.224 by 1.27 m, or 2.6 by 2.049 by 0.9 m; each is laid out in 2.604 by 2.224 m, room for any of
them. The bake writes a zone's grounds into its node file, for
Saltmere's three zones only: the Fissure's at its fissure's site, 25 m round, with its growth's spot; the raid's at the
middle of its stores, reaching 10 m past the farthest (20 m at least), with its stores, approach and banners.

**The navmesh.** A node's room bakes its mesh round its garrison only ([[Navmesh]]). As a zone's room opens, it bakes a
rectangle round each ground (the Fissure's circle and its growth's spot; the raid's circle, its approach and where its
waves form) 16 m further, as far as a player shoots into the fight from, and joins them to the garrison's as parts of
one mesh, with no way between them. Baking both grounds as Saltmere's real node files open, natively in a release
build, measured once: 466 ms for Saltgrass Downs, 497 ms for Gullwing Vale, 550 ms for Driftwood Moors. In
WebAssembly it is not measured.

**Its foes**, its growth and its tithe-taker among them, stand at the top of the island's band raised by the voyage's
seas, at home round the event's ground, hunting the nearest player there. Each fights a player within a leash of the
event's reach (its ground's radius, or its farthest point from its middle past it: the growth's spot, the approach,
where the raid's waves form) and 16 m more, measured from its own place (the ground's middle, or a Collector's post
at its store), on ground the room's mesh covers; past that it gives them up and walks back. A zone's room that holds
events stands 40 foes alive at most and keeps 16 of them for its event (the most it stands at once: a Fissure's
living foes short of a wave, its fullest wave and its growth or Warden); its garrison stands again, calls and arrives
only while the foes not of the event stay within 24, as in any other node. The growth, the Warden and Marrow stand half their health more for
each player at the event beyond the first (the most seen at the Fissure; those on the raid's ground as Marrow comes).
The Fissure's growth and the raid's tithe-taker the room moves itself: their brains are left be, so neither moves on
its own nor strikes, and each walks the navmesh at its own pace, keeping its way from tick to tick; their statuses
still wear off. A raid's approach, where its waves form and its raiders' home (the stores' middle) are put on the
navmesh as it begins, at its nearest point.

**The Fissure.** It opens and a wave of the Lattice pours out of it, 4 m round its middle: three foes and one more for
each player seen at it beyond the first (six at most), drawn from Husks, Flickers, an Idol and a Ravager. Another
comes when two or fewer of its foes stand, but never sooner than 30 seconds after the last, or 40 seconds after the
last, while fewer than ten stand: the shards come at a pace a group must keep up with. Each of its
foes felled drops a crystal shard where it fell, an Elite or greater two. A player walks within 1.5 m of a shard to
take it, carries one at a time and sets it within 6 m of the middle. A shard lies 30 seconds; a carrier who falls or
leaves drops theirs where they last stood. It needs 16 shards and 6 more for each player seen at it at once
beyond the first, 40 at most; once sealed, more players coming never raise it. Its four crystal spires (the module's
parts) are boxes a body runs into while it stands open; its mouth is open ground. Sealed, it closes: every foe of it
still standing shatters, sharing no kill, and it is won.
- **Heroic.** At 40% of the seal a crystal growth (an Idol's Elite health, named "Crystal Growth") rises at its spot
  for 45 seconds, rising over its first 2.4 and sinking over its last 3, as the page draws it, then is gone. A body
  walks through it: a box round it would stop every blow and shot at it. Broken in time, the event turns heroic: half of the shards
  still needed are added, every wave after holds an Elite (a Bulwark or a Ravager by turns), and the seal complete
  brings out the Warden (a Bulwark Miniboss, "The Warden of the Fissure"), who must fall to win; then the rest shatter.
- **Bonus:** sealed with at least half of the 8 minutes left; a Warden falling later keeps it.

**The raid.** Its banners are planted and its first wave forms out of sight, 14 m beyond its approach, away from the
hamlet, and marches in: two Collectors, two Runners and a
Crossbowman, the Runners and the Crossbowman Minors. The second brings two Collectors, an Enforcer, a Crossbowman and a
Runner; the third two Collectors, an Enforcer, and a Marksman and a Reeve, both Elite; every other foe is a Major. One
Runner more comes in each for each player on the ground beyond the first (three at most). A party of two or fewer on the ground meets each wave a rank
lower where a type comes lower: the Runners, Collectors and Crossbowmen as Minors, the Marksman as a Major Crossbowman.
A wave is broken when its foes have all fallen; the next comes 30 seconds later, or 30 seconds after that while the
room has no room for it. Each Collector is sent to the standing store nearest it, to defend its ground there, 1.9 m from the store's
middle on the side the raiders come from; one standing within 2.5 m of its store plunders it, alone in 20 seconds.
A store plundered sends its Collectors to the next and loses the bonus. Every store plundered, the raid fails; the
last wave broken with a store standing, the Tithe give up and march out, and it is won.
- **Heroic.** With the second wave comes the Tithe-Taker, an Elite who never strikes, or as soon after it as the room
  has room for him. He walks from where the waves form to
  each standing store, nearest first, counts it for 10 seconds, and walks back out, at the pace that makes his round
  50 seconds (1.2 to 3.5 m a second); his time up, he is gone wherever he stands. Killed before then, the event turns
  heroic: the third wave holds an Enforcer Elite and a Marksman Elite more (they come at once if it is already in,
  eased for a small party as the wave is),
  and a fourth comes, led by Reeve Ancel
  Marrow, the Tithe's Hand (a Reeve Miniboss), with two Collectors and an Enforcer Elite; a raid waits for him to go
  before it can be won.
- **Bonus:** no store lost.

**Failing** by time or by stores leaves nothing lasting. Its foes withdraw, the room moving them: the Lattice into the
crack, the Tithe back to where they formed, at 4 m a second, each gone once it gets there or within 8 seconds.

**Taking part, and the chests.** A player took part who stood on the ground for 30 seconds of the event, or struck one
of its foes, or set a shard; their part is kept by their account, so leaving and coming back loses none of it. On a win each of them gets a chest of their own, 3 m from the ground's middle on their
side, seen by them alone: tier 1 won, 2 won with the bonus, 3 heroic, 4 heroic with the bonus. They open it within 2.5
m (`Asked::OpenChest`, ask 21 by the chest's number among their drops); it pays at once and is gone, so it never pays
twice. One not opened is opened for its player as its 2 minutes run out, or as they leave the room: the server opens
a leaver's chests (`room_parting`) before it keeps their character. A chest is of the event's level, raised by the voyage's seas,
and its XP and Aurem are the seas' reward times as much, as a kill's are. It holds, at level 5 and growing with the
event's level as a kill's worth does: 1,500, 2,200, 3,200 and 4,500 XP by tier, which grow the worn Art and the faction
pledged while its cape is worn as a kill's XP does; 120 to 360 Aurem; 2 to 7 of each Fragment; Essence from the heroic
tiers (1, 2); 3 to 8 of the island's resource; and a Vestige always, a foe's colours from a plain chest and a Boss's
from a heroic one, the bonus's tier rolling twice and keeping the better. A Vestige with no room in the ten goes to
the vault, and with no room there either lies on the ground where the chest stood, as any drop does; a leaver's goes
to the vault however full, since the ground they leave would lose it.

**The wire.** Each snapshot of a zone's room carries `public_event` ([[Server]]): the event running or showing its
result (kind 1 the Fissure, 2 the raid, 0 none) and its phase (0 waiting, 1 running, 2 won, 3 failed), its ground and
radius, its countdown in ticks; the next's kind, ground and ticks until it starts; its stage of how many; its progress
toward what it needs (shards set of shards needed, or the stores' health left per mille); its heroic task (0 not yet,
1 offered, 2 met, 3 missed) and its window's ticks; whether its bonus holds; the ticks until a raid's next wave comes
in (0 while none is on its way); and its marks, each a 24-byte struct, its place in f32: the fissure (how far open),
the growth (rising, standing, sinking, broken), each store (whole, plundered; always, even waiting), each shard lying
(its life left) and carried (by whom), the tithe-taker (arriving, counting, leaving), each banner and the approach.
New fight events: 14 begun, 15 next stage, 16 a shard taken, 17 a shard set, 18 heroic met, 19 heroic missed, 20 won,
21 failed, 22 a store plundered, 23 a chest opened. A heroic window still open as the event is won or failed is told
missed before the result, so the result is the last beat of its tick. A foe carries the name it stands under, if any;
a drop of kind 3 is
a chest, with its tier. The browser reads it all in `client/src/network/publicMessages.ts`.

**Agreement.** Every path is tested natively in `crates/room/src/public/`. Two scripted players, reading only their
snapshots, play a whole Fissure and a whole raid through the room's door and win each, heroic
(`crates/room-wasm/src/public_door_tests.rs`); the same script, run through WebAssembly by `server/public.test.ts`,
comes to the same fingerprints ([[Agree to the Bit]]).

## The page

The snapshot's `public_event` is kept by the fight (`Fighting.public`), and its events (14 to 23) apart from the
fight's, which read every event as a blow. Each frame on foot, `game/publicView.ts` turns them into what the player
sees and hears; the words are `game/publicLaw.ts`'s, worked out from the event alone.

- **The banner** (`combat/publicBanner.ts`), HTML through the kit as every part of the HUD is, stands in the compass's
  column under the compass and over the boss bar and the target's plate, so neither stands on it. Running: "Public
  event" (or "Heroic public event") over the name and place, the countdown at the right, the objective and its bar
  (shards set of needed; the stores' health, with the wave in the objective and the next one's countdown while it
  comes), the heroic task with its window's
  countdown while it is open ("Break the growth", "Kill the tithe-taker"; for its first 5 s the call "A crystal growth
  rises: break it!" or "The tithe-taker has come to count: kill him before he goes") or "Heroic" once met, and the
  bonus ("seal it before 4:00", "lose no store"), struck through once lost. In the last minute the clock is red and
  pulses. A player carrying a shard reads "Carrying a shard: take it to the fissure"; a store under attack puts
  "Store under attack" before the objective. Away from the ground, the metres to it stand beside the place. Over, for
  its 12 s: "Event complete" with the chest's tier, or "Event failed" and why. Between events, one line: the next
  event, where, and in how many minutes (m:ss in its last minute, counted on by the page), and under it what runs or
  comes next elsewhere on Saltmere, from the same schedule. Its tone (gold, heroic orange, won green, failed red) runs
  down its left edge; it slides in afresh at each beat (begun, a stage, heroic met or missed, won, failed, the heroic
  chance opening with an orange flare, the next a minute off). A screen reader hears each beat on a line of its own,
  never the ticking clocks.
- **The tracker** (`tasks.ts`) holds the steps while one runs: the shards still to carry or the Warden; the wave and
  the stores still standing; the heroic task; the bonus while it holds. After, "Open your chest (1:48)" while a chest
  lies, over the two minutes it lies.
- **The boss bar** shows the climax's Miniboss, the Warden or Marrow, without the phase line; the music takes its
  boss part while one stands. On the ground of a running event the music holds at tension at least, at the peak in
  its last minute and once heroic is met.
- **The compass** marks the ground (the next one's between events) with a gold diamond, and the growth or the
  tithe-taker with an orange one, blinking, while the heroic window is open; a chest waiting with a small gold one; a
  store under attack with a red one.
- **Marks**: a ring at the ground's edge while it runs, laid on the land arc by arc, orange once heroic is met; a
  pillar of red light over each shard on the ground, fading with it; an orange one over the growth or the tithe-taker
  while the heroic window is open; a tall gold beacon over the ground for a player outside it, from a minute before it
  starts; a pillar over each chest waiting; the fissure's 6 m lip round a player carrying a shard; a small bar over
  each store while a raid runs (red and flashing under attack, a ring round the store filling as it is plundered, an
  orange one round the store the tithe-taker counts); the seal's shock ring spreading 45 m. `game/publicMoments.ts`
  works out these moments from the event as it was and as it is.
- **Props**: the marks go through `eventProps()` to the props' drawer every frame, each carried shard moved to its
  carrier's off hand as drawn (the player's own low in the left of a first-person view); the player's chests come
  from their drops (drawn as props, not as drop pictures), and E within 2.5 m opens the one in reach (its lid swings
  and it stands open 6 s from the asking). The fissure, its scar and the stores stand square to the grid, as the
  room stands them; the Tithe's banner is drawn in its grey canvas. The page's own movement and fight stand the
  fissure's four spires (`game/fissureSpires.ts`) at its mark while it runs, as the room does. The crystal's lamps go
  with them, and a warm one at each raid banner's head. The fissure's chasm is seen through its mouth: each point of it under the ground is drawn at the depth where
  the eye's line crosses the land at the foot, a little nearer, so the land there gives way and nearer land or houses
  keep theirs. Its crack flares at each beat, its width eases to the room's, and a shard set arcs into it over 0.4 s.
  The Fissure won bursts the Lattice's death wave at four times a man's size where it seals (`sealWave`), in its
  picture's own texels; each Lattice foe coming while it runs climbs out of its wave played backwards. A raid won
  topples its banners; a failed Fissure closes into the plain turf. A Lattice figure's crystal glows of itself at
  night. The ground trembles (the camera's shake) as the Lattice pours out, a shard is set and the seal bursts.
  A room lost leaves no event on the screen, and a page come mid-event or back from a hidden tab replays no beat.
- **Sounds**, all samples the game already holds: the ground splitting (`story.deep`) or the Tithe sighted
  (`foe.alert`) as one begins and at each stage; a shard taken (`element.cosmic`, and the player's own chimes) and
  set (`finish.cosmic`); the growth broken (`shield.break`) or the tithe-taker killed (`kill`); the seal's burst
  (`story.crash`); a store plundered (`sea.ship.break`); a chest opened (`story.creak` and the interface's open); a
  heroic task missed (the interface's refusal); the heroic chance (`cast.charge` at its target); the next a minute off
  and the start (`drop.land` at the player and a chime); the Warden climbing out (`story.crash`); a chest coming
  (`drop.land`); the last ten seconds (the interface's tick); a raid won (`amb.social.crowd`) or failed
  (`story.crash`). A chest opened shows in the reward feed with its tier as four pips, its XP and its reputation. **Stings**, through the music director's `moment`, in the place's own
  fight score: its cadence as one begins, its victory for heroic met and won, its defeat for failed.
- **Alone**, the page asks its land worker for the node's grounds (`land_grounds`, from
  `layout::grounds::grounds_of`, which the bake calls too, on the same layouts), so a room in the page runs the
  events the server's does. Under `npm run dev` (or a build made with `NODE_ENV=development`),
  `/?at=<zone>&public=fissure|raid` sets the room's clock so that event starts at once.
  Beside it, `&speed=<n>` runs n room ticks a drawn frame, `&bots=<n>` joins n scripted players that play the event
  as the rules' test plays it (`network/publicBots.ts`, the same `decide`; the browser's test proves they reach the
  rules' fingerprints), and `&heroic=0` leaves the heroic task alone. The bots and the page's own player stand at the
  test's level 6 with Rare gear. The page puts `__play` on the window for a picture script: its `speed`, `putPlayer`,
  `read`, and `until` (a test of each tick's snapshot that stops the frame's ticks once met), and `__qaLook` turns
  the camera without arriving again, so the room plays on. None of it is in a production build.

## Limits

- A ground's mesh that overlaps the garrison's joins no way across the two; none of Saltmere's three does.
- A zone's events wait for the host to set the room's minute, and a room never holds an event across its closing.
- The scripted players stand at level 6 with Rare gear at 6, over Saltmere's band of 1 to 4: two players at its band
  were not tried against a heroic raid's third wave.
- The Heart is in the roster only: it has no phases of its own and stands in no event.
- The stores, banners, fissures and growth spots are chosen before the layout stands its beacons and resource marks,
  so they could meet; `crates/room/tests/grounds_planned.rs` holds Saltmere's three layouts clear of them, and each
  fissure clear of its battlefield's obelisk and ruins.
- A vault filled past its 20 by a leaver's chest shows more than its limit until its player takes some out.
- The fissure's chasm is drawn 2 to 4% of its distance nearer the eye than the land at its mouth: land rising more
  than that over the mouth's foot hides part of it, and anything standing that close in front of the mouth is drawn
  behind it.
- A chest's two minutes in the tracker run from when the page first saw it: a page come later counts the whole two.
- A store's box covers both its whole and its plundered stack, so a body meets it as the larger of the two.
- The fissure's spires are not in the navmesh: a Lattice foe's way may run into one.
- The marks that never move (the stores, the banners, the approach) go in every snapshot: a land room's snapshot is
  one for every player, so sending them only when they change would need the welcome to carry them and the page to
  keep them; packed, they are 24 bytes each.
