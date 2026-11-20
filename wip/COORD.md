# Activities build: coordination with other sessions (working note)

Design: bible/02-Systems/Activities.md on claude/activities (PR #97, stacked on #82). Owner approved building all of
it except the nine missions ("The Activities Are Built in Full, Before the Story's Missions").

Worktrees: /home/user/overlook-source/.claude/worktrees/{activities, loop-decisions, pr72-main}. Main checkout holds
claude/dungeon-modules (#88): merge INTO it only from the main checkout. Leave CARGO_TARGET_DIR unset.
Stack order: main -> #72 (ccr-05431442-jb8u3u) -> #88 (claude/dungeon-modules) -> claude/activities (+ #82 merged).
Retarget #97's base to claude/dungeon-modules once #88 is merged in.

## #92 (factions, session_0137wHA7nGti2f9mrn6tF7UT)
- After #92 merges: move onto gear::clock: Shape's week (`shape::week_of`, `shape::place(week)`, `shape::wares(week)`),
  the cosmetics (`cosmetics::sold_on(seller, day)`), the smiths' (`room.day()`), client `npc/npcClock.ts` (Stock refresh,
  Shape's Leaves in). Update "Weeks" and daily rows of "Factions and Vendors as Claude Shapes Them.md".
- #92's minute plumbing: server/worker.ts MINUTE_MS, room-wasm set_minute, Here { day, week }: mirror names.
- Plaza: keep clear Shape's 8 spots (`city::courtyard::visitor_spots`), townsfolk lanes (client/src/game/townsfolk.ts
  TOWARD/ACROSS), Elder Maren Hale's walk (client/src/game/welcome/lanes.ts, counter fronts 48.5 m landward).
  The board stands free, not at the Harbourmaster. A new station kind goes through KEEPERS (keepers.ts) + npcWares.ts.
- Reputation: `Character::earn_reputation(xp)` (crates/gear/src/factions.rs, pub(crate)); the boon passes a quarter more.
- Their `#[serde(flatten)] unknown` keeps our Character fields through a rollback.

## #75 (sea, session_0137wHA9rTiM274Fw3sqn2Wy)
- Tier rename done on #75: commits 3913fe01 and 26f85566 (Difficulty Normal|Elite|Abyss, `--elite`/`--abyss`, voyage
  card). Cherry-pick both into the stack, then extend to #72's dungeon names (calm/rough/storm in roomNames.ts, rooms.ts).
- They will add a room-side event once per hostile ship sunk or taken: water, holder, rank, level, players (accounts).
  Suggested name `ShipDown`, beside `Sank` (crates/room/src/battle.rs:88; consumed in sea_ports.rs lay_flotsam). Map it
  into bounties when both are on main. Taken counts as down.
- I owe them `Room::dungeon_of(seed, style, levels)` beside `Room::dungeon(patrol, number, levels)`, on the activities
  stack; tell them when pushed. Style suggestion given: caverns for coves, crypt for ruins, mines for quarried islands.

## Prologue (asked session_0137wHA7kHaeE9dUeVCS1cvL "Saltmere"; no reply yet)
- Story end recorded with the account: the client asks the room at the prologue's last beat (client/src/game/prologue/beat.ts).

## Sea islands (session_0137wHA6YBnor7Y4RiTzNrCE, branch claude/sea-islands, stacked on #75)
- Owner approved building the procedural islands. They wire each island's dungeon door to my generator.
- I owe, on #88 (claude/dungeon-modules) right after #72 takes main and #88 takes #72:
  1. `Room::dungeon_of(name: &str, seed: u32, style: dungeon::Style, levels: Option<(u8, u8)>) -> Option<Room>`;
     `Room::dungeon(patrol, number, levels)` calls it; `dungeon::style_of(key) -> Option<Style>`.
  2. room-wasm dungeon door twin by seed and style key; client `askDungeonOf(seed, style)` beside `askDungeon`
     (client/src/game/dungeonLayout.ts), usable by dungeonTrips.
  3. Theirs: room naming (suggested `isle-<id>[--elite|--abyss]--dungeon`), server route, entrance door, seed, style map.
- Message them the commit when 1 and 2 are pushed.

## #92 corrections (15:07)
- #92 REPLACES main's `Room::set_day` with `Room::set_minute` (crates/room/src/players.rs) and `set_day`/`room_day`
  with `set_minute`/`room_minute` (room-wasm gear_door.rs, server/roomDoor.ts, server/worker.ts, client localRoom.ts);
  `Room::day()` is `minute / 1440`. Phase 1 must use EXACTLY these names; `Room::day()` becomes the clock's day.
  Daily lists all read `Room::day()`: smiths' wares and Tailor's emblems (`emblems::sold_on(day)`) on main; dyes, coats,
  bardings (`cosmetics::sold_on(seller, day)`) on #92.
