---
type: system
status: live
code:
  - crates/gear/src/clock.rs#day_of
  - crates/gear/src/activity.rs#Activity
  - crates/gear/src/story.rs#Story
  - crates/gear/src/gate.rs#shut
  - crates/gear/src/activities.rs#week_dungeons
  - crates/gear/src/clears.rs#clear_of_the_day
  - crates/gear/src/objectives.rs#saw
  - crates/room/src/sea_ports.rs#count_down
  - crates/gear/src/bounties.rs#board
  - client/src/game/journalPage.ts#Journal
  - crates/room/src/run.rs#modded_blow
  - crates/room/src/run_room.rs#dungeon_run
  - crates/room/src/abyss.rs#start_over
  - crates/room/src/encounters.rs#encounters_start_over
  - crates/room-wasm/src/run_door.rs#open_run
  - client/src/game/activities.ts#eliteRun
  - client/src/game/dungeonTrips.ts#dungeonTrips
  - client/src/game/activityWords.ts#thisWeekOf
  - client/src/game/activityWords.ts#entranceCardOf
  - server/accounts/finding.ts#Queue
  - client/src/game/companyFinder.ts#findCompany
  - crates/gear/src/playlist.rs#Playlist
  - crates/gear/src/band.rs#patrol
  - crates/room/src/playlist_run.rs#playlist_run
  - server/accounts/playlists.ts#playlistRun
  - client/src/game/playlistWords.ts#playlistScreenOf
  - client/src/game/playlistScreens.ts#startPlaylists
---
# Activities

