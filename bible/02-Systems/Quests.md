---
type: system
status: live
code:
  - content/quests/quests.json
  - content/story/houses.json
  - crates/gear/src/quest_defs.rs#QuestsDef
  - crates/gear/src/quests.rs#QuestLog
  - crates/gear/src/quests.rs#Event
  - crates/gear/src/gifts.rs#Gift
  - crates/gear/src/gifts.rs#give_gift
  - client/src/game/quests/questNews.ts#giftNotice
  - client/src/game/quests/questNews.ts#stepsBetween
  - crates/gear/src/quest_defs.rs#OfferDef
  - crates/gear/src/quests.rs#quest_offered
  - client/src/game/quests/questBook.ts#offeredAt
  - client/src/game/quests/questCard.ts#bookCard
  - crates/gear/src/arts.rs#WornArts
  - crates/room/src/quests.rs#QuestGround
  - crates/room/src/quests.rs#set_places
  - crates/room/src/quests.rs#ground_of
  - crates/room/src/quests.rs#held_near
  - crates/gear/src/quest_goals.rs#GoalDef
  - crates/gear/src/quest_lessons.rs#RideAct
  - crates/gear/src/quest_lessons.rs#SailAct
  - crates/room/src/lessons.rs#keep_lessons
  - crates/room/src/sea_lessons.rs#keep_lessons
  - crates/room/src/sea_lessons.rs#moor_hulk
  - crates/room/src/sea_lessons.rs#charted
  - client/src/game/quests/lessons.ts#lessonKeys
  - crates/gear/src/quest_defs.rs#speaker_place
  - crates/room/src/steps.rs#Step
  - crates/room/src/steps.rs#way_between
  - crates/room/src/steps_horde.rs#unbounded
  - crates/room/src/steps_horde.rs#HORDE_NEXT_AT
  - crates/room/src/steps_kinds.rs#step_seen
  - crates/room/src/steps_kinds.rs#use_point
  - client/src/network/questMessages.ts#questOf
  - client/src/game/quests/questFigures.ts#questActors
  - client/src/game/quests/questFigures.ts#wardPlate
  - client/src/game/quests/questLooks.ts#FACES
  - client/src/game/quests/questNews.ts#momentsBetween
  - client/src/game/quests/questNews.ts#metBetween
  - client/src/game/quests/questNews.ts#giftsBetween
  - client/src/game/quests/questFigures.ts#FigureGlides
  - crates/room/src/steps_kinds.rs#walk_figure
  - client/src/game/quests/quests.ts#riders
  - client/src/game/tasks.ts#toldChange
  - client/src/game/journalWords.ts#questCardsOf
  - client/src/game/characterPage.ts#NO_ART_WORDS
  - crates/protocol/src/quest_wire.rs#quests_of
  - crates/bake/src/sites.rs#places_of
  - client/src/game/quests/questBook.ts#trackedOf
  - client/src/game/quests/questBook.ts#linesBetween
  - client/src/game/quests/questWatch.ts#QuestWatch
  - client/src/game/quests/quests.ts#Quests
  - client/src/player/factionNames.ts#earnedOn
  - client/src/combat/casting.ts#CastKeys
---
# Quests