- Plaza also: townsfolk `AT_COUNTER`, `AT_PARAPET`. A keeper takes KEEPER_KINDS (keepers.ts), `purseOf` (npcWares.ts),
  a speaker in content/story/cast.json + `<speaker>Hello/Thanks/Short` scenes in content/story/keepers.json, a room
  `CounterKind`, `counter_of` (room-wasm lib.rs; unknown names drop silently) and `counter_for` (room asks.rs).
- Saves: new data only as new keys at Character's top level or in materials/arts/allegiance/cosmetics/items. Never a new
  enum value (Slot, Rarity, Kind, At) or longer per-Art/per-faction lists: an unreadable save on rollback.

## Sea islands: their answers wanted (15:00) and mine
- They: style by island (cove caverns, ruin crypt, quarried mines); seed from island seed (u64) -> I take u32;
  levels = island_levels of the nearest continent (they misread `levels` as floors).
- They want ME to own: the dungeon room's opening (server/worker.ts), its room name, and the client trip; they give the
  island room's door position/facing; return = back on the island at the door. They model the island-side entrance
  (cave mouth, crypt stair, mine adit) in their own tools/islands pipeline.
- AGREED with Sea islands (15:12): I own the island dungeon's room and trip.
  * Name: `sea-dungeon-<continent>-<style>-<seed 8 hex>[--elite|--abyss]` (band from continent, tier from suffix,
    levels passed to dungeon_of = island band only). They produce the name from the island.
  * Mine: parse in server/roomNames.ts, a room-wasm export to open it (Room::dungeon_of), the route in
    server/worker.ts, the page's trip in (askDungeonOf) and out (back before their door, facing away).
  * They give: each door's (x, y) and bearing on the island room; they tell me where it is exposed.
  * Seed u32 (they fold their u64). No floors count; a size bound only if they ask.
  * Island-side entrance is theirs (tools/islands). Message them when the room + trip are pushed.

## #75 ShipDown is pushed (15:53)
- claude/waters-from-islands at 702ac600: crates/room battle.rs `ShipDown { water: Option<usize> (continent layout
  index), holder: Holder (Home off every water), rank, level, players: account ids }`, once per ship sunk or taken in a
  fight with players, beside each Sank; cleared at each tick's start. Read with `Sea::take_ship_downs()` after each
  tick. No wasm door or host reads it yet: bounty wiring (Phase 5) is mine, once #75 is on main.
- Room::dungeon_of already pushed on claude/dungeon-modules (e8f9c109); the islands session was told.

## Sea islands' answers (15:56), the door contract
- Name: `sea-dungeon-<continent>-<style>-<seed 8 hex>[--elite|--abyss]`, seed = `(s ^ (s >> 32)) as u32` of the
  island's u64 seed; continent = the layout id of the island's water's continent (e.g. `continent-4`); style
  caverns|crypt|mines by cove|ruin|quarry; tier = the sea room's tier the island was rolled in. No size bound.
- Door: island plan from its seed on the page through room.wasm (`isleDoor` `room_isle_plan`, JSON):
  `plan.door = { at: [x, y], facing, style }` in the island's frame (metres from its middle, x east, y south; facing =
  the bearing a player walks OUT); island middle in world = `seen.at` (sea snapshot). World door = door.at + seen.at.
  On the page: `IsleHeld` in client/src/game/isles.ts (`held.plan.door`, `held.seen.at`).
- Entering: E at the door calls `enterDungeon(door: DungeonDoor)` in client/src/game/game.ts with
  `{ style, seed (u64 decimal string), isle }`; they will extend it to `{ room name, world door [x, y], facing,
  continent }` and call my trip. I must give them its name/signature, e.g.
  `enterSeaDungeon(name, back: { x, y, facing })`, when parts 2-3 are pushed. Their branch: claude/sea-islands.

