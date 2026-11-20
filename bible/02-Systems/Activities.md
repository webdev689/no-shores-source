---
type: system
status: planned
code:
  - crates/gear/src/clock.rs#day_of
  - crates/gear/src/activity.rs#Activity
  - crates/gear/src/story.rs#Story
  - crates/gear/src/gate.rs#shut
  - crates/gear/src/activities.rs#week_dungeons
  - crates/gear/src/clears.rs#clear_of_the_day
  - crates/room/src/run.rs#modded_blow
  - crates/room/src/run_room.rs#dungeon_run
  - crates/room/src/abyss.rs#start_over
  - crates/room-wasm/src/run_door.rs#open_run
  - client/src/game/activities.ts#eliteRun
  - client/src/game/dungeonTrips.ts#dungeonTrips
  - client/src/game/activityWords.ts#thisWeekOf
  - client/src/game/activityWords.ts#entranceCardOf
---
# Activities

The days and the weeks of play, after Destiny 1's first year: what is on today and this week, how hard it is, what
it pays once, and what opens it. The owner's decisions are [[Dailies and Weeklies Follow Destiny 1, With One Abyss
Dungeon a Week]], [[The Story Opens Places, Levels Open Tiers, and the Campaign's End Opens the Week]],
[[The Story Is Nine Missions, With Side Quests Between Them]], [[Where You Go and the Seas You Choose Set the
Difficulty]] and [[The Tiers Are Normal, Elite and Abyss]]. Everything else here is Claude's call, listed at the end,
and the owner can change any of it. The owner approved it to be built in full, the story's missions apart
([[The Activities Are Built in Full, Before the Story's Missions]]). Its core, its dungeons and its screens are built
(steps 1 to 3); companies of four, Find a Company and the quests are not.

## What it is for

- **One rhythm for everyone.** The day and the week turn at the same moment for every player and every system.
- **A stark board.** What is on is the same for everyone and reads at a glance, with what it pays and when it turns.
- **Abyss at the top.** The hardest thing outside Breaches, once a week, with the best weekly drop.
- **Gates kept by the rooms.** No client can skip a gate or take a reward twice.

**Not now:** Breaches themselves and sea Breaches ("I dont want to build this yet"), the story's missions and side
quests past the prologue (the quest engine below is built for them), and dungeons on the sea's islands, which wait on
the islands themselves.

**Must not happen:** a second clock; a reward taken twice in its period by leaving and coming back; an activity a
player cannot tell is on, or cannot tell why it is shut; Destiny's own words on screen ([[A Group of Players Is a
Company]]).

## The clock

- **A day** runs from 09:00 UTC to 09:00 UTC, and **a week** from Tuesday 09:00 UTC, as Destiny 1's resets did.
- `gear::clock` gives the day and the week from Unix minutes, which the room's host passes in, and the minutes to
  the next of each. The rules keep no clock of their own.
- **Everything that turns reads it**: the vendors' daily wares, Shape's week (Monday now; Shape
  still comes Friday 09:00 to Sunday 21:00 inside it), the activities, the bounties and the quests.

## The tiers

- **Normal, Elite and Abyss** are the tiers in code, in the rooms' names (`--elite`, `--abyss`) and on every screen,
  the voyage's card included. The Roster says "Elite difficulty", so a voyage's tier is not read as a foe's rank.
- **The seas chosen set the tier**, as the owner decided: a voyage set out at Abyss makes the patrols it reaches, and
  the dungeons in them, Abyss. Each tier adds 0, 2 or 3 levels over the area's band, never past 32, and pays 1, 1.5
  or 2 times, as `gear::world::Difficulty` does now.
- **The week's two dungeons have their own tier and level** (below), whatever the seas.

## What is on

| Activity | What | Tier and level | Opens |
|---|---|---|---|
| Dungeon of the day | One patrol dungeon on each island, drawn each day | The seas', at its island's band | Normal at any level; Elite seas from 10, Abyss seas from 20 |
| Bounties | Six from the board, drawn each day | | After the prologue |
| Elite Dungeons | The 18 named dungeons | Normal, at their island's band | After the prologue |
| Elite Dungeon of the week | One of the 18, with one modifier | Elite, foes at 26 | Campaign's end, level 24 |
| Abyss Dungeon of the week | Another of the 18, with three modifiers | Abyss, foes at 30 | Campaign's end, level 28 |
| Breaches | Later | | Campaign's end |

- **Draws** are `gear::activities`, seeded by the clock's day or week number alone, so every room and page sees the
  same. Each island's dungeon of the day is one of its patrols' nine, evenly; the day's modifier is one of the eight,
  and Burn's Art one of the three. The week's two are two of the 18 Elite Dungeons, never the same one; the Elite's
  has one modifier, the Abyss's three of different kinds.
- **The dungeon of the day** carries one modifier of the day at Elite and Abyss.
- **Elite names three things**, as the owner kept it: the tier, the Elite Dungeons and a foe's rank. Each screen says
  which it means, as "Elite seas", "Elite Dungeon" or an Elite foe's nameplate.
- **The week's levels** stand two over the level that opens each, as Destiny 1's weekly strikes stood at fixed
  levels, so a player who may enter can harm every foe (`gear::power::gap`).

## The Elite Dungeons

- **Each named dungeon place** (two an island, the `kind: "dungeon"` nodes) becomes a dungeon the Forge lays, its
  seed and style fixed by its place (`room::elite_laid`). It is longer than a patrol's, four or five blocks. Its room
  is a run's (`Room::dungeon_run`): at Normal at its island's band, paying its kills and cache; at Elite or Abyss
  only while it is that tier's dungeon of the week, every foe at 26 or 30 with the week's modifiers ([[Dungeons]],
  "In the rooms").
- **Its end** holds a Boss with its own name and nameplate in place of a Reeve: one of the roster's types 19 to 36
  (`ISLAND_PLACES` names each dungeon's), a land Captain of its garrison's faction fighting in Corvane's three phases
  ([[Enemies]]).
- **Its node** keeps its open-air approach and gains the entrance.
- **For four players**, matched together ([[Dungeons Live in Patrols, on the Sea's Islands and as Elite Dungeons]]).

## Runs and companies

- **A company** holds up to four, and a run holds four too: a fifth is sent away saying "This run is full.".
- **A run** is a private room for the company that enters: every dungeon at Elite or Abyss, every Elite Dungeon and
  both of the week's. A dungeon at Normal in a patrol stays in the patrol's shared room, as does a sea island's.
- **A run's room** is named by an instance after its dungeon's name (`--run-` and eight lowercase letters or digits,
  [[Server]]). Once its first player is in, only those it let in and their companies join, for as long as it lives
  (`Keeper.forCompany`); a player from another is sent back saying "This run is another company's.", and one it cannot keep (no session, or no token in time)
  saying "Sign in to enter this run.". No one plays in a run unkept. It is forgotten a minute after its last player
  leaves.
- **Find a Company** queues a player for an Elite Dungeon or the Elite Dungeon of the week, by level band. A run
  starts with four, or with fewer after a minute's wait.
- **The Abyss Dungeon of the week is never matched**, as Destiny 1's hardest weekly strike was not: a company forms
  it.

## Abyss's rules

They hold in every Abyss run, which the owner gave "Nightfall's rules: limited revives, and a wipe ends the run".

- **Revives:** the company shares five a run (`Room::revives`). Each stand of a fallen player takes one, the
  lowest player number first when two fall together; when none are left, the fallen stay down. Leaving stands no one
  up: the run keeps each kept player's body as they leave (`keep_body`), so one who left down comes back down and
  one who left wounded comes back at the share of health they left with, until the run starts over.
- **A wipe ends the run:** when every player in it is down at once, each is told (`Wiped`), the dungeon starts over and
  its five revives with it (`start_over`): its foes stand again at their posts, its shots, spells and drops are gone,
  its cache shuts, and its players stand whole at the way in. The page takes them out by the way they came in, the veil
  saying "Your company fell. Leaving" the dungeon, and the place line shows the revives left ("3 revives left", "No
  revives left"). A run once won is never wiped, though its end post stands again later and shuts its cache, so a
  cleared run keeps what it paid; and a room no one is in is never wiped.
- **Modifiers** are drawn from a set, each one hook in the rules (`room::run`), read only in a room whose run
  carries it. Each says what it does in a line of its own (`Modifier::words`), which the screens show:
  - Burn: one Art's spells deal twice, and a player wearing it takes twice from foes. "Shadow spells deal double
    damage. Wearing Shadow, you take double."
  - Brawler: a player's swing deals 1.5 times ("Melee deals 50% more damage."); Marksman: a player's shot deals 1.5
    times ("Ranged deals 50% more damage.").
  - Lightswitch: a foe's swing or telegraphed blow deals a player twice ("Foes' melee deals double damage.").
  - Ironclad: half of all foes stand with a shield, against one in five; every foe shielded without it keeps its
    shield and element, since the same roll is read at a higher bar ("Half of all foes carry shields.").
  - Trickle: an Art's recharge takes 1.5 times as long ("Arts take 50% longer to recharge.").
  - Juggler: no Ammo box and no crate drop ("No ammunition drops.").
  - Exposure: a heal on a player gives half; foes heal as before ("Heals restore half as much.").

## What it pays, once

- **Each character keeps its day and its week** with the account (`Character.activity`): `today` holds the tiers of
  the dungeon of the day it has cleared and its bounties, each by its board place with its count; `this_week` holds
  whether it cleared each of the week's two dungeons and whether it holds the Abyss boon. Each begins anew at its
  first touch in a later day or week, and never turns back, so a room whose clock is behind cannot pay twice.
- **What a first clear pays** is `gear::clears`. Each writes the record, and none pays for a day or a week behind the
  one the record holds, so a room a few seconds behind 09:00 cannot write yesterday's clear into today.
- **The dungeon of the day**, the first clear at each tier each day, on any island's: its cache, raised by the tier,
  that is a Captain's kill at the run's level (XP 2,000 and Aurem 120 at level 5, times (5 + level) ÷ 10, times the
  tier's 1, 1.5 or 2), and a sure Vestige in a boss's colours at the run's level. Three a day at most, under the rules
  every Vestige keeps now (no Legendary from foes under level 18).
- **The Elite Dungeon of the week**, once: a Legendary Vestige (its item at level 20) and 3 Essence of each stock.
- **The Abyss Dungeon of the week**, once: a Legendary Vestige, Atheric one time in five, 5 Essence of each stock,
  and the Abyss boon: a quarter more of each kill's XP, rounded down, and reputation once factions are in, until the
  week turns.
- **Where it is paid.** The room pays as the cache opens, each player then in it whose character it keeps, and lays
  the Vestige 1.4 m before the cache (`pay_clear`). A player playing unkept finds the cache's own Vestige alone. A
  run's first clear pays only in the day or the week it was opened for, as its modifiers are fixed then. The day's
  pays in a run opened while its dungeon was its island's dungeon of the day, with that day's modifier at Elite and
  Abyss, and cleared that day; and at Normal in a patrol's shared room while it is its island's dungeon of the day by
  the room's clock then. The week's pays only in the week its run was opened for. So a run opened before a reset and
  cleared after it pays as a clear again. An Elite Dungeon at Normal and a sea island's pay their kills and cache
  alone.
- **A clear again** in the same period pays its kills and its cache as any run, no more.

## Quests and bounties

One engine counts both, since the owner's side quests and the board's bounties ask the same things.

- **An objective** is a count of something the room sees happen: foes of a faction or rank felled on an island,
  materials gathered, ships sunk in a water, a dungeon cleared. The room counts it as it happens; the account keeps
  the count.
- **The bounty board** stands in Overlook's plaza and opens after the prologue, on the counters' pattern of the
  plaza's keepers. It offers six bounties a day, the same for everyone, on land, at sea and in dungeons. A character
  takes any of them; each pays XP and Aurem once when turned in, and all end at the daily reset.
- **Side quests** use the same objectives, kept until done, and are written with the story's missions.

## What opens when

- **The story's progress is kept with the account** (`Character.story`), not only in the browser: the prologue's
  end first, and each mission and side quest as they come. The room records each. A new character starts short of
  the prologue. The gear message says whether it is done. On foot the story is behind the page, so it asks each room
  on land whose word says not done to mark it (`Ask::FinishPrologue`): no one is kept out by a prologue that did not
  run.
- **After the prologue:** the board, the patrols, the dungeon of the day and the Elite Dungeons.
- **The campaign** is the nine missions that follow the prologue, which is not one of them; finishing the ninth is its
  end. Which island each mission reaches is written with the missions. Until they exist, the prologue stands in for
  the campaign's end, so the week's dungeons open too, each by its level.
- **Characters saved before the story was kept** count as past the prologue: a save with no `story` reads as past
  it.
- **The rooms refuse a join a gate shuts**, and say why: no kept character passes a gate it has not opened. A player
  the accounts do not hand over plays unkept, as a new character, and keeps nothing. The gate is `gear::gate::shut`,
  which reads a character's level and prologue into `shut_at`: a social space never shuts; a patrol, its dungeons
  and an Elite Dungeon (its node, its approach and its run at Normal) need the prologue; the week's two need it and
  then their own level, 24 or 28, whatever the seas; then Elite seas need level 10 and Abyss seas level 20, anywhere
  else. A room asks it before it gives a player their kept character, with the story they already hold in the room
  carried forward (`Story::merged`, which never goes back), and a new one is judged as it starts. The reasons read
  "This place opens after the prologue.", "This dungeon opens at level 24." (or 28), "Elite seas open at level 10."
  and "Abyss seas open at level 20.". A sea island's dungeon is gated by its seas alone. The screens show what is
  shut and why: This Week, an entrance's card and the voyage's card. The page reads every gate's reason for a level
  from the rules (`room_gates`), so it never judges a gate itself.

## The screen

- **This Week** is the menu's Journal ([[Interface]], "The menu"): the dungeon of the day and its pay, the day's
  modifier with what it does, each tier's seas taken or not today, each island's dungeon of the day with its levels,
  then the week's two with their levels, rules, modifiers and pay, taken or not, and the Abyss boon while held, each
  under the time to its reset. A shut line says why in its gate's words. "Taken" is the character's record as their
  gear last carried it, judged against the page's own day and week, so yesterday's clear reads as not taken today.
  Bounties and Quests stand under it marked Later.
- **At a dungeon's entrance**, E opens a card ([[Interface]], "At a dungeon's entrance"): the run's tier and level,
  its rules and modifiers, what it pays or that it is taken, and why it is shut if it is, with Enter. A patrol's
  dungeon carries the day's modifier at Elite and Abyss seas while it is its island's dungeon of the day. An Elite
  Dungeon's card is its week's run where `eliteRun` picks it, else its run at Normal.

## How it is built

One shared core in the rules, chosen over each system keeping its own resets (two clocks already disagree, Shape's
Monday and the vendors' midnight) and over a server-only activity service (it would break
[[Clients Predict With the Shared Rules]]). The clock, the draws, the records and the gates live in `gear`, which the
server and the browser both run; each system reads them.

1. **The core:** the clock, the tiers in code, the records, the story kept with the account, the gates.
2. **The dungeons:** the dungeon of the day, the Elite Dungeons, the week's two, the modifiers, Abyss's rules and the
   rewards.
3. **The screen.**
4. **Companies of four**, private runs and Find a Company.
5. **Quests and bounties**: the engine and the board.

It builds on the dungeons (#72, #88) and the owner's plan (#82); the board's place and the boon's reputation wait on
the factions (#92).

**Who builds what:** this session builds 1 to 5's rules and screens. The plaza's session (#92) places the board and
its keeper, and moves Shape and the vendors onto the clock. The sea's session (#75) takes the tiers at sea and the
sea's counts. The prologue's session records the prologue's end with the account.

**Left to the builder:** the modifiers' and the rewards' exact numbers, how a modifier is shown, how a private run's
room is named and closed, and each Elite Dungeon's Boss.

## Claude's calls

Each is Claude's, open to the owner's change: the resets at 09:00 UTC and Tuesday; a dungeon of the day on each
island rather than one, with three rewards a day across them; Elite and Abyss seas opening at levels 10 and 20; the
week's two with foes at 26 and 30, opening at 24 and 28; private runs at Elite and Abyss; a run starting short after a
minute; five shared revives, restored by a wipe; the modifier set; the rewards above and the quarter-more boon; six
bounties a day paying XP and Aurem; one engine for quests and bounties; and the screen's names, This Week and Find a
Company.
