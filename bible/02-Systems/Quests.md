---
type: system
status: live
code:
  - content/quests/quests.json
  - content/story/houses.json
  - crates/gear/src/quests.rs#QuestsDef
  - crates/gear/src/quests.rs#QuestLog
  - crates/gear/src/quests.rs#Event
  - crates/gear/src/arts.rs#WornArts
  - crates/room/src/quests.rs#QuestGround
  - crates/room/src/quests.rs#set_places
  - crates/room/src/quests.rs#ground_of
  - crates/room/src/quests.rs#held_near
  - crates/gear/src/quest_defs.rs#GoalDef
  - crates/gear/src/quest_defs.rs#speaker_place
  - crates/room/src/steps.rs#Step
  - crates/room/src/steps.rs#way_between
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
  - client/src/game/tasks.ts#toldChange
  - client/src/game/characterPage.ts#NO_ART_WORDS
  - crates/protocol/src/quest_wire.rs#quests_of
  - crates/bake/src/lib.rs#places_of
  - client/src/game/quests/questBook.ts#trackedOf
  - client/src/game/quests/questBook.ts#linesBetween
  - client/src/game/quests/questWatch.ts#QuestWatch
  - client/src/game/quests/quests.ts#Quests
  - client/src/player/factionNames.ts#earnedOn
  - client/src/combat/casting.ts#CastKeys
---
# Quests