The houses' roads and the opening that leads to them ([[Each House Has Its Own Road to Its Art]],
[[The Houses' Roads as Claude Shapes Them]]), the base every other quest is built on
([[The Factions Are the Baseline for Every Quest]]). The rules are the authority: a player's place in every road is kept
in their character, every goal is judged by the room the player stands in, and every reward is given there. The page
only shows what the rules say: the tracker, the lines, the marks, and the Art's locks.

## The file

`content/quests/quests.json` holds the quests in order. The rules build it in and the page imports it, so both read one
file. A quest has an `id`, a `name`, a `faction` (0 for the opening, else the house's number in
`content/gear/factions.json`), the scene played as it begins (`begin`) and its `tasks`. A task has the words the tracker
shows (`task`), its scenes (`start`, played as it begins; `end`, played as it is done), its `goals`, all met before the
next task begins, and its `reward`, given as it is done. Any goal may name a `scene`, said as the room meets it. A quest
may name the quests it comes `after` (by id); a house may have several. A quest may name the task a character kept
before it held any place in it reads at (`kept`). The quest walked is the first in the file of the pledged house's (the
opening's, unpledged) not done whose `after` are all done. A task may list the ids it had (`was`); a save at one reads
as that task, its counts at nothing. A goal has its tracker words (`text`), a `count` (1 when left out) and its kind:

| Kind | Met by | Its fields |
|---|---|---|
| `talk` | Speaking with a keeper within reach of their counter; its `scene` is said then | `to`: a counter's key: a house's (`stormcallers`, `lamplighters`, `veiled`), or `mage`, `vault`, `armorsmith`, `weaponsmith`, `tailor`, `tack`, `harbourmaster`, `mail` (the Postmaster); or `stranger`, heard anywhere in a social space |
| `pledge` | A pledge at any house's chapel | |
| `reach` | Standing within a place's reach in a node | `node`, `place`: a name its layout gives an area or a run |
| `kill` | Foes falling that the player struck, as a kill's reward is shared | `node`, `place` (within its reach and 40 m past it), `types` (the roster's names), `rank` (this or higher), `island` (`cove` or `isle`), `spawn` (below) |
| `gather` | A resource node gathered, anywhere | |
| `cast` | A spell cast | `spell`: its name in `content/arts/arts.json` |
| `sea` | A hostile ship beaten at sea: sunk, struck or its deck taken | `side` (`tithe`, the Grey Tithe's), `how` (`sink`, `strike` or `board`) |
| `land` | Landing on a sea island | `island` (`cove` or `isle`) |
| `scavenge` | A wreck searched on a sea island | |
| `enter` | Arriving in a node | `node` |
| `escort` | A figure met at a place riding a horse at a gallop to another while the player rides with it; it waits while they lag, while they are off their horse and while an ambush stands | `node`, `from`, `to` (places), `who` (a speaker of the cast), `horse` (the coat its horse wears), `near` (metres; 30 on both roads), `ambush` (`[type, rank]`s stood halfway), `shout` (its bark as they come), `greet` (said as its figure first rides), `mount` (said as it waits for the player to get on their horse) |
| `tail` | Following a figure from place to place at a distance: never nearer than `far`, never past `near`; nearer, it notices and walks back to start again | `node`, `from`, `to`, `who` or `foe` (a roster type's look), `far`, `near`, `noticed` (its line), `greet` (said as its figure first walks) |
| `defend` | A ward standing at a place through its waves of foes, one after another, each brought by a Grey Tithe airship under the open sky ([[Foe Arrivals as Claude Builds Them]]; [[Enemies]], "Arrivals"); if it falls, the waves leave and it is tried again after a wait. With `horde`, no ward: the waves come at the player (below, "A house's horde") | `node`, `place`, `ward` (its name) or `who`, or `horde: true` and neither, `waves` (lists of `[type, rank]`; a horde's 8 foes at most a wave), `lost` (its line, a horde's said as the player falls) |
| `puzzle` | Points round a place used in the right order, or in any order when it gives none (a point lit already does nothing); a wrong one puts them all out and stops uses for 2 s, then 4, then 8 (ask 66 answers 103 meanwhile) | `node`, `place`, `points` (each a `name`, a `bearing` in degrees from north and `at` metres out), `order` (any order when left out), `wrong` (its line) |
| `unseen` | Standing within `within` m of a place's middle with no foe turned alert on the player; seen, it waits until no foe has been on them for 10 s. Its watch stands idle on a ring `within` m round the middle as the step begins, each facing outward; only a foe within 60 m of the middle counts as seeing | `node`, `place`, `seen` (its line), `spawn` (`[type, rank]`s), `within` (metres, 8 when left out, at most 35) |
| `buy` | A smith's ware bought, of the day's or the starter stock: the character keeps each slot a smith has sold it a piece for (`bought`), so one bought before its task counts as the task begins; a piece looted or given never does; the slots are let go once a task with a buy goal is met, so a later one counts only its own purchases | `slot`: `melee`, `ranged`, `head`, `torso`, `arms` or `legs` |
| `wear` | A piece worn in a slot; one worn already counts as its task begins (the room hears every piece worn after each ask) | `slot`, as `buy`'s |
| `race` | Passing checkpoints in order before the clock runs out; the clock starts as the player leaves the first's reach; late, it starts again from the first. A race is run over the ground, not along the paths | `node`, `checkpoints` (places, two or more), `seconds`, `late` (its line) |
| `ride` | A rider's act, as the room steps them each tick, however it was pressed: `mount` up on a horse, `walk` 10 m ridden at a walk, `gallop` 30 m ridden faster than 10.5 m/s, `boost` a boost running, `dismount` down from the saddle after riding there, `arrive` within 8 m of a keeper's counter in the saddle | `act`, `to` (an arrival's counter, as `talk`'s, and no other act's) |
| `sail` | A captain's act, as the sea sails their ship each tick: `board` aboard at sea, `sail` under way, `steer` turned 30 degrees in all while under way (a ship putting to sea turns onto its first leg unsteered), `trim` the pace changed between the ladder's paces while under way (sailing on at ×60, a voyage planned at ×200), `map` the held map raised at the helm (the page's word, ask 4), `fire` a ball of theirs striking the Harbourmaster's hulk ("The lessons") | `act` |

A `kill` goal with a `spawn` stands its foes at its place: a list of `[type, rank]`, each the roster's name and a rank
it comes in. A player on that goal coming within 150 m of the place stands the group there, at the node's island levels
raised by its seas, as a garrison's group that never stands again once it falls; while the goal is unmet and none of
the group stands, the next to come near stands it again; once no player in the room is on its goal and it fights no
one, it is sent away. Anyone may fight it, and each kill counts for every player who struck it. The room bakes a navmesh
square round each such place the first time it is wanted ([[Navmesh]]), so the group holds its
place, fights there and walks back to its post as a garrison's group does.

A reward gives Aurem (`aurem`, any quest's), the Art (`art`, its Anima with it, worn at once), a Tenet (`tenet`: 1 or
2, in the Art's order), fragments to choose (`fragments`: how many choices), the first horse (`horse`: the Bay,
worn where none is, never a second), the first ship (`ship`: the Sloop, never a second; [[Shipyard]]), or a keeper's
gift (`gift`, by its name: `weapons`, `armour`, `vestige`, `cloak`, `dye` or `letter`; below, "The opening"). Which Art
is the quest's house's. A task's reward is given as it ends; a goal may carry one of its own (`reward` beside its other
fields), given as it is met, of Aurem, the first horse or a gift alone: a house's gifts come with its tasks, in their
order, and the ship with its own task
([[The Tack Gives the First Horse, the Prologue Ends in Plain Clothes, and Each Speaker Is Named in a Colour]]). A
lesson's goal (`ride`, `sail`, `use`) has a count of 1. Beside it, every task that sends the player out (any goal but
`talk`, `pledge`, `buy`, `wear` and `use`) pays a mission's clear at their level, 400 XP and 30 Aurem at level 5 raised
as a kill is, as Destiny 1 paid each mission done ([[Gear]], "A clear";
[[The Balance and Economy Pass as Claude Shapes It]]).

## The opening

"A House of Your Own" walks a new player round Overlook, then to a house
([[The Stranger Welcomes the Player, and a Quest Walks Them Round Overlook]], the keepers' gifts in
[[Keepers Give Gifts, the House Arts Come With a Horde, Escorts Ride, and the Horse and Ship Are Taught]]; Claude's
calls in [[The Prologue, Horses and the Welcome to Overlook as Claude Builds Them]] and
[[The Welcome's Gifts, the Hordes, the Ride and the Lessons as Claude Builds Them]]): **Hear the stranger out** (her
welcome, [[Prologue]]; it gives nothing); **Find your way round Overlook**, speaking at each counter in turn (the
Weaponsmith, the Armorsmith, the Mage, the Vault, the Tailor, the Tack and the Postmaster), each keeper saying what
their counter is for and what they give, and giving it as they are spoken with (their goal's `gift`, given by the room,
`gear::gifts`):

| Keeper | Gift | What it teaches |
|---|---|---|
| The Weaponsmith | One Melee and one Ranged piece of her starter stock, free, chosen at her counter: every Melee and every Ranged kind is offered there, Normal at the player's level, and one of each slot is free while owed (`weapons`) | Choosing a loadout, and buying at a smith's counter |
| The Armorsmith | Her starter stock's head, torso, arms and legs, Normal at the player's level, carried (`armour`) | Wearing armour |
| The Mage | A sealed Magic Vestige for the head, at the player's level, carried (`vestige`) | Having a Vestige opened |
| The Vault Keeper | A Normal cloak at the player's level, laid in the vault (`cloak`) | Taking a piece out of the vault |
| The Tailor | Harbour Blue, a dye, kept (`dye`) | Wearing a dye |
| The Tack | The Bay Horse, worn (`"horse": true`) | Riding |
| The Postmaster | A letter (its source the keepers' gift) holding a sealed Magic Vestige for the legs, at the player's level (`letter`) | Taking a letter |

Each gift is given once a character, kept by name in its quest log (`gifts`), so a second hearing, a reload, a rejoin or
a later round never gives it again; the Weaponsmith's slots still free are kept beside it (`free`) until taken. A gift
with no room where it goes is kept as anything found is: armour carried, else in the vault, else posted; a Vestige
carried, else posted; the cloak in the vault, else carried, else posted. Then **Ride the Bay**, the Tack's lesson
("The lessons"), the Harbourmaster calling the player down to his stall as it begins (`rideBegin`); **Take your ship
from the Harbourmaster**, its reward the Sloop (`"ship": true`), which a new player has none of until then
([[Shipyard]]), his lines sending the player out to a Tithe hulk moored offshore; **Learn the helm**, his lesson at
sea; **Bring it home**, an `enter` goal of Overlook's social space ("Dock at Overlook"), his line said as it is done
(`sailHome`); and **Put them on**, a wear goal for each of the Melee weapon, the four armour pieces and the Ranged
weapon, each a count of 1, told of the pieces held after every answered ask and as every task begins, again until
nothing more counts, so pieces worn during the round meet it as soon as it begins; plain clothes never do; then **Use
your gifts** ("Using the gifts" below). The Tack's Bay is worn unless one is, never a second,
and at her counter for nothing to one who pledged before the round reached her
([[Other Ships Wear Their Players' Marks, the Sea Map Has No Fog, and New Players Ride a Bay That Bursts]],
[[The Tack Gives the First Horse, the Prologue Ends in Plain Clothes, and Each Speaker Is Named in a Colour]]). Then
**Hear the three houses** (Arlo Kestrel, Elder Maren Hale and Sable each introducing their house, [[Factions]]); and
**Choose a house**, the pledge. Its `begin` is the Weaponsmith calling the player over; the houses' task begins with
Arlo's word to hear all three.

The page announces each gift as it comes, as a notice at the foot of the screen ([[Interface]], "Notices of what is
obtained"), through one function, `giftNotice`: the Weaponsmith's, the Armorsmith's and the rest as their goals are
met, the Sloop as its task is done, each by its keeper's mark; the Armorsmith's tells the Character key, the Tack's
the Mount key.

### Using the gifts

**Use your gifts** follows **Put them on** and teaches the four gifts the round gives and does not use, each a `use`
goal of a count of 1 that the room ticks as it answers the ask (`Event::Used`, from the ask itself, `UseAct::of`),
never on the page's word, met in any order:

| Step | Its act (`act`) | Met by | Pointed at |
|---|---|---|---|
| Have the Mage open a Vestige | `identify` | Any Vestige opened | The Mage's counter (`to`: `mage`) |
| Take your cloak from the vault | `withdraw` | Any piece taken out of the vault | The Vault Keeper's counter (`vault`) |
| Wear a dye | `dye` | Any dye worn (a cosmetic of the dye kind) | Anywhere; the tracker names the Character key (I) |
| Take your letter from the mail | `letter` | Any letter taken, one or all | The Postmaster's counter (`mail`) |

A `use` goal names the counter its act is done at, and a dye none; the file is refused otherwise. A step done before
the task begins is met as it begins and after every successful ask (`tell_held`): the Mage's Vestige (Magic, for the
head) no longer held sealed, carried or vaulted; the Postmaster's letter (its Magic Vestige for the legs) no longer in
the mail; a cloak held out of the vault, carried or worn; a dye worn other than the one every player starts in. A step
undone since (the cloak put back, the starting dye worn again) is asked again; a save kept before the gifts, with
nothing to open or take, is never stuck. Each step ticks in the tracker alone, as the lessons' do. The task
pays no clear: it is done at the keepers'. A save on the round or on **Put them on** walks on into it; one on the houses
or later is not sent back.

### The lessons

Riding and sailing are taught as the wreck teaches ([[Prologue]], "The teaching";
[[Keepers Give Gifts, the House Arts Come With a Horde, Escorts Ride, and the Horse and Ship Are Taught]]): each step
a goal the rooms tick from what the body, the horse or the ship did, so any input serves; a step done early stays
done; the tracker names each step's keys as bound now on the keys or the pad played last (`lessonKeys`), the defaults
on the keys below; and each step ticks in the tracker alone, with no notice at the foot, as the steps come seconds
apart ([[A Lesson's Steps Tick in the Tracker Alone, Not at the Foot]]); the task's "Step done" is announced.

- **Ride the Bay**, wherever the room lets a rider ride, the last step at Overlook's counters: Get up on your horse
  (`,`), Ride at a walk (W), Gallop (Shift), Spur it on (Space: a rider's jump is the boost), Get down (`,`), and Ride
  to the Harbourmaster's stall, in the saddle. The room watches a rider each tick while their task asks a riding act
  (`Room::keep_lessons`), measuring their stretches at a walk and at a gallop from the body's own pace, and forgets
  them once it asks none. The compass and the screen's mark point at the Harbourmaster's counter; the other steps
  read "Anywhere".
- **Learn the helm**, at sea: Go aboard your Sloop (N held, its step reading "Hold N to return to your ship" ashore,
  named by the leave's key as bound), Set sail (W), Steer (A, D), Trim your sails (W sails on at ×60, M plans a voyage
  at ×200), Open the held map (M), and Put a ball in the
  hulk (the right button laid and let go, the pad's RT). The sea watches each captain on it each tick
  (`Sea::keep_lessons`), keeping their heading and pace as last seen and how far they have turned under way. The page
  asks the sea (ask 4) each time the held map is raised at the helm (`Sea::charted`); the sea takes it only for a
  captain whose task asks it.
- **The hulk**: a Grey Tithe Sloop of the lowest rank, its colours struck, moored off Overlook's roadstead on the first
  bearing clockwise from north, 15 degrees apart, whose water lies clear 1,200 m out and is reached from the roadstead
  over no land (else 1,000 m; `Sea::mooring`). A captain on its step who sails within 900 m of it, out of a
  fight, is put into a fight of their own with it, their ship hove to (`moor_hulk`): it lies hove to with its hull at
  the share it struck at, is never scuttled and never boarded, and fires nothing. A ball of the captain's that strikes
  it is the step. Sailed more than 1,500 m from it while the step waits, or 900 m once the ball is in (short of the
  roadstead, so the way in is open), it leaves the fight, which ends; while the step waits it is put in again as
  they come near. Gone down, it lays nothing, pays nothing, and counts for no road and no bounty. While the
  step waits the sea's gear marks its mooring (`quest_at`, from `Sea::lesson_mark`), which the compass points at,
  and in its fight (the sea's word says which fight is the hulk's, `lesson`) the tracker keeps the quest in place of
  the fight's own task: the step, then the way home. A Tithe ship met during the lesson is fought on its own task.
- **Bring it home**: docking at Overlook enters its social space, which meets it.

Each lesson's task pays a mission's clear as it is done, as every task that sends the player out does. A save kept
before the lessons keeps its place by its task's id: one on the round rides once it is done, one on **Take your ship**
or later is not sent back, and one that pledges midway through a lesson walks its house's road from then on.

Every save keeps its place. A save on `arm-yourself` (a Melee weapon and the four armour pieces bought) reads on
**Put them on** (its `was`), its counts at nothing. A save kept partway round the counters with no gift recorded is
given, as it is read, the gift of each keeper it has heard, and the rest as it hears them. One who pledges
before the round is done is given, as they pledge, every gift the opening's tasks still held, the Weaponsmith's choice
kept free at her counter, as the Tack gives the Bay. A character past the round before the gifts (on **Take your ship
from the Harbourmaster** or later, or pledged) is owed nothing new, as one past the Tack's goal is given no Bay. A
character whose log stood at the houses before keeps its place by its task's id, and one kept with no place in the
opening reads at "Hear the three houses" (its `kept`): neither is walked round again, nor owed a gift. The Test Ground's
player reads as one kept before, on the houses, which its stall serves; the stranger is heard in a social space alone,
never at the stall.

## A house's horde

Each house's road gives its Art and at once sends the player to fight a horde with it
([[Keepers Give Gifts, the House Arts Come With a Horde, Escorts Ride, and the Horse and Ship Are Taught]]; Claude's
calls in [[The Welcome's Gifts, the Hordes, the Ride and the Lessons as Claude Builds Them]]): the Stormcallers'
**Break the Tithe on the High Downs**, after the glass is held; the Lamplighters' **Burn the wreckers off the Barrow
Field**, after the false lights are doused; the Veiled's **Let the dark out at the Chalk Adit**, after the adit is
reached unseen. Each is a `defend` goal with `horde`, at the Art task's own place on the Saltgrass Downs, of four
waves of the Tithe's roster, 29 foes in all: 6, then 7, 8 and 8, Runners, Collectors, Crossbowmen and Enforcers
(Major), at the node's levels. The house's speaker calls the horde in as it begins (its `start`) and says the power is
spent as it falls (its `end`); the next task teaches the Art's abilities one at a time.

- **How it runs** (`steps_horde.rs`): as the player comes within the place's reach, alive, the first wave stands 18
  m from the place's middle (nearer where a walk from the middle reaches no further, so none stands up a bank it
  cannot come down), on the place's baked mesh, standing at once rather than brought by an airship as a defence's
  waves are, every foe hunting the player; one that loses them is set on them
  again. Once two or fewer of the foes standing are left, the next wave stands, so the horde keeps coming. A wave the
  room's cap on foes has no room for waits a tick; one that stands nobody counts as fallen. The last wave fallen meets
  the goal.
- **Unbounded**: while the horde runs, from its first wave standing (one waiting on the room's cap on foes lends
  nothing), the player's worn Art, if it is their road's house's, is theirs whole, for them alone (another house's Art
  worn is lent nothing, and the page is sent no count): the room keeps its
  Anima and both Tenets full (a cast spends its share as ever, and the next tick fills it, its word sent at once),
  and casts any of its three abilities, a Tenet the road has not yet given included. As it ends, by its fall, the
  player's, their straying or a leave, the Art is bound again: what is earned, and the shares as they stand.
- **A fall**: the player dead, or strayed more than 36 m past the place's edge (`HORDE_STRAY`, twice as far as its
  waves stand), the waves leave, a failure counts, and it starts again from the first wave whole 10 s on, once the
  player is back within reach; its `lost` line is said. **A leave**: the waves leave with the player;
  back, it starts again from the first.
- **What it pays**: its foes drop nothing (no Vestige, no item), so the horde pays as a defence's waves tried again
  do: each kill's XP and Aurem, and the task's clear ([[Gear]], "A clear").
- **On the wire**: the gear message's `quest_horde`, its foes left and all of them while it runs (empty else); and
  while it runs the page lends the worn Art whole to its ability bar and cast keys (`ArtState.lent`), `arts_earned`
  saying only what is earned, so the road's news never takes the loan for Tenets earned. The tracker shows the foes left
  of all of them beside the goal ("17/29", as a puzzle's points lit of all), and the wait after a fall as a defence's; a
  notice under the Art's emblem says "Storm unbounded", "Every ability ready" (the worn Art's name) as it begins, and
  "Storm bound again", "Its abilities cost as before" as it ends. The ability bar shows the Art unbounded while the
  horde runs ([[Arts]], "The ability bar"), all from the room's word.

## Offered by a keeper

A quest may be offered as an item by a keeper (its `offer`;
[[Keepers, Quests and Items Obtained Follow Destiny 2's Vendor Screen]]): the keeper by their key (`keeper`, a house's
or a counter's, never the stranger's), the task from which it waits (`at`, its first when left out), and its card's
words: its `kind`, its `rarity` (the gear's numbers), its `words`, the keeper's `quote` (a line, held to [[Dialogue]]'s
words) and the scene of their longer words (`story`). The opening is offered by the Weaponsmith from **Find your way
round Overlook** (the stranger's task walks before), so her word and her gift come as it is acquired; each house's road
by its leader, at the chapel, from its first task, in its own begin's words. While the quest walked waits on the task
its offer names with nothing counted there and is not acquired, nothing of it counts, the room walks and marks none of
its goals (`goals_unmet` is empty), and no word is asked of anyone but by Acquire at that keeper's counter (ask 85),
which is a word with them and is asked once until the room answers, the keeper thanking the player for it; a save with a
place past it, or a count at it, reads as acquired. The acquired are kept by quest id (`acquired`). Claude's calls:
[[The Welcome's Gifts, the Hordes, the Ride and the Lessons as Claude Builds Them]].

## In the rules

- **Kept in the character** (`gear`, `quests.rs`), **by id**: for each quest by its `id`, the task reached by its task's
  `id` (so a quest or task added anywhere in the file keeps every save's place), each of that task's goals' counts, and
  whether it is done; and for each Art, the fragment choices waiting. A new character begins every quest at its first
  task; one that holds no place in a quest (kept before it was laid out) reads at the quest's `kept` task, else its
  first; and one kept on a task this room does not hold (a task renamed keeps its old id in `was`) reads at the quest's
  `kept` task too, else its first, so the opening's round, before `kept`, is never walked twice. The keepers' gifts
  given are kept by name (`gifts`) and the Weaponsmith's slots still free (`free`), so none is given twice whatever the
  place reads as.
- **Read leniently**: a quest log of a shape this room cannot read reads as one kept before (above) and is written back
  as it was. A fragment choice waiting for an Art none of whose fragments is left to own is paid at its price as soon as
  the room answers any ask.
- **The quest walked**: with no pledge, the opening, until it is done; pledged, the pledged house's road, until it is
  done; else none. A switch walks the new house's road from where it was left; every road keeps its place.
- **Goals are judged by events** the rooms tell the character's quest log: a counter spoken at, a pledge, a place
  reached, a foe's kill, a resource gathered, a spell cast, a ship beaten, an island landed on, a wreck searched, a
  node entered, a smith's ware bought, a piece worn. Only the quest walked takes them, and only its task now. A goal
  stops counting at its count. When every goal of the task is met its reward is given and the next task begins at once,
  its counts at nothing.
- **The Arts earned** (`gear`, `arts.rs`): for each Art, whether the Art, its first Tenet and its second are earned,
  one bit each. A character made before keeps all three of every Art. A new character has none, and wears none: the
  room casts nothing it has not earned, and refuses to wear an Art not earned. The Test Ground's player earns every one.
- **Fragment choices**: an ask names an Art and one of its fragments not owned; with a choice waiting for that Art, it
  becomes owned and the choice is spent. It is answered anywhere.

## On the wire

- **Asks**: 85 acquires the quest walked from the keeper who offers it (`column`: their number, as 64's), answered
  only within reach of their counter and while it waits for them. 66 uses a puzzle's point (`column`: its place among
  the goal's points), answered within 3 m of it and never while fallen. 64 speaks with a keeper (`column`: a house's
  number, or 10 the Mage, 11 the vault, 12 the Armorsmith, 13 the Weaponsmith, 14 the Tailor, 15 the Tack, 16 the
  Harbourmaster, 17 the Postmaster), answered only within reach of that counter; 18 the stranger, answered anywhere in
  a social space; 65 chooses a fragment (`column`: the Art's number, `node`: the fragment's place in its Art's list).
  At sea, a course message's ask 4 says the held map was raised at the helm, for the sailing lesson.
- **Whose word**: the gear message says whether its character is the player's own as their account keeps it
  (`claimed`). A player who sends an input before any token keeps no character, so the one the room holds is theirs
  from then on (`none_kept`), on land as at sea.
- **The gear message** carries, at the end of its table: the quest walked (`quest`, its place in the file counted
  from 1, 0 for none), its task (`quest_task`), that task's goals' counts (`quest_counts`), each quest done
  (`quests_done`, 1 or 0 by place), each Art's earned bits (`arts_earned`: 1 the Art, 2 its first Tenet, 4 its
  second), each Art's fragment choices waiting (`fragment_choices`), where the task's first unmet goal with a
  place stands in the player's room (`quest_at`: x, y and reach, empty when none is here; at sea, the Harbourmaster's
  hulk while the sailing lesson asks a ball in it), and the keeper offering the quest walked while it waits
  (`quest_offered`, their number as ask 64's, 0 for none).

## In the browser

- **The Journal** shows the roads as story missions ([[Interface]], "Journal";
  [[The Journal Holds the Quests, the Bounties at Its Side and the Timers at Its Top]]): a card for the quest walked,
  at its task, and one for each quest done, in the file's order, each its name, the first line its `begin` says, and
  its task's number and words; nothing from a word not on the player's own character.
- **The tracker** shows the quest walked, on foot and at sea, once the story and the stranger's welcome are past: its
  name, its task and each goal's words with its count, under an unmet goal's words its way ("Marks"), and beside an
  unmet lesson's step its keys ("The lessons").
- **Lore**: a chapter the lore's file gives to a task is found as the task is done ([[Lore]]). Each house's road
  gives its house's book a chapter a task, the last as the road ends
  ([[Each House's Lore Book Tells Its Art's Origin]]).
- **The lines** are the speech system's ([[Speech]]): a quest's `begin` as it is first walked, a task's `end` as it is
  done and the next task's `start` as it begins, a `talk` goal's `scene` as the keeper is spoken with. A page that loads
  mid-road says nothing it has said before. How they are written:
  [[Every Line Reads as Spoken, and the Lore Is Detailed, Mysterious and Gripping]].
- **Speaking with a keeper**: within reach of a counter that a `talk` goal of the task names, or whose keeper offers
  the quest walked while it waits, the offer reads "Speak with" and the keeper's name; pressed, it opens their screen
  ([[Interface]], "The social space's counters"), which asks 64 as it opens and says the goal's scene there as the room
  meets it, or shows the quest's card with Acquire. Otherwise the counter opens as before.
- **A quest offered**: while it waits, the tracker shows its name, "Acquire it" and the keeper's goal words, its mark
  leads to their counter and their keeper is lit; once acquired, the keeper's screen shows it as a small tile beside the
  crest, its card, its boxes ticking, on the pointer, the keys or a tap, until it is done. The Journal's card of a quest
  shows the same card in its hover card, a quest done with every box of its last task ticked, one waiting saying whom it
  is acquired from (`bookCard`); the tracker's steps wear the card's box.
- **What is noticed**: a quest acquired, each step done and a quest done, each gift and each Art, Tenet or fragment a
  road gives, stand as notices at the foot of the screen (`stepsBetween`, `giftsBetween`).
- **Marks**: every objective has a waypoint on the compass, on land and at sea, its distance under it, and on foot a
  mark on the screen where it points ([[Every Objective Has a Waypoint on the Compass, on Land and at Sea]];
  `client/src/game/quests/waypoint.ts`). It points at the task's first unmet goal with somewhere to point, step by step
  from where the player stands:
  - in the goal's zone, at the goal: the room's `quest_at` (its place, the figure walked with, the next checkpoint,
    the ward), else its place, a keeper's counter (any chapel for a pledge, the smith for a buy), the nearest foe of
    its types in sight, or the nearest materials to gather;
  - in a patrol whose gate leads to the goal's zone (a dungeon's, a boss's), at that gate, its step saying "Through the
    gate to" the zone; in an instance reached through a gate, back through it the same way;
  - on any other land, at the landing of the zone it is landed at, across the water, its step saying "Hold N to return
    to your ship"; at sea, at that landing, its step saying "Sail to" the zone;
  - a goal with no zone of its own at the nearest place to do it: a talk, a pledge or a buy at the nearest social space
    with its keeper, gathering at the nearest patrol with materials; one done at sea (a ship of its side beaten, an
    isle or a cove landed on, wrecks searched, an isle's leader) at the nearest in sight at sea, its step saying "None
    in sight: sail the open sea" while none is, and "Hold N to return to your ship" from land;
  - a goal done anywhere (an Art's spell cast, a piece worn, a riding act but riding up to a counter, and at sea a
    sailing act but the gunnery) at nothing, its step saying "Anywhere"; the stranger, heard anywhere in a social
    space, "Anywhere here" there; riding up to a counter at the counter, as a talk; the gunnery at sea at the sea's
    mark, and from land "Hold N to return to your ship", as every sailing act;
  - inside a dungeon, only what stands in it (a foe of the goal's types, the room's mark); on a sea's island, its
    wrecks not yet searched and, if it is of the goal's kind, its leader, any other goal back to the ship.

  The held map at sea also rings the nodes the task's goals name (the land's map, raised on foot, draws no places).
  The marks give way while the map is up. At sea the tracker shows the quest walked while no sea fight's task does.
- **A keeper to speak with is lit**: while a `talk` goal of the task names a counter, its keeper's mark over them
  pulses and is seen from everywhere in the social space, and their coin on the land's map pulses; so does a smith's
  while a `buy` goal of the task asks one of their wares (the Weaponsmith's for `melee` and `ranged`, the
  Armorsmith's for the armour)
  ([[A Keeper With Something for You Pulses and Is Seen From Everywhere]]; [[Game]], "Over what a player can use").
- **What is shown and said**: the page shows, says and marks nothing from a word not on the player's own character
  (`claimed`). A goal's `scene` is said as the room meets it, a talk goal's included (the press only asks); an escort's
  or tail's `greet` as its figure first goes, once a task; a goal's failure line, an escort's shout, and its `mount` as
  its figure begins to wait for the player to get on their horse, as they happen,
  once while one waits or is said, and not at all while the story or the welcome holds the screen. Everything else waits
  for the welcome to pass. The tracker runs the clock as m:ss for a race, a defence, a tail and an unseen step (down
  from the room's last word on it, which sets it afresh), shows a defended ward's health as a percentage, and is read
  aloud as a clock starts, at each half minute and in its last 10 s, and as a ward's health passes each quarter.
  Figures glide between the room's words, turning the short way round, a quarry walking back when it noticed and one
  arrived standing where it is;
  the ward's plate stays in view as a fought foe's; a lit point offers no Use. With no Art worn (and while the story is
  told, which says nothing of houses) the Character page says "Pledge to a house; its road gives its Art.", and the
  Arts' screen shows all three locked.
- **The escort rides**
  ([[Keepers Give Gifts, the House Arts Come With a Horde, Escorts Ride, and the Horse and Ship Are Taught]]): its
  figure sits on a horse in its goal's `horse` coat (Tobin a dun, Wren a black), in the player's own horse moves,
  galloping (16 frames a second) while it goes and standing (4) while it waits, is held or has arrived; its hooves are
  heard as another rider's are. A tail's quarry walks on foot. While the figure waits for the player near it to mount,
  the step says "Get on your horse" under its words, or, with no horse worn, "No horse worn: the Tack in Overlook gives
  one".
- **The varied steps**: the page draws the quest figures (`quest_figures`) as the cast's figures or the roster's, the
  ward (`quest_ward`) at its place with its health, and the puzzle's points (`quest_points`), each lit or not, with
  "Use" and its name within reach; the tracker shows the running clock (`quest_clock`); and a goal's line is said as
  it fails (`quest_fails`).
- **Locks**: the Art's screen and the ability bar show an Art, a Tenet or a Core fragment not earned locked, saying
  which road earns it; a fragment choice waiting is offered on the Art's screen, its unowned fragments to choose from.

## Limits

- **Online only.** A page playing alone (no `?room=`) keeps no character, so it walks no road, as it keeps no gear.
- **Saves by id**: a road is kept by its quest's id and its place by its task's id; a task the file no longer holds
  reads as its quest's first.
- **Steps**: a task holds one of the six varied kinds at most. An escort's figure rides at the player's gallop
  (`ride_gallop`, 12 m/s) and sets off only while its player is mounted (the room's word on them, never the page's) and
  within `near`; within it on foot, it waits in a state of its own (5 on the wire), and farther, as any figure waits.
  A tail's quarry walks at the game's walk (4.43 m/s). A figure turns to face its way at one full turn a second, so at a
  gallop it rounds a corner over some 3 m. Either goes along the
  layout's paths between its places (each path's points within 6 m join it to another), straight where none comes
  within a place's reach, on the ground's height, and is no fighter. An ambush stands 6 m round it, on a mesh baked
  there. A ward has 700 health (a player's is 100), stands where it is put and fights no one, and only its player is
  sent it. Waves stand 25 to 30 m out. A puzzle's point is moved onto the nearest ground a walk reaches from its place's
  middle, as far out as the point stands from it (6 m at least), or, where the middle is off the mesh, onto the mesh
  within 6 m ([[What a Body Meets Keeps to What Is Drawn]]). A failed defence waits 10 s, then 20, then 40 (its foes
  after the first failure in a task drop nothing, and so do those of a wave or an escort's ambush (its one wave) the
  character stood before in the task, kept with their road, so a rejoin or a return pays no wave twice:
  [[The Audit's Leftovers Are Fixed as Claude Suggested]]); a tail noticed waits 10 s and walks back, whichever is
  longer; an unseen step seen waits 10 s. A wave with no ground to stand on counts as fallen. A figure that arrived
  stays standing at its end for its player until they leave the node. A ward, a wave, an ambush or a watch stands only
  while the room's cap on foes leaves room for it, beside a public event's kept places ([[Public Events]]); wards count
  against no cap. A place's mesh is baked the first time a kill group, a defence, a puzzle or an ambush needs it (about
  140 to 270 ms that tick, natively).
- **Figures, wards and points are the player's own**: they stand where the room's last word put them (a figure glided
  there), and show only from the room the player is in, once it has spoken; other players do not see them.
- **A word that ends two tasks at once** says each task's end and the next task's start in turn.
- **The first word on the player's own character is where they stand**: it says nothing. A word that goes back is never
  news.
- **A quest's `begin` is said once for an account in a browser**, which keeps it (`noshores.roads.begun.<account>`):
  as the quest is first walked from its first task, or on the first settled word for a character on its first task
  with nothing counted (one from before the roads). A switch back to a road says nothing. What a step says while the
  story or the welcome holds the screen waits for it to pass; the begin of a quest left meanwhile (the opening, left by
  a pledge during the welcome) is never said.
- **The tracker and the waypoint show on foot and at sea**; at sea a sea fight's task takes the tracker while it runs.
  The held map rings only nodes the player has found.
- **A keeper's lines are said as the room meets the goal**, a moment after the press; speaking with a keeper no goal
  asks for is refused ("They have nothing more to say to you now").
- **"Within 150 m"** is measured from the place's middle. **Enter** and **Land** are told on joining and again when the
  kept character is given back to the room.
- **The sea**: a ship counts as struck if its captain struck before it went down, a won deck as boarded, and a boarded
  ship later scuttled as struck for everyone who fought it.
- **A road's group stands again 120 s** (the garrison's stand-again) after it fell, while its goal is unmet. Where its
  place's middle stands off the mesh (inside a building or a heap of stones), it stands round the nearest point within
  the place's reach that the mesh holds. **Land** is told only once the sea says the player's ship lies at the island,
  and an isle's kills count for its goals only after that. A fragment a road gives past those its Art has left to
  choose is its price at the counter in Aurem (7,500).
- **A character made before** that reaches its road's third task wears the road's Art from then, as every player does.
