---
type: system
status: building
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
next task begins, and its `reward`, given as it is done. A goal has its tracker words (`text`), a `count` (1 when left
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

A `kill` goal with a `spawn` stands its foes at its place: a list of `[type, rank]`, each the roster's name and a rank
it comes in. A player on that goal coming within 150 m of the place stands the group there, at the node's island levels
raised by its seas, as a garrison's group that never stands again once it falls; while the goal is unmet and none of
the group stands, the next to come near stands it again. Anyone may fight it, and each kill counts for every player
who struck it.

A reward gives the Art (`art`, its Anima with it, worn at once), a Tenet (`tenet`: 1 or 2, in the Art's order), or
fragments to choose (`fragments`: how many choices). Which Art is the quest's house's.

## In the rules

- **Kept in the character** (`gear`, `quests.rs`): for each quest in the file's order, the task reached, each of that
  task's goals' counts, and whether it is done; and for each Art, the fragment choices waiting. A character kept before
  quests reads every quest unbegun.
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

- **Asks**: 55 speaks with a keeper (`column`: a house's number, or 10 the Mage, 11 the vault, 12 the Armorsmith, 13
  the Weaponsmith, 14 the Tailor, 15 the Tack, 16 the Harbourmaster), answered only within reach of that counter;
  56 chooses a fragment (`column`: the Art's number, `node`: the fragment's place in its Art's list).
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
  with" and the keeper's name; pressed, it asks 55 and the lines are said. Otherwise the counter opens as before.
- **Marks**: `quest_at` stands a mark at its place, and the held map marks the nodes the task's goals name.
- **Locks**: the Art's screen and the ability bar show an Art, a Tenet or a Core fragment not earned locked, saying
  which road earns it; a fragment choice waiting is offered on the Art's screen, its unowned fragments to choose from.