The houses' roads and the opening that leads to them ([[Each House Has Its Own Road to Its Art]],
[[The Houses' Roads as Claude Shapes Them]]). The rules are the authority: a player's place in every road is kept in
their character, every goal is judged by the room the player stands in, and every reward is given there. The page only
shows what the rules say: the tracker, the lines, the marks, and the Art's locks.

## The file

`content/quests/quests.json` holds the quests in order. The rules build it in and the page imports it, so both read one
file. A quest has an `id`, a `name`, a `faction` (0 for the opening, else the house's number in
`content/gear/factions.json`), the scene played as it begins (`begin`) and its `tasks`. A task has the words the tracker
shows (`task`), its scenes (`start`, played as it begins; `end`, played as it is done), its `goals`, all met before the
next task begins, and its `reward`, given as it is done. Any goal may name a `scene`, said as the room meets it. A quest may name the quests it comes `after` (by id); a house may have several. The quest walked is the first in the file of the pledged house's (the opening's, unpledged) not done whose `after` are all done. A task may list the ids it had (`was`); a save at one reads as that task, its counts at nothing. A goal has its tracker words (`text`), a `count` (1 when left
out) and its kind:

| Kind | Met by | Its fields |
|---|---|---|
| `talk` | Speaking with a keeper within reach of their counter; its `scene` is said then | `to`: a counter's key: a house's (`stormcallers`, `lamplighters`, `veiled`), or `mage`, `vault`, `armorsmith`, `weaponsmith`, `tailor`, `tack`, `harbourmaster` |
| `pledge` | A pledge at any house's chapel | |
| `reach` | Standing within a place's reach in a node | `node`, `place`: a name its layout gives an area or a run |
| `kill` | Foes falling that the player struck, as a kill's reward is shared | `node`, `place` (within its reach and 40 m past it), `types` (the roster's names), `rank` (this or higher), `island` (`cove` or `isle`), `spawn` (below) |
| `gather` | A resource node gathered, anywhere | |
| `cast` | A spell cast | `spell`: its name in `content/arts/arts.json` |
| `sea` | A hostile ship beaten at sea: sunk, struck or its deck taken | `side` (`tithe` or `pirates`), `how` (`sink`, `strike` or `board`) |
| `land` | Landing on a sea island | `island` (`cove` or `isle`) |
| `scavenge` | A wreck searched on a sea island | |
| `enter` | Arriving in a node | `node` |
| `escort` | A figure met at a place walking to another while the player keeps up; it waits while they lag and while an ambush stands | `node`, `from`, `to` (places), `who` (a speaker of the cast), `near` (metres), `ambush` (`[type, rank]`s stood halfway), `shout` (its bark as they come), `greet` (said as its figure first walks) |
| `tail` | Following a figure from place to place at a distance: never nearer than `far`, never past `near`; nearer, it notices and walks back to start again | `node`, `from`, `to`, `who` or `foe` (a roster type's look), `far`, `near`, `noticed` (its line), `greet` (said as its figure first walks) |
| `defend` | A ward standing at a place through its waves of foes, one after another; if it falls, the waves leave and it is tried again after a wait | `node`, `place`, `ward` (its name) or `who`, `waves` (lists of `[type, rank]`), `lost` (its line) |
| `puzzle` | Points round a place used in the right order, or in any order when it gives none (a point lit already does nothing); a wrong one puts them all out and stops uses for 2 s, then 4, then 8 (ask 66 answers 103 meanwhile) | `node`, `place`, `points` (each a `name`, a `bearing` in degrees from north and `at` metres out), `order` (any order when left out), `wrong` (its line) |
| `unseen` | Standing within `within` m of a place's middle with no foe turned alert on the player; seen, it waits until no foe has been on them for 10 s. Its watch stands idle on a ring `within` m round the middle as the step begins, each facing outward; only a foe within 60 m of the middle counts as seeing | `node`, `place`, `seen` (its line), `spawn` (`[type, rank]`s), `within` (metres, 8 when left out, at most 35) |
| `race` | Passing checkpoints in order before the clock runs out; the clock starts as the player leaves the first's reach; late, it starts again from the first. A race is run over the ground, not along the paths | `node`, `checkpoints` (places, two or more), `seconds`, `late` (its line) |

A `kill` goal with a `spawn` stands its foes at its place: a list of `[type, rank]`, each the roster's name and a rank
it comes in. A player on that goal coming within 150 m of the place stands the group there, at the node's island levels
raised by its seas, as a garrison's group that never stands again once it falls; while the goal is unmet and none of
the group stands, the next to come near stands it again. Anyone may fight it, and each kill counts for every player
who struck it. The room bakes a navmesh square round each such place as it opens ([[Navmesh]]), so the group holds its
place, fights there and walks back to its post as a garrison's group does.

A reward gives the Art (`art`, its Anima with it, worn at once), a Tenet (`tenet`: 1 or 2, in the Art's order), or
fragments to choose (`fragments`: how many choices). Which Art is the quest's house's.

## In the rules

- **Kept in the character** (`gear`, `quests.rs`), **by id**: for each quest by its `id`, the task reached by its task's `id` (so a quest or task added anywhere in the file keeps every save's place), each of that
  task's goals' counts, and whether it is done; and for each Art, the fragment choices waiting. A character kept before
  quests reads every quest unbegun.
- **Read leniently**: a quest log of a shape this room cannot read reads as unbegun and is written back as it was. A
  fragment choice waiting for an Art none of whose fragments is left to own is paid at its price as soon as the room
  answers any ask.
- **The quest walked**: with no pledge, the opening, until it is done; pledged, the pledged house's road, until it is
  done; else none. A switch walks the new house's road from where it was left; every road keeps its place.
- **Goals are judged by events** the rooms tell the character's quest log: a counter spoken at, a pledge, a place
  reached, a foe's kill, a resource gathered, a spell cast, a ship beaten, an island landed on, a wreck searched, a
  node entered. Only the quest walked takes them, and only its task now. A goal stops counting at its count. When
  every goal of the task is met its reward is given and the next task begins at once, its counts at nothing.
- **The Arts earned** (`gear`, `arts.rs`): for each Art, whether the Art, its first Tenet and its second are earned,
  one bit each. A character made before keeps all three of every Art. A new character has none, and wears none: the
  room casts nothing it has not earned, and refuses to wear an Art not earned. The Test Ground's player earns every one.
- **Fragment choices**: an ask names an Art and one of its fragments not owned; with a choice waiting for that Art, it
  becomes owned and the choice is spent. It is answered anywhere.

## On the wire

- **Asks**: 66 uses a puzzle's point (`column`: its place among the goal's points), answered within 3 m of it. 64 speaks with a keeper (`column`: a house's number, or 10 the Mage, 11 the vault, 12 the Armorsmith, 13
  the Weaponsmith, 14 the Tailor, 15 the Tack, 16 the Harbourmaster), answered only within reach of that counter;
  65 chooses a fragment (`column`: the Art's number, `node`: the fragment's place in its Art's list).
- **Whose word**: the gear message says whether its character is the player's own as their account keeps it
  (`claimed`). A player who sends an input before any token keeps no character, so the one the room holds is theirs
  from then on (`none_kept`), on land as at sea.
- **The gear message** carries, at the end of its table: the quest walked (`quest`, its place in the file counted
  from 1, 0 for none), its task (`quest_task`), that task's goals' counts (`quest_counts`), each quest done
  (`quests_done`, 1 or 0 by place), each Art's earned bits (`arts_earned`: 1 the Art, 2 its first Tenet, 4 its
  second), each Art's fragment choices waiting (`fragment_choices`), and where the task's first unmet goal with a
  place stands in the player's room (`quest_at`: x, y and reach, empty when none is here).

