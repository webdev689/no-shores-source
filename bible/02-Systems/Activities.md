---
type: system
status: planned
---
# Activities

The days and the weeks of play, after Destiny 1's first year: what is on today and this week, how hard it is, what
it pays once, and what opens it. The owner's decisions are [[Dailies and Weeklies Follow Destiny 1, With One Abyss
Dungeon a Week]], [[The Story Opens Places, Levels Open Tiers, and the Campaign's End Opens the Week]] and
[[The Tiers Are Normal, Elite and Abyss]]. Everything else here is Claude's call, listed at the end, and the owner can
change any of it. Nothing of it is built yet.

## What it is for

- **One rhythm for everyone.** The day and the week turn at the same moment for every player and every system.
- **A stark board.** What is on is the same for everyone and reads at a glance, with what it pays and when it turns.
- **Abyss at the top.** The hardest thing outside Breaches, once a week, with the best weekly drop.
- **Gates kept by the rooms.** No client can skip a gate or take a reward twice.

**Not now:** Breaches themselves and sea Breaches ("I dont want to build this yet"), curated missions ("Missions
come much later"), and dungeons on the sea's islands, which wait on the islands themselves.

**Must not happen:** a second clock; a reward taken twice in its period by leaving and coming back; an activity a
player cannot tell is on, or cannot tell why it is shut.

## The clock

- **A day** runs from 09:00 UTC to 09:00 UTC, and **a week** from Tuesday 09:00 UTC, as Destiny 1's resets did.
- `gear::clock` gives the day and the week from Unix minutes, which the room's host passes in. The rules keep no
  clock of their own, as `gear::shape::week_of` already takes its minutes.
- **Everything that turns reads it**: the vendors' daily wares (midnight UTC now), Shape's week (Monday now; Shape
  still comes Friday 09:00 to Sunday 21:00 inside it), the activities and the bounties.

## The tiers in code

- **Normal, Elite and Abyss** replace Calm, Rough and Storm in code and on every screen, the voyage's card included.
- Each adds 0, 2 or 3 levels over the area's band, capped at 32, and pays 1, 1.5 or 2 times, as
  `gear::world::Difficulty` does now. A room's name carries its tier, `--elite` or `--abyss`.

## What is on

| Activity | What | Tier | Opens |
|---|---|---|---|
| Dungeon of the day | One patrol dungeon on each island, drawn each day | Normal, Elite, Abyss | Normal at any level, Elite from 10, Abyss from 20 |
| Bounties | Six from the board, drawn each day | | After the prologue |
| Elite Dungeons | The 18 named dungeons, at their island's band | Normal | After the prologue |
| Elite Dungeon of the week | One of the 18, at the last island's band | Elite, one modifier | Campaign's end, level 24 |
| Abyss Dungeon of the week | Another of the 18, at the last island's band | Abyss, three modifiers | Campaign's end, level 28 |
| Breaches | Later | | Campaign's end |

- **Draws** are seeded by the day or the week, so every player and room sees the same (`gear::activities`).
- **The dungeon of the day** carries one modifier of the day in every tier. The week's two never fall on the same
  dungeon.

## The Elite Dungeons

- **Each named dungeon place** (two an island, the `kind: "dungeon"` nodes) becomes a dungeon the Forge lays, its
  seed and style fixed by its place. It is longer than a patrol's, four or five blocks.
- **Its end** holds a Boss with its own name and nameplate in place of a Reeve.
- **Its node** keeps its open-air approach and gains the entrance.
- **For four players**, matched together, as Destiny's strikes ([[Dungeons Live in Patrols, on the Sea's Islands and
  as Elite Dungeons]]).

## Runs and fireteams

- **A fireteam** is a company of up to four. Companies hold three now.
- **A run** of an Elite Dungeon, of the dungeon of the day at Elite or Abyss, or of a week's dungeon is a private room
  for its fireteam. The shared patrol rooms stay for a dungeon of the day at Normal and every other dungeon.
- **Find a fireteam** queues a player for an Elite Dungeon or the Elite Dungeon of the week, by level band. A run
  starts with four, or with fewer after a minute's wait.
- **The Abyss Dungeon of the week is never matched**, as Destiny 1's Nightfall was not: a fireteam forms it.

## Abyss's rules