## #92 vend-by-day and lanes (16:35)
- On #92's branch: Gear message gains `day: uint` (the day whose smiths' wares it shows = `Room::day()`);
  `Ask::Vend { vendor, ware, day }` (page sends it in the ask's `item`); a vend whose day != `Room::day()` is refused
  `Refusal::NotSold` ("It is not sold here today"). Follows our clock day with nothing to move. When #92 meets the
  stack: reword the field's comment in `messages.fbs` ("counted from the epoch at UTC midnight") to the clock's day.
- Vestige keeps unknown keys too (`#[serde(flatten)] unknown`).
- The plaza lanes now live in `content/world/social.json` (`lanes`: toward, across, atCounter, atParapet), read by
  client/src/game/townsfolk.ts and by `city::courtyard`'s test that keeps Shape's spots off them. The board keeps clear
  of those (test against the same data once #92 is on main).

## Sea islands: trip handed over (17:40)
- Pushed claude/activities 267428ac. Sent them: `trips.enterSeaDungeon(room, back: SeaBack)` (dungeonTrips.ts), the room
  name rules, Normal shared / Elite-Abyss `--run-<i>`, server `runAsk`/`seaDungeonRoom`, coming out via
  `game.ontoSea(back)`; game.ts wires `ontoSea: () => goSea()` until they extend goSea to take SeaBack (their call).
- Sea islands (17:37): agreed. Their door hands `{ room, at: world [x, y], facing }`; they test the name against
  `seaDungeonRoom`'s shape. They won't pull #88/activities (#75's controller asked), so the one-line
  `trips.enterSeaDungeon(door.room, { x, y, facing })` and `goSea(back)` land when the stacks meet: WHICHEVER LANDS
  SECOND WIRES IT. If #97 lands after claude/sea-islands, I wire both lines (and a test) in game.ts.

## #92 MERGED to main 2a1236a9, deployed 19:15/19:17 UTC (19:21)
- Unblocked (mine, "Phase 5b" after the stack takes main): Shape's week + daily wares + smiths + npcClock.ts onto
  gear::clock; Gear.day comment reword ("counted from the epoch at UTC midnight"); Task 15 boon earn_reputation;
  board clearance test against content/world/social.json lanes + visitor_spots; "Factions and Vendors as Claude
  Shapes Them" rows.
- Locked patrol areas and social spaces are one flag: `locked` on the baked node (crates/bake/src/lib.rs `lock`; a
  social space keeps its city's lock). Check the gates against it at the merge.
- Merge note: both main (#92) and Phase 5 add `day: uint` at Gear's end: keep ONE (main's declaration, reworded).
- Owner asked #92's session for a detailed rebuild of Overlook's social space (corridors, areas, handcrafted stalls):
  plaza layout, lanes, Shape's spots will change. I asked them to leave the board a spot and tell me its place.
- Stack must take main: main -> #72 (pr72-main worktree) -> #88 (main checkout) -> activities. Full check each.

## #75 wiring for bounties at sea (Phase 5 Task 7, pushed c5cd9d64)
- crates/room-wasm/src/sea_counts.rs `tick`: replace `let downs: Vec<SeaDown> = Vec::new();` (and its comment) with
  `let downs = sea.take_ship_downs().into_iter().map(|down| ship_down(down.water, down.rank as u8, down.players));`
  (drop `as u8` if rank is u8; map players Into if not Vec<String>).
- On this stack the sea room knows no accounts (`room_own` at sea false): #75's ShipDown.players are account ids, so the
  sea host must know each player's account; check on wiring.

## Overlook hub rebuild (factions session, 20:11)
- New planner crates/city/src/hub/ for Overlook's social space; generic courtyard stays for other locked cities.
- The board keeps `Social.board` (foot middle + facing); the hub sets it: the Watch Court (landing court by the
  spawns), a small landing up three steps against the west range, read from 2 m. Exact coordinates to come.
- content/world/social.json lanes go away: townsfolk and Maren walk a graph `Social.ways`/`posts` (crates/city
  life.rs). The board's clearance test must check the ways (a helper: every way 1.3 m clear of every box), not lanes.
  => Phase 5b: DON'T build a social.json-lanes clearance test; wait for the hub and test against `ways`.
- Shape keeps 8 places; positions move into the hub. Station/counter kinds and asks unchanged; counter positions move.
- They do NOT touch gear::clock, shape week/place/wares, cosmetics sold_on, room.day(), npcClock.ts, the fbs day
  comment or earn_reputation: those moves are mine (Phase 5b).
- Same PR: social-space falls of 6 m+ kill at once (crates/reach, room dead-body step); ramps on every avenue
  (crates/city ramps.rs).
- They tell me when it's on a branch I can merge from.
- CLAUDE.md (main) now: a check run not of the head names the commit it covered; session end adds
  `bash tools/claude-toolkit/toolkit-data.sh save` before headroom learn.

## Stack took main (#92) (20:40)
- #72 36add04f (pushed), #88 1a9b3050 (pushed). Verified: no file outside each branch's own changes differs from base.
- Merge calls: a dungeon room carries its patrol's lock (main locks patrol zones), room_join_at refuses while locked;
  camera ceiling clamp applied after main's boom easing; EntranceView.prepare renamed termsWritten; game.ts 599 lines
  on #72 (next addition needs a module).
- Next: #88 -> activities after the Phase 5 fix agent finishes (Gear `day` duplicate: keep one).
- Hub (20:35): the 6 m fall rule applies only to social nodes (not patrols, missions, dungeons). The board's landing is
  `city::hub::BOARD_LANDING_M` (courts is private) (hub frame: middle across -51.5 m at the plaza's middle line, 6 m across, 9 m
  along, 0.45 m high, three 0.15 steps, against the west range). WHICHEVER MERGES SECOND sets `Social.board` from it:
  the board on the landing, facing east into the Watch Court. They send the branch name when it passes the check.

## #75 bounties at sea, REVISED (21:00): the adapter was removed (b08ff3ed)
- The sea room counts on the characters it keeps: in `Sea::tell_down` (sea_ports.rs), call
  `gear::objectives::count_ship_down(held fighters by PlayerId, island, rank u8, day)`, mark harbour.changed. Sent to
  #75's session with the exact lines. Prerequisite: Sea needs `minute` (set_minute for Opened::Sea). Whichever lands
  second wires it. The old "one line" note above is superseded.
- #75 (20:41): agreed; they add `Sea.minute` (set_minute for Opened::Sea) with a test after their main merge, and
  will message the commit. They remove `ShipDown` and `Sea::take_ship_downs` (I said nothing of mine reads them).
- #75 (21:17): don't wait on them. Their branch takes main (incl. "#102") with `Sea.minute`, and removes ShipDown,
  take_ship_downs AND tell_down: the count snippet goes in `after_fights`'s `for ship in sank` loop, as its own small
  fn. They message the commit when pushed.
- Main moved again (21:20): #107 (audit fixes) and #102 (foes in groups, room/groups.rs, foes/rally.rs) at 18e6e8e8.
  Second catch-up running: main -> #72 -> #88 (agent); then activities takes #88 again after the first merge lands.

## activities took #88+main (#92) at c90fb37f (pushed 21:40)
- Merge calls: one Gear `day` (main's place, 09:00 UTC comment); dice purpose clash (main Cosmetic=12 vs our Draw=12):
  main's numbers kept, draws roll via `Dice::roll_numbered(DRAW + nth)`, DRAW=12 in activities.rs, pins unchanged;
  main's LOCKED (4003) folded into our SHUT (4003, "turned away, here is why"); a locked patrol's run opens but takes
  no player ("<name> is locked"), open_run gets the patrol's file; Shape's code renamed to Normal/Elite/Abyss;
  game.ts and gearWindow.ts exactly 600 (startActivities() in activityScreens.ts now builds trips, screens, heed()).

## Number spaces shared across branches (keep a registry here)
- Asks: main 50-57 (#92); ours 17 FinishPrologue, 18 TakeBounty, 19 TurnInBounty.
- Refusals: main 24-34 (#92); ours 80-84 (answered 81-85).
- Close codes: 4001 elsewhere (final on the page now), 4003 SHUT/locked ("turned away, here is why"), 1013 AGAIN
  (rejoinable), 1011 finder trouble.
- Dice purposes: main up to Cosmetic=12; our draws via roll_numbered(DRAW=12 + nth) on their own seed.
- EventKind: Wiped = 14.
- Second catch-up pushed (21:55): #72 4f35da20, #88 f5fa4291 (main 18e6e8e8: #102, #107). Next: activities takes #88
  again after Phase 5b.
- #75 pushed (22:14): claude/waters-from-islands ac627935 (main through #105). 2a506aab: `Sea.minute` (u64) set by
  set_minute for Opened::Sea; ShipDown, take_ship_downs, Harbour::downs, tell_down REMOVED. When branches meet: the
  ship count goes in `Sea::after_fights`' `for ship in sank` loop (sea_ports.rs) as its own small fn, day from
  `self.minute` (gear::clock::day_of). Main's #105 and #98 exist: main moved again (check before the next catch-up).
- (22:25) activities 1fab584e pushed. Main moved to 4da959f5 (#105, #98 the second playthrough): #72 "dirty", no CI.
  Third catch-up running for #72 and #88; activities after the Journal build. Disk is tight (~20 GB).
