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
its closing. An event has 8 minutes; won or failed, its result shows for 12 seconds, and the next is shown from then.

**The grounds.** The layout marks them with its other sites ([[Layouts]]): three stores in each hamlet, on clear
ground beside its houses within 35 m of its plaza, 8 m apart, 1.5 m clear of every building, set piece and prop and 2 m
off every way; the point its raiders come in from, 36 m out toward the zone's nearest camp (the Vale has none: from the
shore); their two banners, 28 m out, 6 m either side; and in each wilds the spot its crystal growth rises, 14 to 20 m
from its middle. A store stands 2.4 m east and west, 1.6 m north and south and 1.6 m high, square to the grid, and is
a box a body runs into on the page and in the room alike. The bake writes a zone's grounds into its node file, for
Saltmere's three zones only: the Fissure's at its wilds' middle, 25 m round, with its growth's spot; the raid's at the
middle of its stores, reaching 10 m past the farthest (20 m at least), with its stores, approach and banners.

**The navmesh.** A node's room bakes its mesh round its garrison only ([[Navmesh]]). As a zone's room opens, it bakes a
rectangle round each ground (the Fissure's circle and its growth's spot; the raid's circle and its approach) 4 m
further, and joins them to the garrison's as parts of one mesh, with no way between them. Opening Saltmere's real node
files, measured once, best of three:

| Zone | Natively, before | After | In WebAssembly, before | After |
|---|---|---|---|---|
| Saltgrass Downs | 130 ms | 277 ms | 170 ms | 345 ms |
| Gullwing Vale | 110 ms | 264 ms | 208 ms | 449 ms |
| Driftwood Moors | 99 ms | 345 ms | 147 ms | 444 ms |

**Its foes** stand at the top of the island's band and the voyage's seas, at home round the event's ground, hunting
the nearest player there; they never leash back to a garrison's post. They count toward the 32 foes alive a zone's room that holds events stands (24 in any other node's). The
Fissure's growth and the raid's tithe-taker the room moves itself: their brains are left be, so neither moves on its
own nor strikes, and each walks the navmesh at its own pace.

**The Fissure.** It opens and a wave of the Lattice pours out of it, 4 m round its middle: three foes and one more for
each player seen at it beyond the first (six at most), drawn from Husks, Flickers, an Idol and a Ravager. Another
comes when two or fewer of its foes stand, but never sooner than 30 seconds after the last, or 40 seconds after the
last, while fewer than ten stand: the shards come at a pace a group must keep up with. Each of its
foes felled drops a crystal shard where it fell, an Elite or greater two. A player walks within 1.5 m of a shard to
take it, carries one at a time and sets it within 6 m of the middle. A shard lies 30 seconds; a carrier who falls or
leaves drops theirs where they last stood. It needs 16 shards and 6 more for each player seen at it at once
beyond the first, 40 at most. Sealed, it closes: every foe of it still standing shatters, sharing no kill, and it is won.
- **Heroic.** At 40% of the seal a crystal growth (an Idol's Elite health, named "Crystal Growth") rises at its spot
  for 45 seconds, 2 rising and 2 sinking, then sinks back. Broken in time, the event turns heroic: half of the shards
  still needed are added, every wave after holds an Elite (a Bulwark or a Ravager by turns), and the seal complete
  brings out the Warden (a Bulwark Miniboss, "The Warden of the Fissure"), who must fall to win; then the rest shatter.
- **Bonus:** sealed with at least half of the 8 minutes left.

**The raid.** Its banners are planted and its first wave comes in round its approach: two Collectors, two Runners and a
Crossbowman, the Runners and the Crossbowman Minors. The second brings two Collectors, an Enforcer, a Crossbowman and a
Runner; the third two Collectors, an Enforcer, and a Marksman and a Reeve, both Elite; every other foe is a Major. One
Runner more comes in each for each player on the ground beyond the first (three at most). A party of two or fewer on the ground meets each wave a rank
lower where a type comes lower: the Runners, Collectors and Crossbowmen as Minors, the Marksman as a Major Crossbowman.
A wave is broken when its foes have all fallen; the next comes 30 seconds later, or 30 seconds after that while the
room has no room for it. Each Collector is sent to the standing store nearest it, to defend its ground there, 1.9 m from the store's
middle on the side the raiders come from; one standing within 2.5 m of its store plunders it, alone in 20 seconds.
A store plundered sends its Collectors to the next and loses the bonus. Every store plundered, the raid fails; the
last wave broken with a store standing, the Tithe give up and march out, and it is won.
- **Heroic.** With the second wave comes the Tithe-Taker, an Elite who never strikes. He walks from the approach to
  each standing store, nearest first, counts it for 10 seconds, and walks back out, at the pace that makes his round
  50 seconds (1.2 to 3.5 m a second); his time up, he is gone wherever he stands. Killed before then, the event turns
  heroic: the third wave holds an Enforcer Elite and a Marksman Elite more (they come at once if it is already in),
  and a fourth comes, led by Reeve Ancel
  Marrow, the Tithe's Hand (a Reeve Miniboss), with two Collectors and an Enforcer Elite; a raid waits for him to go
  before it can be won.
- **Bonus:** no store lost.

**Failing** by time or by stores leaves nothing lasting. Its foes withdraw, the room moving them: the Lattice into the
crack, the Tithe out the way they came, at 4 m a second, each gone once it gets there or within 8 seconds.

**Taking part, and the chests.** A player took part who stood on the ground for 30 seconds of the event, or struck one
of its foes, or set a shard. On a win each of them gets a chest of their own, 3 m from the ground's middle on their
side, seen by them alone: tier 1 won, 2 won with the bonus, 3 heroic, 4 heroic with the bonus. They open it within 2.5
m (`Asked::OpenChest`, ask 21 by the chest's number among their drops); it pays at once and is gone, so it never pays
twice. One not opened is opened for its player as its 2 minutes run out, or as they leave the room: the server opens
a leaver's chests (`room_parting`) before it keeps their character. A chest holds, at level 5 and growing with the
event's level as a kill's worth does: 1,500, 2,200, 3,200 and 4,500 XP by tier, which grow the worn Art and the faction
pledged while its cape is worn as a kill's XP does; 120 to 360 Aurem; 2 to 7 of each Fragment; Essence from the heroic
tiers (1, 2); 3 to 8 of the island's resource; and a Vestige always, a foe's colours from a plain chest and a Boss's
from a heroic one, the bonus's tier rolling twice and keeping the better. A Vestige with no room in the ten goes to
the vault, and with no room there either lies on the ground where the chest stood, as any drop does.

**The wire.** Each snapshot of a zone's room carries `public_event` ([[Server]]): the event running or showing its
result (kind 1 the Fissure, 2 the raid, 0 none) and its phase (0 waiting, 1 running, 2 won, 3 failed), its ground and
radius, its countdown in ticks; the next's kind, ground and ticks until it starts; its stage of how many; its progress
toward what it needs (shards set of shards needed, or the stores' health left per mille); its heroic task (0 not yet,
1 offered, 2 met, 3 missed) and its window's ticks; whether its bonus holds; and its marks: the fissure (how far open),
the growth (rising, standing, sinking, broken), each store (whole, plundered; always, even waiting), each shard lying
(its life left) and carried (by whom), the tithe-taker (arriving, counting, leaving), each banner and the approach.
New fight events: 14 begun, 15 next stage, 16 a shard taken, 17 a shard set, 18 heroic met, 19 heroic missed, 20 won,
21 failed, 22 a store plundered, 23 a chest opened. A foe carries the name it stands under, if any; a drop of kind 3 is
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
  (shards set of needed; the stores' health, with the wave in the objective), the heroic task with its window's
  countdown while it is open ("Break the growth", "Kill the tithe-taker") or "Heroic" once met, and the bonus, struck
  through once lost. Over, for its 12 s: "Event complete" with the chest's tier, or "Event failed" and why. Between
  events, one line: the next event, where, and in how many minutes. Its tone (gold, heroic orange, won green, failed
  red) runs down its left edge; it slides in afresh at each beat (begun, a stage, heroic met or missed, won, failed).
- **The tracker** (`tasks.ts`) holds the steps while one runs: the shards still to carry or the Warden; the wave and
  the stores still standing; the heroic task; the bonus while it holds.
- **The compass** marks the ground (the next one's between events) with a gold diamond, and the growth or the
  tithe-taker with an orange one, blinking, while the heroic window is open.
- **Marks**: a ring at the ground's edge while it runs, laid on the land arc by arc; a pillar of red light over each
  shard on the ground, fading with it; a small bar over each store while a raid runs.
- **Props**: the marks go through `eventProps()` to the props' drawer every frame, each carried shard moved to its
  carrier's off hand as drawn (the player's own low in the left of a first-person view); the player's chests come
  from their drops (drawn as props, not as drop pictures), and E within 2.5 m opens the one in reach (its lid swings
  and it stands open 6 s after the room has taken it). The crystal's lamps go with them. The Fissure won bursts the
  Lattice's death wave at four times a man's size where it seals (`sealWave`).
- **Sounds**, all samples the game already holds: the ground splitting (`story.deep`) or the Tithe sighted
  (`foe.alert`) as one begins and at each stage; a shard taken (`element.cosmic`, and the player's own chimes) and
  set (`finish.cosmic`); the growth broken (`shield.break`) or the tithe-taker killed (`kill`); the seal's burst
  (`story.crash`); a store plundered (`sea.ship.break`); a chest opened (`story.creak` and the interface's open); a
  heroic task missed (the interface's refusal). **Stings**, through the music director's `moment`, in the place's own
  fight score: its cadence as one begins, its victory for heroic met and won, its defeat for failed.
- **Alone**, the page asks its land worker for the node's grounds (`land_grounds`, from
  `layout::grounds::grounds_of`, which the bake calls too, on the same layouts), so a room in the page runs the
  events the server's does. Under `npm run dev` (or a build made with `NODE_ENV=development`),
  `/?at=<zone>&public=fissure|raid` sets the room's clock so that event starts at once.
  Beside it, `&speed=<n>` runs n room ticks a drawn frame, `&bots=<n>` joins n scripted players that play the event
  as the rules' test plays it (`network/publicBots.ts`, the same `decide`; the browser's test proves they reach the
  rules' fingerprints), and `&heroic=0` leaves the heroic task alone. The bots and the page's own player stand at the
  test's level 6 with Rare gear. The page puts `__room` on the window, whose `speed` and `until` (a test of each
  tick's snapshot that stops the frame's ticks once met) a picture script drives, and `__qaLook` turns the camera
  without arriving again, so the room plays on.

## Limits

- A ground's mesh that overlaps the garrison's joins no way across the two; none of Saltmere's three does.
- A zone's events wait for the host to set the room's minute, and a room never holds an event across its closing.
- The scripted players stand at level 6 with Rare gear at 6, over Saltmere's band of 1 to 4: two players at its band
  were not tried against a heroic raid's third wave.
- The Heart is in the roster only: it has no phases of its own and stands in no event.