## In the browser

- **The tracker** shows the quest walked on foot, once the story and Maren's welcome are past: its name, its task and
  each goal's words with its count.
- **The lines** are the speech system's ([[Speech]]): a quest's `begin` as it is first walked, a task's `end` as it is
  done and the next task's `start` as it begins, a `talk` goal's `scene` as the keeper is spoken with. A page that loads
  mid-road says nothing it has said before.
- **Speaking with a keeper**: within reach of a counter that a `talk` goal of the task names, the offer reads "Speak
  with" and the keeper's name; pressed, it asks 64 and the lines are said. Otherwise the counter opens as before.
- **Marks**: `quest_at` stands a mark at its place, and the held map marks the nodes the task's goals name.
- **What is shown and said**: the page shows, says and marks nothing from a word not on the player's own character
  (`claimed`). A goal's `scene` is said as the room meets it, a talk goal's included (the press only asks); an
  escort's or tail's `greet` as its figure first walks, once a task; a goal's failure line and an escort's shout as they
  happen, once while one waits or is said, and not at all while the story or the welcome holds the screen. Everything
  else waits for the welcome to pass. The tracker runs the clock as m:ss for a race, a defence, a tail and an unseen
  step, shows a defended ward's health as a percentage, and is read aloud as a clock starts, at each half minute and in
  its last 10 s, and as a ward's health passes each quarter. The HUD's mark is named for the task's first unmet goal in
  the player's node. Figures glide between the room's words, a quarry walking back when it noticed and one arrived
  standing where it is; the ward's plate stays in view as a fought foe's; a lit point offers no Use. With no Art worn
  the Character page says "Pledge to a house; its road gives its Art.", and the Arts' screen shows all three locked.
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
- **Steps**: a task holds one of the six varied kinds at most. A figure walks at the game's walk (4.43 m/s) along the
  layout's paths between its places (each path's points within 6 m join it to another), straight where none comes
  within a place's reach, on the ground's height, and is no fighter. An ambush stands 6 m round it, on a mesh baked
  there. A ward has 700 health (a player's is 100), stands where it is put and fights no one, and only its player is
  sent it. Waves stand 25 to 30 m out. A puzzle's point is moved onto ground within about 7 m of where it is meant to stand. A failed defence waits 10 s, then 20, then 40 (its foes after the first failure in a task drop nothing); a tail noticed waits 10 s and walks back, whichever is longer; an unseen step seen waits 10 s. A wave with no ground to stand on counts as fallen. A figure that arrived stays standing at its end for its player until they leave the node. A ward, a wave, an ambush or a watch stands only while the room's cap on foes leaves room for it; wards count against no cap. A place's mesh is baked the first
  time a kill group, a defence, a puzzle or an ambush needs it (about 140 to 270 ms that tick, natively).
- **Figures, wards and points are the player's own**: they stand where the room's last word put them, unglided, and
  show only from the room the player is in, once it has spoken; other players do not see them.
- **A word that ends two tasks at once** says each task's end and the next task's start in turn.
- **The first word on the player's own character is where they stand**: it says nothing. A word that goes back is never
  news.
- **A quest's `begin` is said once for an account in a browser**, which keeps it (`overlook.roads.begun.<account>`):
  as the quest is first walked from its first task, or on the first settled word for a character on its first task
  with nothing counted (one from before the roads). A switch back to a road says nothing. What a step says while the
  story or the welcome holds the screen waits for it to pass; the begin of a quest left meanwhile (the opening, left by
  a pledge during the welcome) is never said.
- **The tracker and the marks show on foot**; at sea the tracker keeps a sea fight's task. The held map rings only
  nodes the player has found.
- **A keeper's lines are said as the room meets the goal**, a moment after the press; speaking with a keeper no goal asks
  for is refused ("They have nothing more to say to you now").
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