The days and the weeks of play, after Destiny 1's first year: what is on today and this week, how hard it is, what
it pays once, and what opens it. The owner's decisions are
[[Dailies and Weeklies Follow Destiny 1, With One Abyss Dungeon a Week]], [[The Story Opens Places, Levels Open Tiers, and the Campaign's End Opens the Week]],
[[The Story Is Nine Missions, With Side Quests Between Them]],
[[Where You Go and the Seas You Choose Set the Difficulty]] and [[The Tiers Are Normal, Elite and Abyss]]. Everything else here is Claude's call, listed at the end,
and the owner can change any of it. The owner approved it to be built in full, the story's missions apart
([[The Activities Are Built in Full, Before the Story's Missions]]). All five steps are built: the core, the
dungeons, the screens, companies of four with Find a Company, and the bounties, ships sunk at sea among them.

## What it is for

- **One rhythm for everyone.** The day and the week turn at the same moment for every player and every system.
- **A stark board.** What is on is the same for everyone and reads at a glance, with what it pays and when it turns.
- **Abyss at the top.** The hardest thing outside Breaches, once a week, with the best weekly drop.
- **Gates kept by the rooms.** No client can skip a level gate or take a reward twice. The prologue's end is the page's
  word, since the story plays in the page alone and may be passed over ([[Prologue]]).

**Not now:** Breaches themselves and sea Breaches ("I dont want to build this yet"), and the story's missions and side
quests past the prologue. The houses' roads are the quests there are ([[Quests]]); the Journal shows them.

**Must not happen:** a second clock; a reward taken twice in its period by leaving and coming back; an activity a
player cannot tell is on, or cannot tell why it is shut; Destiny's own words on screen
([[A Group of Players Is a Company]]).

## The clock

- **A day** runs from 09:00 UTC to 09:00 UTC, and **a week** from Tuesday 09:00 UTC, as Destiny 1's resets did.
- `gear::clock` gives the day and the week from Unix minutes, which the room's host passes in, and the minutes to
  the next of each. The rules keep no clock of their own.
- **Everything that turns reads it**: the smiths' wares, the Tailor's emblems and dyes, the Tack's pieces, the
  Shipwright's modules and the officers at each muster ([[Ship Power]], [[Crew]]), each a day's; Shape's week, his place and his wares (he comes Friday 09:00 and goes Sunday 21:00 inside it); the
  keepers' countdowns to the next stock and to Shape's leaving, which the page reads from the rules; and the
  activities and the bounties.

## The tiers

- **Normal, Elite and Abyss** are the tiers in code, in the rooms' names (`--elite`, `--abyss`) and on every screen,
  the voyage's card included. The Roster says "Elite difficulty", so a voyage's tier is not read as a foe's rank.
- **The seas chosen set the tier**, as the owner decided: a voyage set out at Abyss makes the patrols it reaches, and
  the dungeons in them, Abyss. Each tier adds 0, 2 or 3 levels over the area's band, never past 32, and pays 1, 1.5
  or 2 times (`gear::world::Difficulty`).
- **The week's two dungeons have their own tier and level** (below), whatever the seas.

## What is on

| Activity | What | Tier and level | Opens |
|---|---|---|---|
| Dungeon of the day | One patrol dungeon on each island, drawn each day | The seas', at its island's band | Normal at any level; Elite seas from 10, Abyss seas from 20 |
| Bounties | Eight from the board, drawn each day | | After the prologue |
| Elite Dungeons | The 18 named dungeons | Normal, at their island's band | After the prologue |
| Elite Dungeon of the week | One of the 18, with one modifier | Elite, foes at 26 | Campaign's end, level 24 |
| Abyss Dungeon of the week | Another of the 18, with three modifiers | Abyss, foes at 30 | Campaign's end, level 28 |
| Elite Playlist | Any of the 18, drawn as each run starts, with the day's modifier | Elite, by bands of five levels | After the prologue, level 10 |
| Abyss Playlist | Any of the 18, with the day's modifier and one more | Abyss, by bands of five levels | After the prologue, level 20 |
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
- **Its end** holds a Boss with its own name and nameplate in place of a Reeve: one of the roster's types 21 to 38
  (`ISLAND_PLACES` names each dungeon's), a land Captain of its garrison's faction fighting in Corvane's three phases
  ([[Enemies]]).
- **Its encounters**: two or three seals in rooms along its walk (the Litany, the Weighing, the Ascent, the Holdfast),
  its Boss standing only once every seal is broken, and a Court of wards, anchors, the Reckoning and Fury round it
  ([[Dungeons]], "Encounters").
- **Its node** keeps its open-air approach and gains the entrance.
- **For four players**, matched together ([[Dungeons Live in Patrols, on the Sea's Islands and as Elite Dungeons]]).

## Runs and companies

- **A company** holds up to four, and a run holds four too: a fifth is sent away saying "This run is full.".
- **A run** is a private room for the company that enters: every dungeon at Elite or Abyss, every Elite Dungeon and
  both of the week's. A dungeon at Normal in a patrol stays in the patrol's shared room, as does a sea island's.
- **A run's room** is named by an instance after its dungeon's name (`--run-` and eight lowercase letters or digits,
  [[Server]]). Once its first player is in, only those it let in and their companies join, for as long as it lives
  (`Keeper.forCompany`); a player from another is sent back saying "This run is another company's.", and one it cannot
  keep (no session, or no token in time) saying "Sign in to enter this run.". No one plays in a run unkept: until the
  room keeps their character, a player's inputs are taken in their order and stand still (`Room::hold`). It is forgotten
  a minute after its last player leaves.
- **Find a Company** queues a player for an Elite Dungeon or the Elite Dungeon of the week, by level band (tens of
  levels, from the level their room last kept), from the entrance's card, and for each playlist by its own bands
  from the Playlist ("The Playlist"). A run starts with four, or with fewer after
  a minute's wait, never with two where one blocks the other, and those found go into it together ([[Accounts]],
  "Find a Company"). A group found is no company: it shares that one run alone.
- **The Abyss Dungeon of the week is never matched**, as Destiny 1's hardest weekly strike was not: a company forms
  it.

## The Playlist

The owner's decision is [[Elite and Abyss Dungeons Are Queued From a Playlist Beside Each Port]]; how it is shaped is
Claude's, recorded in [[The Playlist and Its Dungeons as Claude Shapes Them]].

- **Where.** A Playlist mark stands beside the harbour of each port city, Overlook, Sunspire and Rimeholt, at sea and
  over its island's side however the island is reached, open whether or not the city's social space is ([[Overworld]],
  "Marks"). Choosing it opens the Playlist screen for that port ([[Interface]], "The Playlist") rather than sailing
  or landing. The screen and its queues are the same from every port.
- **What it holds.** The Elite Playlist and the Abyss Playlist, then the Elite Dungeon of the week and the Abyss
  Dungeon of the week. The Journal's lines for the week's two say they are queued from the Playlist beside any port.
- **A playlist's run** (`gear::playlist`, `room::playlist_run`) is one of the 18 Elite Dungeons, laid as its run at
  Normal is, at the playlist's tier, every foe at its band's level. It carries the day's modifiers: the Elite
  Playlist the day's modifier, the Abyss Playlist the day's and one more of another kind drawn for the day (its own
  kind of draw, its Burn naming an Art as the day's does), and at Abyss Abyss's rules below. Its room is named
  `node-<Elite Dungeon>--<elite|abyss>--playlist-<foes' level>--run-<instance>` ([[Server]]); one naming a level no
  band of its tier stands its foes at, or at Normal, opens no room.
- **Bands.** Five levels each from the level it opens at; the band's foes stand at its first level raised by the tier,
  never past 32:

  | Playlist | Opens | Bands | Foes at |
  |---|---|---|---|
  | Elite | 10 | 10 to 14, 15 to 19, 20 to 24, 25 to 29, 30 | 12, 17, 22, 27, 32 |
  | Abyss | 20 | 20 to 24, 25 to 29, 30 | 23, 28, 32 |

- **Its gate** (`Place::Playlist`): the prologue first, then the playlist's level ("The Elite Playlist opens at
  level 10.", "The Abyss Playlist opens at level 20."), then the character's band: a run takes no one below its
  band's first level or above its last ("This run is for levels 15 to 19.", "This run is for level 30.").
- **Starting one.** Find a Company searches the playlist's one queue for the whole game ([[Accounts]], "Find a
  Company"); the server draws the Elite Dungeon as the company is found. Launch asks the same finder for a run at
  once, alone, which the player's company joins by the Roster; the server draws its Elite Dungeon too, as the owner
  chose ([[A Playlist's Launch Is Drawn by the Server]]), and a playlist's room lets in first only an account the server
  drew it for, or one of its company ([[Server]], "A run keeps to its company"). The Elite Dungeon of the week is found or launched; the Abyss Dungeon
  of the week is launched only, never matched, each the week's own dungeon, which the room checks. Offline, where
  nothing is kept, the page draws a playlist's Launch.
- **Going and coming back.** A run found or launched is gone into from the sea or over the island's side, through a
  voyage's veil; out of it by its door, its portal or a wipe, the player is back on the sea where the ship lies,
  beside the port it was launched from, as a sea island's dungeon leaves back to the sea. The rooms take a player
  into a playlist's run, or the week's run the Playlist names `--sea`, from the sea alone, and out of it only back to
  the sea ([[Server]], "Where a character comes from").
- **What it pays.** Every clear pays its kills, its cache and a dungeon's clear, as any run. Beside them:
  - **Daily:** each playlist's first clear each day, a Boss Captain's kill at the run's level and tier (as the dungeon
    of the day pays) and a sure Vestige in a Boss's colours, a Normal one coming as its item
    ([[Gear]], "Commons drop as themselves").
  - **Weekly:** each playlist's third clear each week, Essence of each stock (Elite 2, Abyss 3) and Vestiges in a
    Boss's colours (Elite one, Abyss two), each Normal one as its item.
  - A clear counts once a run for each account (`Run::playlist_counted`), however often its cache opens. The daily pays
    only in the day the run was opened for, its modifiers fixed then; a clear counts toward the weekly only in the
    week it was opened in.
- **The records.** `today` keeps whether each playlist's daily is taken (`elite_playlist`, `abyss_playlist`), and
  `this_week` each playlist's clears counted, to three, three meaning the weekly is paid; each is written only once
  touched, so an older save reads as none. The gear message carries them at the end of its table.

## Abyss's rules

They hold in every Abyss run: the hardest seas take Nightfall's rules, limited revives and a wipe ending the run, as
the owner approved ([[Where You Go and the Seas You Choose Set the Difficulty]]).

- **Revives:** the company shares five a run (`Room::revives`). Each stand of a fallen player takes one, whether an ally
  revives them or they respawn ([[Revives]]), revives before respawns in the same tick, each lowest player number first;
  when none are left the fallen stay down, no ally's hold taken up and no Respawn offered: the run is a darkness zone.
  Leaving stands no one up: the run keeps each kept player's body as they leave (`keep_body`), so one who left down
  comes back down and one who left wounded comes back at the share of health they left with, until the run starts over.
- **A wipe ends the run:** when every player in it is down at once, each is told (`Wiped`), the dungeon starts over and
  its five revives with it (`start_over`): its foes stand again at their posts, its shots and spells are gone, its
  drops are taken up, each Vestige to its player's mail, its cache shuts, and its players stand whole at the way in.
  The page takes them out by the way they came in, the veil saying "Your company fell. Leaving" the dungeon, and the
  place line shows the revives left ("3 revives left", "No revives left"). An Elite Dungeon keeps its broken seals
  through a wipe, the rest waiting again, and starts its Court over ([[Dungeons]], "Encounters"). A run once won is
  never wiped, though its end post (but an Elite Dungeon's Boss) stands again later and shuts its cache, so a cleared
  run keeps what it paid; and a room no one is in is never wiped.
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
  - Exposure: a heal on a player gives half; foes heal in full ("Heals restore half as much.").

## What it pays, once

- **Each character keeps its day and its week** with the account (`Character.activity`): `today` holds the tiers of
  the dungeon of the day it has cleared, its bounties, each by its board place with its count, and the places it
  turned in (`turned_in`); `this_week` holds whether it cleared each of the week's two dungeons and whether it holds
  the Abyss boon. Each begins anew at its first touch in a later day or week, and never turns back, so a room whose
  clock is behind cannot pay twice. `today` and `story` keep any key a later build wrote in them, so a rollback to
  this build loses none.
- **What a first clear pays** is `gear::clears`. Each writes the record, and none pays for a day or a week behind the
  one the record holds, so a room a few seconds behind 09:00 cannot write yesterday's clear into today.
- **The dungeon of the day**, the first clear at each tier each day, on any island's: beside the cache's own pay
  ([[Dungeons]], "The cache"), a Boss Captain's kill at the run's level, raised by the tier (XP 840 and Aurem 56 at
  level 5, times (5 + level) ÷ 10, times the tier's 1, 1.5 or 2), and a sure Vestige in a Boss's colours at the run's
  level ([[Gear]], "Vestiges"), a Normal one coming as its item ([[Gear]], "Commons drop as themselves").
  Three a day at most, under the rules every Vestige keeps now (no Legendary from foes
  under level 18).
- **The Elite Dungeon of the week**, once: a Legendary Vestige (its item at level 20) and 3 Essence of each stock.
- **The Abyss Dungeon of the week**, once: a Legendary Vestige, Atheric one time in five, 5 Essence of each stock,
  10 Shapes, the only Shapes there are ([[Gear]], "Vendors"), and the Abyss boon until the week turns: a quarter more
  of each kill's XP, rounded down, to the player, their Art and the faction pledged while its cape is worn
  ([[Factions]]), as `boon_xp` pays it. A kill on a ship's
  deck earns no boon, as it pays no officer ([[Naval Combat]]).
- **Where it is paid.** The room pays as the cache opens, each player then in it whose character it keeps, and keeps the
  Vestige with the record that pays it, in the carried ten, else the vault, else the mail ([[Gear]], "The mail"), so a
  Vestige once paid is never lost (`pay_clear`, `keep_paid`); a Normal one's item is kept as it is made, in its slot's
  nine, else the vault, else the mail. A player playing unkept finds the
  cache's own pay alone. A run's first clear pays only in the day or the week it was opened for, as its modifiers
  are fixed then. The day's pays in a run opened while its dungeon was its island's dungeon of the day, with that day's
  modifier at Elite and Abyss, and cleared that day; and at Normal in a patrol's shared room while it is its island's
  dungeon of the day by the room's clock then. The week's pays only in the week its run was opened for. So a run opened
  before a reset and cleared after it pays as a clear again. An Elite Dungeon at Normal and a sea island's pay their
  kills and cache alone.
- **A clear again** in the same period pays its kills and its cache as any run, no more.

## The band

Every activity's rewards an hour are measured and kept within one band, as the owner asked ("measure it for sure. We
need to keep all our content within this band", [[Passages Web Out From the Patrol Zone Across Its Island]]).

- **What is measured** (`gear::band`): an hour of each activity at every fifth level from 5 to 30 where it is open,
  for one player, as XP, Aurem, Vestiges and items as themselves by colour, materials (fragments, the island's
  resources, the ship's materials) and Essence: a patrol zone (its garrison fought and its nodes gathered while each
  group waits to stand again, its four public events an hour and their chests, the day's first heroic chest), a
  patrol's dungeons, the Elite and Abyss Playlists, the week's Elite and Abyss Dungeons run again, the sea (its ships
  sighted, fought and sunk, their salvage) and the passages at each depth whose foes stand at a player's level or over
  it (their kills, caches and lamps, the haul's finds less a death's share, one in twenty at the first depth to one in
  four at the twentieth). Each is reckoned from the rules' own pay, on average, never by dice; the day's and the
  week's rewards are spread over fourteen hours of play a week.
- **The times** are named constants, each saying where it was measured: a scripted player in the room crate
  (`room::band_measure_tests::measure_the_pace`, held whole, walking the navmesh to the nearest foe and swinging every
  half second) took 25 s a foe in a patrol zone's garrison, 55 s in a patrol's dungeon, 45 s in an Elite Dungeon and
  35 s in a passage zone, which holds some eighteen foes; a Boss's and a Miniboss's fights are `measure_blows`'; the
  sea's sightings and fights are the balance pass's. A run's level gap over its player lengthens its time by the share
  of a blow the gap leaves (`power::gap`). A lamp's zone, one in five of a dive, stands its guard alone; a vault is
  dealt only under ground, half the zones.
- **Loot** is weighed by colour, each twice the one below, as each colour drops half or less as often.
- **The band**, against a patrol zone's hour at the same level: XP and Aurem 0.7 to 2, loot 0.75 to 5
  (`PAY_BAND`, `LOOT_BAND`). A patrol's dungeon's own clear measured 0.73 of a patrol zone's Aurem; the owner's order
  asks harder content to drop more, so the week's Abyss Dungeon run again reaches 4.5 times its loot. A test fails for
  any activity outside it, and another if the passages pay the most XP and the most loot at every level.
- **Not counted**: bounties and the Abyss boon, which pay alike whatever is played, and the cold lantern, a bounty's.
  Shapes come from the week's Abyss alone and are not loot here.

As the measuring printed it (`cargo test -p gear --release measure_the_band -- --ignored --nocapture`):

| Level | Activity | XP | Aurem | Vestiges, Normal to Atheric | Items, Normal to Atheric | Materials | Essence | XP, Aurem, loot against the patrol zone |
|---|---|---|---|---|---|---|---|---|
| 10 | Patrol zone | 25275 | 2011 | 3.92/1.73/0.71/0.00/0.00 | 0.00/0.00/0.00/0.00/0.00 | 147 | 1.0 | 1.00, 1.00, 1.00 |
| 10 | Patrol dungeon | 19889 | 1474 | 4.56/1.63/0.60/0.00/0.00 | 3.64/1.36/0.52/0.00/0.00 | 0 | 0.0 | 0.79, 0.73, 1.82 |
| 10 | Sea | 22668 | 1710 | 0.22/0.06/0.02/0.00/0.00 | 4.35/1.35/0.43/0.00/0.00 | 62 | 0.0 | 0.90, 0.85, 0.90 |
| 10 | Elite Playlist | 21631 | 1575 | 4.90/1.91/0.79/0.00/0.00 | 3.25/1.33/0.57/0.00/0.00 | 0 | 0.3 | 0.86, 0.78, 1.96 |
| 10 | Passages, depth 10 | 25256 | 1900 | 4.99/1.66/0.57/0.00/0.00 | 0.40/0.15/0.06/0.00/0.00 | 11 | 0.1 | 1.00, 0.94, 1.12 |
| 10 | Passages, depth 11 | 31030 | 2316 | 5.70/1.92/0.66/0.00/0.00 | 0.39/0.15/0.06/0.00/0.00 | 11 | 0.1 | 1.23, 1.15, 1.28 |
| 10 | Passages, depth 12 | 24051 | 1807 | 3.93/1.34/0.47/0.00/0.00 | 0.26/0.10/0.04/0.00/0.00 | 7 | 0.1 | 0.95, 0.90, 0.89 |
| 20 | Patrol zone | 42142 | 3365 | 3.73/1.60/0.64/0.27/0.12 | 0.00/0.00/0.00/0.00/0.00 | 147 | 1.0 | 1.00, 1.00, 1.00 |
| 20 | Patrol dungeon | 33157 | 2469 | 4.36/1.56/0.57/0.22/0.08 | 3.44/1.28/0.51/0.21/0.08 | 0 | 0.0 | 0.79, 0.73, 1.75 |
| 20 | Sea | 59691 | 4321 | 0.38/0.13/0.05/0.02/0.01 | 5.63/1.94/0.70/0.26/0.10 | 79 | 0.0 | 1.42, 1.28, 1.25 |
| 20 | Elite Playlist | 34368 | 2528 | 4.63/1.79/0.73/0.31/0.14 | 3.00/1.23/0.55/0.25/0.11 | 0 | 0.3 | 0.82, 0.75, 2.01 |
| 20 | Abyss Playlist | 40450 | 2991 | 5.20/2.01/0.82/0.35/0.16 | 3.38/1.38/0.62/0.28/0.13 | 0 | 0.4 | 0.96, 0.89, 2.26 |
| 20 | Passages, depth 16 | 53937 | 4073 | 5.66/1.92/0.66/0.19/0.00 | 0.35/0.13/0.05/0.02/0.00 | 10 | 0.4 | 1.28, 1.21, 1.08 |
| 20 | Passages, depth 17 | 58921 | 4454 | 5.59/1.89/0.66/0.19/0.06 | 0.34/0.13/0.05/0.02/0.01 | 10 | 0.4 | 1.40, 1.32, 1.14 |
| 30 | Patrol zone | 59010 | 4718 | 3.73/1.60/0.64/0.27/0.12 | 0.00/0.00/0.00/0.00/0.00 | 147 | 1.0 | 1.00, 1.00, 1.00 |
| 30 | Patrol dungeon | 46426 | 3464 | 4.36/1.56/0.57/0.22/0.08 | 3.44/1.28/0.51/0.21/0.08 | 0 | 0.0 | 0.79, 0.73, 1.75 |
| 30 | Sea | 97754 | 7006 | 0.45/0.16/0.06/0.02/0.01 | 6.27/2.24/0.83/0.32/0.13 | 87 | 0.0 | 1.66, 1.48, 1.47 |
| 30 | Elite Playlist | 47106 | 3480 | 4.63/1.79/0.73/0.31/0.14 | 3.00/1.23/0.55/0.25/0.11 | 0 | 0.3 | 0.80, 0.74, 2.01 |
| 30 | Abyss Playlist | 62808 | 4640 | 6.11/2.36/0.96/0.41/0.18 | 4.01/1.64/0.74/0.34/0.15 | 0 | 0.4 | 1.06, 0.98, 2.66 |
| 30 | Elite Dungeon of the week | 65517 | 4854 | 7.56/2.87/1.15/0.55/0.21 | 5.25/2.14/0.97/0.44/0.20 | 0 | 0.4 | 1.11, 1.03, 3.37 |
| 30 | Abyss Dungeon of the week | 98643 | 7375 | 10.08/3.83/1.53/0.70/0.29 | 7.00/2.86/1.29/0.59/0.26 | 0 | 0.7 | 1.67, 1.56, 4.48 |
| 30 | Passages, depth 20 | 78937 | 5972 | 5.53/1.88/0.66/0.24/0.08 | 0.33/0.12/0.05/0.02/0.01 | 10 | 0.7 | 1.34, 1.27, 1.19 |

## Bounties

The bounties count what the rooms see happen on an engine of their own (`gear::objectives`), which a guild's week
counts toward its guild bounties too ([[Guilds]]). The quests are the
houses' roads, judged by their own events ([[Quests]]): the owner chose that the Journal shows them and the bounties
keep their engine ([[The Journal Holds the Quests, the Bounties at Its Side and the Timers at Its Top]]).

- **An objective** (`Objective`) is a count of something the room sees happen: foes of a faction or rank felled on an
  island, resource nodes gathered, ships sunk or taken in a water, a dungeon cleared at a tier. A rank or a tier
  counts it and every one above; a place named counts only a feat known to be there. The room tells the rules each
  feat (`Feat`) as it happens, and `Character::saw` counts it toward each bounty held today, up to its target; the
  account keeps the count. A room whose day is not the record's counts no bounty.
- **The rooms count** each foe felled for each player who shares its kill, but on a ship's deck, which is no island,
  so a boarding counts toward no bounty; each resource node gathered as its hold ends, and each
  dungeon cleared for each player the room keeps as its cache opens, the way the clear pays. A dungeon's room counts
  its clear for an account once a day at most (`Run::count_clear`), though its end post stands again and its cache
  opens again, so one dungeon farms no "Clear 3 dungeons."; a run is a room of its own, so each run counts. A room
  knows its island from its node's file, or from the patrol, the Elite Dungeon or the sea island its dungeon is of
  (`Room::set_island`); a room on no island counts no place.
- **The bounty board** stands on the notice board's landing in the Watch Court of Overlook's hub, its face to the
  court ([[Cities]], `city::board`), and opens after the prologue, on the counters' pattern of the
  plaza's keepers: the bake writes its counter on the plaza's node file, and the room serves its asks there. It is
  no station and has no keeper. It offers eight bounties a day, the same for everyone (`gear::bounties::board`, drawn by
  the day): places 0 and 1 on land, 2 and 3 at sea, 4 and 5 in dungeons, 6 and 7 in the passages ([[Passages]]), each
  pair two different ones of its pool. None names an
  island or a water, since the islands' bands run from 1 to 30. A character takes any of them; each pays once when
  turned in, by its tier as Destiny 1's three tiers paid (2,500, 3,750 and 5,000 XP): a first tier's 1,000 XP and 60
  Aurem at level 5, a second's half again, a third's twice, raised as a kill is by the character's level, its XP to
  their Art and faction as a kill's; and all end at the daily reset. Honest Work, Broadside and Into the Dark are of
  the first tier; Tithe Collector, A Cut Above, Bigger Fish and Deeper Still the second; Big Game, Sea Wolf and Deep
  Delver the third; of the passages', Down Below and Seam Worker the first, Errand Runner, Further In and Relic Hunter
  the second, Lamplighter the third (`Bounty.tier`, `bounty_pay`). The gear message carries a first tier's pay and each bounty's tier,
  and the card shows each one's own.
- **Taking and turning in** happen at the board alone (`Ask::TakeBounty`, `Ask::TurnInBounty`), each by its place
  and the day of the board the page showed. The room refuses a day not its own, and a room whose day is behind the
  record refuses both, so a page or a room on either side of 09:00 cannot take or pay yesterday's bounty as today's.
  The refusals read "The bounty board opens after the prologue.", "That bounty is no longer on the board.", "You
  already hold that bounty.", "That bounty is not done yet." and "That bounty is turned in already."; they are
  numbered 80 to 84, apart from the rest.
- **At sea** the sea's room keeps its sailors' characters ([[Accounts]], "At sea") and counts each captain's ship
  that goes down, sunk or taken (a ship taken is scuttled once her boarders leave her), on the character it keeps for
  each player who fought her, once each however often they are listed, by the water she went down in (its
  continent's id, none off every water) and her captain's rank, on the sea's day (`Sea::count_down`,
  `gear::objectives::count_ship_down`), one fighting on a captain's deck among them: stepping off, they keep it
  (`step_off`). A count that moves is saved and sent to the player at once, their gear written at the sea's minute so
  its bounties are the day's (`sea_gear_bytes`), by a room that holds that sailor alone, so it carries their own
  story only. On a captain's deck their gear is the deck room's, which keeps the sea's minute too; stepping off, they
  are sent the sea's again. The Journal reads the sea's word while the player is on the sea or choosing where to land,
  so a count shows as the ship goes down, not when the player lands.

## What opens when

- **The story's progress is kept with the account** (`Character.story`), not only in the browser: the prologue's
  end, which the room records; the houses' roads keep their own place ([[Quests]]). A new character starts short of
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
  and "Abyss seas open at level 20.". The sea's room, a sea island's room and a sea island's dungeon are gated by
  their seas alone: the sea's tier is its room's name's (`sea--elite`, `sea--abyss`), and an island's is its sea's
  (`Sea::shut`, an island's room `Place::Node`), so the server keeps a character below the tier's level off those
  seas, and the voyage's card never sets sail at a tier it shuts. The screens show what is
  shut and why: the Journal's timers, an entrance's card and the voyage's card. The page reads every gate's reason for a level
  from the rules (`room_gates`), so it never judges a gate itself.

## The screen

- **The Journal** is the menu's ([[Interface]], "The menu"). Its timers hold the dungeon of the day and its pay, the
  day's modifier with what it does, each tier's seas taken or not today, each island's dungeon of the day with its
  levels, then the week's two with their levels, rules, modifiers and pay, taken or not, and the Abyss boon while
  held, each counting to its reset. A shut line says why in its gate's words. "Taken" is the character's record as
  their gear last carried it, judged against the page's own day and week, so yesterday's clear reads as not taken
  today. Its right column holds the day's bounties taken, as the gear last carried them, as tiles with no press, or
  before the prologue the board's shut line alone. Gear of another day than the page's (a word heard before the reset,
  as at sea, where the character is sent only as it changes) shows no bounty, only "Six a day, from the board in
  Overlook’s plaza.", as before any room sent one. Its middle holds the houses' roads as story missions: the one the
  player walks at its task, and each done.
- **At the bounty board**, E opens its screen in the menu ([[Interface]], "The social space's counters"), after
  Destiny's Bounty Tracker: "Bounties for XP and Aurem, posted each day.", the day's six as tiles in a row a kind
  (land, sea, dungeons), a bar counting to the next board, and the chosen tile's card (its name, its kind, its words,
  its count, what it pays, and its press, Take or Turn in, with E). Each bounty has a short name of its own, as
  Destiny's do (`gear::bounties`, "Tithe Collector" to "Deep Delver"), carried with the board to the page. Arrows move between tiles; E or a click takes or
  turns one in. Before the prologue the tiles are grey and the card says why.
- **At a dungeon's entrance**, E opens a card ([[Interface]], "At a dungeon's entrance"): the run's tier and level,
  its rules and modifiers, what it pays or that it is taken, and why it is shut if it is, with Enter. A patrol's
  dungeon carries the day's modifier at Elite and Abyss seas while it is its island's dungeon of the day. An Elite
  Dungeon's card is its week's run where `eliteRun` picks it, else its run at Normal, and offers Find a Company
  while it is open.

## How it is built

One shared core in the rules, chosen over each system keeping its own resets (each would turn at its own moment) and
over a server-only activity service (it would break [[Clients Predict With the Shared Rules]]). The clock, the draws,
the records and the gates live in `gear`, which the server and the browser both run; each system reads them.

Its parts:

- **The core:** the clock, the tiers in code, the records, the story kept with the account, the gates.
- **The dungeons:** the dungeon of the day, the Elite Dungeons, the week's two, the modifiers, Abyss's rules and the
  rewards.
- **The screens:** the Journal, its timers, the bounty board and the card at a dungeon's entrance.
- **Companies of four**, private runs and Find a Company.
- **Bounties**: their engine and the board, which no keeper keeps.

The modifiers' and the rewards' numbers, how a modifier is shown, how a private run's room is named and closed, and
each Elite Dungeon's Boss are among Claude's calls.

## Claude's calls

Each is Claude's, open to the owner's change: the resets at 09:00 UTC and Tuesday; a dungeon of the day on each island
rather than one, with three rewards a day across them; Elite and Abyss seas opening at levels 10 and 20; the week's two
with foes at 26 and 30, opening at 24 and 28; private runs at Elite and Abyss; a run starting short after a minute, Find
a Company's bands of ten levels, and a group found sharing one run without becoming a company; the Playlist's shape,
its bands, modifiers, rewards and screen ([[The Playlist and Its Dungeons as Claude Shapes Them]]); five shared revives,
restored by a wipe; the modifier set; the rewards above and the quarter-more boon; a foe felled on a ship's deck
counting toward no bounty and earning no Abyss boon; eight bounties a day paying XP and Aurem; and the screen's names,
Find a Company and the Journal's Timers.