- **Revives:** the fireteam shares five a run. A fallen player stands again at the run's start while one is left;
  when none are, the fallen stay down.
- **A wipe ends the run:** when every player is down at once, all are sent to the entrance, and the dungeon starts
  over.
- **Modifiers** are drawn from a set, each one hook in the rules: Burn (one Art's spells deal and take twice),
  Brawler (melee deals more), Marksman (ranged deals more), Lightswitch (foes' melee deals far more), Ironclad (more
  foes carry shields), Trickle (Arts recharge slower), Juggler (no ammunition drops) and Exposure (health returns
  slower).

## What it pays, once

- **Each character keeps its day and its week** with the account (`Character.activity`): which tiers of each
  island's dungeon of the day it cleared, its bounties, and which of the week's dungeons it cleared. Each turns over
  with the clock.
- **The dungeon of the day**, the first clear of each tier: its cache, raised by the tier, and a Vestige at the tier's
  rarity (Rare, Legendary, Legendary).
- **The Elite Dungeon of the week**, once: a Legendary Vestige and Legendary materials.
- **The Abyss Dungeon of the week**, once: a Legendary Vestige at the highest Prestige its character can wear, a
  chance of Atheric, Legendary materials, and the Abyss boon: a quarter more XP and reputation until the week turns.
- **A clear again** in the same period pays its kills and its cache as any run, no more.

## The bounty board

- **A board in Overlook's plaza** opens after the prologue, built on the counters' pattern of the plaza's keepers.
- **Six bounties a day**, the same for everyone: on land (foes of a faction or rank on an island, materials
  gathered), at sea (ships sunk in a water) and in dungeons (a dungeon of the day or an Elite Dungeon cleared).
- **A character takes any of them**, the room counts each as it happens (kills, clears, sinkings, gathering), and
  the account keeps the count. Turned in at the board, each pays XP and Aurem once. All end at the daily reset.

## What opens when

- **The prologue's end is kept with the account** (`Character.story`), not only in the browser. The room records it
  when the prologue's last beat is reached.
- **After the prologue:** the board, the patrols, the dungeon of the day and the Elite Dungeons. Until more of the
  campaign exists, the prologue stands in for its end, so the week's dungeons open too, each by its level.
- **The rooms refuse a join a gate shuts**, and say why. The screen shows what is shut and what opens it.

## The screen

- **This Week**, in the character's window: the day's and the week's activities, their tiers and modifiers, what
  each pays and whether it is taken, and the time to each reset.
- **Set Challenge** at a dungeon's entrance offers its open tiers with their levels and modifiers, as Destiny 1's
  mission picker did, and Find a Fireteam where it matches.

## How it is built

One shared core in the rules, chosen over each system keeping its own resets (two clocks already disagree, Shape's
Monday and the vendors' midnight) and over a server-only activity service (it would break
[[Clients Predict With the Shared Rules]]). The clock, the draws, the records and the gates live in `gear`, which the
server and the browser both run; each system reads them.

1. **The core:** the clock, the tiers in code, the records, the story kept with the account, the gates.
2. **The dungeons:** the dungeon of the day, the Elite Dungeons, the week's two, the modifiers, Abyss's rules and the
   rewards.
3. **The screen.**
4. **Fireteams of four**, private runs and Find a Fireteam.
5. **The bounty board.**

**Who builds what:** this session builds 1 to 4 and the board's rules. The plaza's session (#92) places the board
and its keeper, and moves Shape and the vendors onto the clock. The sea's session (#75) takes the tiers at sea and
the bounties' sea counts. The prologue's session records the prologue's end with the account.

**Left to the builder:** the modifiers' and the rewards' exact numbers, how a modifier is shown, how a private run's
room is named and closed, and each Elite Dungeon's Boss.

## Claude's calls

Each is Claude's, open to the owner's change: the resets at 09:00 UTC and Tuesday; a dungeon of the day on each
island rather than one; its tiers opening at levels 10 and 20; the week's two at the last island's band, opening at
24 and 28; Elite Dungeons at their own band the rest of the week; private runs; a run starting short after a minute;
five shared revives; the modifier set; the rewards above and the quarter-more boon; six bounties a day paying XP and
Aurem; and the screen's two names, This Week and Set Challenge.
