# Activities, Phases 3 and 4: the screens, companies of four and Find a Company. Implementation plan

**Goal.** Build steps 3 and 4 of the approved Activities design.
- **This Week** goes in the menu's Journal tab. It shows what is on today and this week, each activity's tier, level and modifiers, what it pays, whether this character has taken it, what is shut and what opens it, and the time to each reset.
- **An entrance's card.** E at an entrance opens a card. It shows the run's tier, level and modifiers, what it pays and whether it is taken. It has Enter, and Find a Company where that matches.
- **The voyage card** greys out a tier the player's level shuts and shows the gate's reason.
- **Companies hold four**, and a run holds four.
- **Find a Company** matches players by level band for an Elite Dungeon at Normal or the Elite Dungeon of the week, never the Abyss Dungeon of the week. A run starts with four, or with fewer after a minute. It opens Phase 2's private run for the group found.

**Architecture.**
- **Rules (`gear`, `room-wasm`).** Everything ruled stays in Rust. `gear::activities::Modifier` gains `words`. Phase 2's `activities_json` gains each island's band at each tier, the week's levels, the revives and each modifier's name and words. A new `gates_json(level, prologue)` gives every gate's reason, read from `gear::gate::shut_at`. The gear message carries the character's raw `Activity` record, and the page judges "taken" against its own clock's day and week.
- **The page.** One glue module, `client/src/game/activityScreens.ts`, keeps the last gear any room sent, so it survives a voyage. It answers the menu's Journal (`week()`) and the voyage card (`seasShut()`). It owns the entrance card (`card()`) and, in Phase 4, the search. All the words come from pure functions in `client/src/game/activityWords.ts`. `game.ts` gains two lines.
- **The queue.** Find a Company is a Durable Object of the accounts' Worker, one for each run's base name (`CompanyFinder`, reached at `/v1/find/<base>` by WebSocket). It lives there, not in the rooms' Worker, because the accounts already hold everything it needs in D1: the session behind a token, the level the player's room last kept (`$.shown.level`), blocks, and the companies the rooms' check reads. Hosting it there needs no new binding and no new RPC between the two Workers.
- **Admitting a found group.** A matched group is not made a company. The accounts record whom a run was found for (`found_runs`), and Phase 2's `companions(account)` becomes `companions(account, room)`: the company, plus those found together for that room. Reasons:
  - `companies.ts`'s `join` first takes a player out of the company they chose.
  - A company outlives a run: strangers would stay on each other's HUD and Roster.
  - The room only needs to know who may share this one run.

**Tech stack.**
- Rust (`gear`: serde, serde_json and libm only; `room`; `room-wasm`; `protocol`) and FlatBuffers (`npm run schema`).
- TypeScript strict with `node --test` and the fake page (`client/src/game/pageForTests.ts`).
- Cloudflare Workers, Durable Objects (SQLite classes) and D1, tested on `node:sqlite` (`sqliteForTests.ts`).

**Spec path.** `/home/user/overlook-source/.claude/worktrees/activities/bible/02-Systems/Activities.md`, steps 3 and 4 of "How it is built". It builds on Phase 2's plan (`/tmp/claude-0/-home-user/9f21cb27-f026-527e-9630-2cc37fba4bb5/scratchpad/activities/PLAN-phase2.md`, its Task 0 and "Changes from the lead's review" included).

**Line numbers.** None are given. Phase 2 is being committed on `claude/activities` as this is written: tasks 0 to 3 are in and Task 4 is on disk. Find every edit by the symbol named. Where Phase 2 as built differs from its plan's names, follow the built names and say so in the PR.

**Phase 2 interfaces consumed.**
- Rust and the room module: `activities_json`/`room_activities`, `open_run`, `room::REVIVES` (in `run.rs`), `Weekly`, `gear::gate::{Place, Shut, shut_at}`.
- Page: `client/src/game/activities.ts` (`Activities`, `activitiesAt`, `eliteRun`), `client/src/game/rooms.ts` (`nodeRoom`, `runOf`, `sharedRun`) and `dungeonTrips(...).enter(number, name)`.
- Server: `server/roomNames.ts` (`nodeRoom`, `runAsk`, `privateRun`, `RUN_ENDING`) and `Keeper.forCompany()` with `Characters.companions(account)`.
- Accounts: `companionsOf(database, account)` (`server/accounts/companies.ts`).

---

## Global constraints

- `gear` uses only `serde`, `serde_json` and `libm`, and holds no clock; the host passes the Unix minute.
- Agree to the bit: no rule is computed in TypeScript; levels, gates, draws and modifiers come from the room module.
- A source file holds at most 600 lines and a test file at most 800. Watch these:
  - `client/src/game/game.ts`: about 591 after Phase 2; these phases add 2.
  - `client/src/game/gearWindow.ts`: 582; this adds 5.
  - `server/worker.ts`: about 295; this adds 3.
  - `crates/room-wasm/src/lib.rs`: about 536; this adds 0.
  - `client/src/network/accounts.ts`: 273; this adds 5.
  - `client/src/game/foot.ts`: about 586; untouched.
- A comment says why, in at most 8 lines, with no history, no calendar dates (test comments too), no issue numbers and no `bible/` paths.
- Names are spelled out. ESLint's `id-length` allows only its short list, so never name a variable `on`, `at`, `ms` or `ss`.
- Destiny's word "fireteam" appears nowhere on screen or in a new code name, comment or note; nor do "Nightfall" or "Strike".
- Each screen says which Elite it means: "Elite seas", "Elite Dungeon", "Elite Dungeon of the week", or a foe's nameplate.
- Text is plain and short, with no em dashes on screen. Every string added is in the list at the end.
- The bible says how things work now. Each system note changes in the commit that changes its code. A decision page is never rewritten.
- Tests pin behaviour, never where lines sit.
- `cargo xtask check` passes before every commit (`npm ci` once first).
- Generated files stay out of git (`generated/messages`, `target/protocol`). Run `npm run schema` after a `.fbs` edit. The protocol version is the schema's hash.
- Invent no game design beyond what the design pins. The builder's picks are listed at the end.
- #92's names still bind: `DAY_MINUTES`, `WEEK_MINUTES`, `week_of`, `Room::minute`, `Room::day()`, `set_minute`, `MINUTE_MS`. Always write `Difficulty::Elite` in full.
- Saves: no new `Character` field and no new value of a saved enum.
- A room name is at most 64 characters of `[a-z0-9-]`. A run's name is Phase 2's `<base>--run-<8 of a-z0-9>`.
- D1 changes only by a new migration named by its UTC time (`YYYYMMDDHHMMSS_name.sql`). An applied migration is never edited.
- Durable Objects are SQLite classes (`new_sqlite_classes`), as the rooms' are.
- The page reaches the accounts only at the address `accountsFrom` allows, so Find a Company is online only.
- #92 also edits `gearWindow.ts`. Keep this phase's edits there to `TAB_PRESSES`, `plainPage` and one parameter.
- Each task is one commit ending with the session's attribution lines. One PR goes up per phase, merged only on the owner's yes.

## Review focus

These five inputs are the most likely to break these phases, and no ordinary task test reaches them. Each pinning test is added to the task named.

1. **The week turns while a player waits for the Elite Dungeon of the week.** At Tuesday 09:00 the base the player queued for (`node-forsaken-cistern--elite`) stops being this week's. A group matched after that gets a run whose room refuses to open (`dungeon_run` is none for an Elite Dungeon at Elite that is not the week's). The card must notice that its run changed and end the search. Pinned by `a search for the Elite Dungeon of the week ends as the week turns, and the card offers its Normal run` (Task 10).
2. **One account searching twice, or a seeker gone before the run is found.** A second tab, or a reconnect, must not put one account in a group twice. A socket closed before the tick must not be counted or told. Pinned by `one account waits once: a second search replaces its first, and a search left is in no run` (Task 9) and `a seeker gone before their run is found is told nothing, and the rest still go in` (Task 9).
3. **Strangers who block each other.** Matching must keep a block apart in either direction, as a company does. Pinned by `two who block each other are never in one run, whichever blocked whom` (Task 9).
4. **A found group admitted beyond its run.** A row for run A must not admit anyone into run B, and must not make the group a company anywhere else. Pinned by `a run found for strangers lets in each one found for it, and none of them into another run` (Task 8).
5. **A tier already picked that the level now shuts.** A character switch, or a pick kept from an earlier voyage, would set sail at a shut tier and bounce off the gate. Pinned by `the voyage card shuts a difficulty the player's level shuts, says why, and never keeps it picked` (Task 6).

Shared test constants (from Phases 1 and 2):
- `FRIDAY_NINE = 29_919_420`: day 20_778, week 2_968.
- `29_925_179`: the last minute of week 2_968; one minute later is week 2_969.
- Draws pinned by Phase 2:
  - Day 20_778: `ofTheDay[0]` is `gullwing-vale` 0 on `continent-1`, and the day's modifier is Burn (Shadow).
  - Week 2_968: Forsaken Cistern with Brawler, and Saltworm Warrens with Lightswitch, Burn (Divine) and Juggler.
  - Week 2_969: Pearl Tomb and Coral Halls.
- Phase 2 pinned `untilDay` 1_440 and `untilWeek` 5_760 at `FRIDAY_NINE`.

---

# Phase 3: the screens

## Task 1: the rules say what each modifier does, each island's levels at each tier, and why each place is shut

**Files**
- Gear:
  - `crates/gear/src/activities.rs`: `Modifier::words`.
  - `crates/gear/src/activities_tests.rs`: appended.
- Room:
  - `crates/room/src/lib.rs`: Phase 2's `pub use run::{RunOf, elite_laid};` becomes `pub use run::{REVIVES, RunOf, elite_laid};`.
- Room module:
  - `crates/room-wasm/src/run_door.rs`: `activities_json` gains keys; `gates_json` and `room_gates` are new; its tests are appended, and Phase 2's `what_is_on_reads_as_the_rules_draw_it` pins gain `level` and `opens`.
  - `crates/room-wasm/src/lib.rs`: `pub use run_door::{activities_json, gates_json, open_run};`.
- Server:
  - `server/roomDoor.ts`: `RoomDoor.gates`, `RoomExports.room_gates`, and the binding.
  - `server/roomDoor.test.ts`: Phase 2's `weekAbyss` deepEqual gains `level: 30, opens: 28`; a test is appended.
- Page:
  - `client/src/game/activities.ts`: types and `gatesAt`.
  - `client/src/game/activities.test.ts`: appended.

**Interfaces**
- Consumes `gear::gate::{Place, Shut, shut_at}`, `gear::world::{Difficulty, ISLANDS}`, `Weekly::{foes_at, opens_at}`, `room::REVIVES` and the arts' names.
- Produces:
```rust
impl Modifier {
    /// What it does, in a short plain line for the player.
    #[must_use]
    pub fn words(self) -> String;
}
// run_door.rs. activities_json adds:
//   "bands": {"<continent>": [[low, high] at Normal, at Elite, at Abyss]} for each of ISLANDS, by Difficulty::raise,
//   "revives": room::REVIVES,
//   "weekElite"/"weekAbyss": { "place", "modifiers", "level": foes_at(), "opens": opens_at() },
//   "modifiers": { "<key>": { "name", "words" } } for the day's and both of the week's.
/// What the gates shut to a character of `level`, past the prologue or not, each the reason or null where it is open:
/// the dungeon of the day at each tier, an Elite Dungeon, the week's two, and the seas at each tier.
/// {"day":[r,r,r],"eliteDungeon":r,"weekElite":r,"weekAbyss":r,"seas":[r,r,r]}
#[must_use]
pub fn gates_json(level: u8, prologue: bool) -> String;
#[unsafe(no_mangle)]
pub extern "C" fn room_gates(level: u32, prologue: u32) -> u64; // hand_over(gates_json(..).into_bytes())
```
  - `day[t]` is `shut_at(level, prologue, Place::PatrolDungeon, t)`.
  - `eliteDungeon` is `(Place::EliteDungeon, Normal)`.
  - `weekElite` is `(Place::Week(Weekly::Elite), Elite)` and `weekAbyss` is `(Place::Week(Weekly::Abyss), Abyss)`.
  - `seas[t]` is `(Place::Node, t)`: the tier alone, for the voyage card.
  - `level` saturates to `u8::MAX`.
```ts
// server/roomDoor.ts
gates(level: number, prologue: boolean): string;          // RoomDoor
room_gates(level: number, prologue: number): bigint;      // RoomExports
// client/src/game/activities.ts
export interface ModifierShown { readonly name: string; readonly words: string }
export interface WeekOn { readonly place: string; readonly modifiers: readonly string[]; readonly level: number; readonly opens: number }
export interface Activities {
  // Phase 2's day, week, untilDay, untilWeek, ofTheDay and dayModifier, and:
  readonly weekElite: WeekOn;
  readonly weekAbyss: WeekOn;
  /** Each island's band at Normal, Elite and Abyss, by continent, raised as its foes are. */
  readonly bands: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  readonly revives: number;
  readonly modifiers: Readonly<Record<string, ModifierShown>>;
}
export interface Gates {
  readonly day: readonly (string | null)[];
  readonly eliteDungeon: string | null;
  readonly weekElite: string | null;
  readonly weekAbyss: string | null;
  readonly seas: readonly (string | null)[];
}
/** Why each place is shut to a character of `level` (null where it is open), as the room module's gates judge. */
export function gatesAt(module: WebAssembly.Module, level: number, prologue: boolean): Gates;
```

**Steps**
1. Write the failing tests.
   - `activities_tests.rs`:
```rust
#[test]
fn each_modifier_says_what_it_does_in_a_short_plain_line() {
    let kinds = [Modifier::Burn(3), Modifier::Brawler, Modifier::Marksman, Modifier::Lightswitch, Modifier::Ironclad,
        Modifier::Trickle, Modifier::Juggler, Modifier::Exposure];
    assert_eq!(kinds.map(Modifier::words), [
        "Shadow spells deal double damage. Wearing Shadow, you take double.",
        "Melee deals 50% more damage.",
        "Ranged deals 50% more damage.",
        "Foes' melee deals double damage.",
        "Half of all foes carry shields.",
        "Arts take 50% longer to recharge.",
        "No ammunition drops.",
        "Heals restore half as much.",
    ].map(str::to_owned));
    assert_eq!(Modifier::Burn(1).words(), "Storm spells deal double damage. Wearing Storm, you take double.");
}
```
   - `run_door.rs`:
```rust
#[test]
fn what_is_on_says_each_islands_levels_at_each_tier_the_weeks_levels_the_revives_and_each_modifiers_words() {
    let drawn: Value = serde_json::from_str(&activities_json(29_919_420)).expect("JSON");
    assert_eq!(drawn["bands"]["continent-1"], json!([[1, 4], [3, 6], [4, 7]]));
    assert_eq!(drawn["bands"]["continent-9"], json!([[26, 30], [28, 32], [29, 32]]), "never past 32");
    assert_eq!(drawn["bands"].as_object().map(serde_json::Map::len), Some(9));
    assert_eq!([&drawn["weekElite"]["level"], &drawn["weekElite"]["opens"]], [&json!(26), &json!(24)]);
    assert_eq!([&drawn["weekAbyss"]["level"], &drawn["weekAbyss"]["opens"]], [&json!(30), &json!(28)]);
    assert_eq!(drawn["revives"], json!(5));
    assert_eq!(drawn["modifiers"]["burn-shadow"],
        json!({ "name": "Burn (Shadow)", "words": "Shadow spells deal double damage. Wearing Shadow, you take double." }));
    let keys: std::collections::BTreeSet<&str> =
        drawn["modifiers"].as_object().expect("an object").keys().map(String::as_str).collect();
    assert_eq!(keys, ["brawler", "burn-divine", "burn-shadow", "juggler", "lightswitch"].into_iter().collect());
}

#[test]
fn the_gates_say_why_each_place_is_shut_to_a_level_and_its_story() {
    let gates = |level, prologue| serde_json::from_str::<Value>(&gates_json(level, prologue)).expect("JSON");
    let young = gates(9, true);
    assert_eq!(young["day"], json!([null, "Elite seas open at level 10.", "Abyss seas open at level 20."]));
    assert_eq!(young["seas"], young["day"]);
    assert_eq!([&young["eliteDungeon"], &young["weekElite"], &young["weekAbyss"]],
        [&json!(null), &json!("This dungeon opens at level 24."), &json!("This dungeon opens at level 28.")]);
    let before = gates(30, false);
    let prologue = "This place opens after the prologue.";
    assert_eq!(before["day"], json!([prologue, prologue, prologue]));
    assert_eq!(before["eliteDungeon"], json!(prologue));
    assert_eq!(before["seas"], json!([null, null, null]), "the seas ask the level alone");
    assert_eq!([&gates(24, true)["weekElite"], &gates(28, true)["weekAbyss"]], [&json!(null), &json!(null)]);
}
```
   - `server/roomDoor.test.ts`:
```ts
test('the gates read as the rules judge them for a level and a story', () => {
  const room = startRoomDoor(compiled);
  const gates = JSON.parse(room.gates(9, true)) as { day: unknown[]; weekElite: unknown };
  assert.deepEqual(gates.day, [null, 'Elite seas open at level 10.', 'Abyss seas open at level 20.']);
  assert.equal(gates.weekElite, 'This dungeon opens at level 24.');
});
```
   - `client/src/game/activities.test.ts`:
```ts
test('what is on carries each island’s levels at each tier, the week’s levels, the revives and each modifier’s words, and the gates for a level', async () => {
  const drawn = activitiesAt(await module, 29_919_420);
  assert.deepEqual(drawn.bands['continent-4'], [[10, 13], [12, 15], [13, 16]]);
  assert.deepEqual([drawn.weekElite.level, drawn.weekElite.opens, drawn.weekAbyss.level, drawn.weekAbyss.opens, drawn.revives], [26, 24, 30, 28, 5]);
  assert.deepEqual(drawn.modifiers['brawler'], { name: 'Brawler', words: 'Melee deals 50% more damage.' });
  const gates = gatesAt(await module, 9, true);
  assert.deepEqual([gates.eliteDungeon, gates.weekElite, gates.weekAbyss], [null, 'This dungeon opens at level 24.', 'This dungeon opens at level 28.']);
  assert.deepEqual(gatesAt(await module, 30, false).seas, [null, null, null]);
});
```
2. Run them.
   - `cargo test -p gear --lib activities_tests` should fail to compile: no method named `words`.
   - `cargo test -p room-wasm run_door` should fail to compile: cannot find function `gates_json`.
   - `npm run wasm && node --import ./tools/testStyles.mjs --test server/roomDoor.test.ts client/src/game/activities.test.ts` should fail with "room.gates is not a function" and "does not provide an export named 'gatesAt'".
3. Implement.
   - `words` is literal per kind beside the constants. Burn formats the Art's `name`.
   - `gates_json` maps `Option<Shut>` through `Shut::reason`, else null.
   - `gatesAt` keeps one door per module, as `askDungeon`'s `doors` does.
4. Run `cargo test -p gear -p room-wasm`, then `npm run wasm && npm test`, then `cargo xtask check`.
5. Commit: "The rules say what each modifier does, each island's levels at each tier, and why each place is shut to a level".

**Bible.**
- `Activities.md`:
  - "Abyss's rules", the Modifiers bullet: each modifier's line as above.
  - "What opens when": the page reads every gate's reason for a level from the rules (`room_gates`), so it never judges a gate itself.
- `Server.md` "The room": `gates`, and the new keys of `activities`.

---

## Task 2: each player's gear carries their day's and week's record

**Files**
- `crates/protocol/messages.fbs` `table Gear`, after `prologue_done`; then `npm run schema`.
- `crates/protocol/src/gear_wire.rs` (the `GearArgs`) and `crates/protocol/src/gear_wire_tests.rs` (appended).
- `client/src/network/gearMessages.ts`: `ActivityRecord`, `GearState.activity`, and the read.
- `client/src/network/gearMessages.test.ts`: appended to the test that reads `gear.bin`.

**Interfaces**
```
  // Their day's and week's record as kept with their character (gear's Activity): the day it is for and the tiers of
  // the dungeon of the day cleared then (0 Normal, 1 Elite, 2 Abyss); the week it is for, whether they cleared the
  // Elite and the Abyss Dungeon of the week, and whether they hold the Abyss boon. The page judges each by its own day.
  activity_day: uint;
  cleared: [ubyte];
  activity_week: uint;
  week_elite: bool;
  week_abyss: bool;
  boon: bool;
```
- Each tier's number is its place in `Difficulty::ALL`.
- `activity_day` and `activity_week` are `u32::try_from(..).unwrap_or(u32::MAX)` of the record.
```ts
/** Their day's and week's record, as kept with their character (`Gear`'s comment says each field). */
export interface ActivityRecord {
  readonly day: number; readonly cleared: readonly number[];
  readonly week: number; readonly elite: boolean; readonly abyss: boolean; readonly boon: boolean;
}
// GearState
readonly activity?: ActivityRecord;
```

**Steps**
1. Write the failing tests.
   - `gear_wire_tests.rs`:
```rust
#[test]
fn a_players_gear_carries_their_days_and_weeks_record_as_kept() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let mut character = room.player(player).expect("in the room").character.clone();
    character.activity.today = gear::activity::Today {
        day: 20_778, cleared: [Difficulty::Elite, Difficulty::Abyss].into_iter().collect(), ..Default::default() };
    character.activity.this_week = gear::activity::ThisWeek { week: 2_968, elite: true, abyss: false, boon: true };
    assert!(room.restore_character(player, &character.to_json()));
    let bytes = gear_bytes(&room, player).expect("written");
    let gear = messages::root_as_from_room(&bytes).expect("read").gear().expect("gear");
    assert_eq!((gear.activity_day(), gear.activity_week()), (20_778, 2_968));
    assert_eq!(gear.cleared().map(|tiers| tiers.iter().collect::<Vec<u8>>()), Some(vec![1, 2]));
    assert_eq!((gear.week_elite(), gear.week_abyss(), gear.boon()), (true, false, true));
}
```
   - `gearMessages.test.ts`, in the `gear.bin` test:
     `assert.deepEqual(gear.activity, { day: 0, cleared: [], week: 0, elite: false, abyss: false, boon: false }, 'a character that has done nothing yet');`
2. Run `cargo test -p protocol gear_wire`. It should fail to compile: no method `activity_day`. Then run `node --import ./tools/testStyles.mjs --test client/src/network/gearMessages.test.ts`, which should fail: `gear.activity` is undefined.
3. Implement. Edit the schema, run `npm run schema`, build `cleared` before `GearArgs` (the builder's borrow), and read `activity` in `gearOf` beside `prologueDone`.
4. Run `cargo test -p protocol && npm test`, then `cargo xtask check`.
5. Commit: "Each player's gear carries their day's and week's record, so the page can say what they have taken".

**Bible.** `Server.md` "Messages": the gear's record, sent raw and judged by the page against its own day.

---

## Task 3: what This Week and an entrance's card say

**Files**
- Create `client/src/game/activityWords.ts` and `client/src/game/activityWords.test.ts`. Read the module as `dungeonTrips.test.ts` does.

**Interfaces**
- Consumes `Activities`, `Gates`, `ModifierShown`, `activitiesAt`, `gatesAt` and `eliteRun` (`activities.ts`); `nodeRoom` (`rooms.ts`); `ActivityRecord`; `NodeInfo`; `Difficulty` (`heldmap/heldMap.ts`).
- Produces:
```ts
/** The tiers in the rules' order, as the gear's record numbers them. */
export const TIERS: readonly Difficulty[] = ['normal', 'elite', 'abyss'];
/** How long until a reset: minutes; then hours and minutes; then, from two days, days and hours. */
export function resetWords(minutes: number): string;
/** An island's band, or a fixed level: "Levels 3 to 6", "Level 26". */
export function levelWords(band: readonly [number, number]): string;
/** A line of This Week: what it is, what is said of it, and this character's word on it: taken, not taken, or why it
 *  is shut (null where the character is not yet known, or the line has none). */
export interface WeekRow { readonly name: string; readonly about: string; readonly state: string | null; readonly shut: boolean }
/** One of the week's two, with its rules, modifiers and pay. */
export interface WeekDungeon extends WeekRow {
  readonly rules: readonly string[]; readonly modifiers: readonly ModifierShown[]; readonly pays: string;
}
export interface ThisWeek {
  readonly today: {
    readonly resets: string; readonly pays: string; readonly modifier: ModifierShown | null;
    readonly tiers: readonly WeekRow[]; readonly dungeons: readonly WeekRow[];
  };
  readonly week: { readonly resets: string; readonly dungeons: readonly WeekDungeon[]; readonly boon: string | null };
}
/** The names the page knows places by: a patrol's dungeon's, and a node's. */
export interface Named { dungeon(patrol: string, number: number): string; place(id: string): string }
export function thisWeekOf(drawn: Activities, gates: Gates | null, record: ActivityRecord | null, named: Named): ThisWeek;
/** Where a card is opened: the place the player stands in, its seas, the entrance's number and its dungeon's name. */
export interface AtEntrance { readonly node: NodeInfo; readonly seas: Difficulty; readonly number: number; readonly name: string }
export interface EntranceCard {
  readonly name: string; readonly tier: string; readonly rules: readonly string[];
  readonly modifiers: readonly ModifierShown[]; readonly pays: string; readonly shut: string | null;
  /** The run's base Find a Company matches (`nodeRoom`), or null where it matches none or is shut. */
  readonly finds: string | null;
}
export function entranceCardOf(entrance: AtEntrance, drawn: Activities, gates: Gates | null, record: ActivityRecord | null): EntranceCard;
```

**What each line says**
- **Taken.** A tier is taken today iff `record.day === drawn.day` and its index is in `cleared`. The week's Elite or Abyss is taken iff `record.week === drawn.week` and that flag is set. A state is the gate's reason first, then `'Taken'` or `'Not taken'`, or null with no record.
- **A patrol's card.**
  - Tier: `${SEAS} · ${levelWords(bands[continent][t])}`.
  - It is the dungeon of the day iff `ofTheDay` holds its patrol and number. Then, at Elite or Abyss, it carries the day's modifier.
  - Pays: the day's pay, or "taken today" when taken, or the plain pay when it is not the day's.
  - At Abyss it has the revives rule. Shut is `gates.day[t]`.
- **An Elite node's card.** It follows `eliteRun(id, seas, drawn)`:
  - **The week's two.** Tier `${words} · Level ${level}`, with the week's modifiers and the week's pay.
  - **The Abyss's.** Its rules are the revives line and "Never matched. Bring your company.".
  - **Find a Company.** `finds` is `nodeRoom(node, 'elite')` for the Elite's when not shut.
  - **At Normal.** Tier `Elite Dungeon · ${levelWords(bands[continent][0])}`, the plain pay, shut `gates.eliteDungeon`, and `finds` is `nodeRoom(node, 'normal')` when not shut.

**Steps**
1. Write the failing tests:
```ts
const FRIDAY_NINE = 29_919_420;
const named: Named = { dungeon: (patrol, number) => `${patrol} ${number}`, place: (id) => id };
const record = { day: 20_778, cleared: [1], week: 2_968, elite: true, abyss: false, boon: true };
const burn = { name: 'Burn (Shadow)', words: 'Shadow spells deal double damage. Wearing Shadow, you take double.' };

test('a reset’s time reads in minutes, then hours and minutes, then days and hours from two days', () => {
  assert.deepEqual([1, 59, 60, 1_440, 2_879, 2_880, 5_760, 10_080].map(resetWords), [
    'Resets in 1m', 'Resets in 59m', 'Resets in 1h 0m', 'Resets in 24h 0m',
    'Resets in 47h 59m', 'Resets in 2d 0h', 'Resets in 4d 0h', 'Resets in 7d 0h']);
  assert.deepEqual([levelWords([3, 6]), levelWords([26, 26])], ['Levels 3 to 6', 'Level 26']);
});

test('This Week says what is on today and this week, what each pays, and what this character has taken or may not enter', async () => {
  const drawn = activitiesAt(await module, FRIDAY_NINE);
  const board = thisWeekOf(drawn, gatesAt(await module, 26, true), record, named);
  assert.deepEqual([board.today.resets, board.week.resets], ['Resets in 24h 0m', 'Resets in 4d 0h']);
  assert.equal(board.today.pays, 'Once a day at each tier, on any island: a Vestige and a richer cache.');
  assert.deepEqual(board.today.modifier, burn);
  assert.deepEqual(board.today.tiers.map((row) => [row.name, row.state]),
    [['Normal seas', 'Not taken'], ['Elite seas', 'Taken'], ['Abyss seas', 'Not taken']]);
  assert.deepEqual(board.today.dungeons[0], { name: 'gullwing-vale 0', about: 'Levels 1 to 4', state: null, shut: false });
  assert.deepEqual([board.today.dungeons.length, board.today.dungeons[8]?.about], [9, 'Levels 26 to 30']);
  const [elite, abyss] = board.week.dungeons;
  assert.deepEqual([elite?.name, elite?.about, elite?.state, elite?.modifiers.map((one) => one.name), elite?.pays],
    ['forsaken-cistern', 'Elite Dungeon of the week · Level 26', 'Taken', ['Brawler'], 'Once a week: a Legendary Vestige and Essence.']);
  assert.deepEqual([abyss?.about, abyss?.state, abyss?.shut, abyss?.rules, abyss?.modifiers.map((one) => one.name)], [
    'Abyss Dungeon of the week · Level 30', 'This dungeon opens at level 28.', true,
    ['5 revives for the company. A wipe starts the run over.'], ['Lightswitch', 'Burn (Divine)', 'Juggler']]);
  assert.equal(abyss?.pays, 'Once a week: a Legendary or Atheric Vestige, Essence, and the Abyss boon.');
  assert.equal(board.week.boon, 'Abyss boon: 25% more XP until the week turns.');
});

test('a record of an earlier day or week is not taken now, and a character not yet heard from shows no word', async () => {
  const drawn = activitiesAt(await module, FRIDAY_NINE);
  const stale = thisWeekOf(drawn, gatesAt(await module, 26, true), { ...record, day: 20_777, week: 2_967 }, named);
  assert.deepEqual(stale.today.tiers.map((row) => row.state), ['Not taken', 'Not taken', 'Not taken']);
  assert.deepEqual([stale.week.dungeons[0]?.state, stale.week.boon], ['Not taken', null]);
  const before = thisWeekOf(drawn, gatesAt(await module, 9, false), null, named);
  assert.deepEqual(before.today.tiers.map((row) => row.state), Array(3).fill('This place opens after the prologue.'));
  assert.deepEqual(thisWeekOf(drawn, null, null, named).today.tiers.map((row) => row.state), [null, null, null]);
});

test('an entrance’s card says which run it opens, its tier and level, its modifiers, what it pays and what Find a Company matches', async () => {
  const drawn = activitiesAt(await module, FRIDAY_NINE);
  const gates = gatesAt(await module, 24, true);
  const entranceAt = (id: string, kind: 'patrol' | 'dungeon', continent: string, seas: Difficulty, number = 0) =>
    ({ node: { id, kind, continent, name: id } as NodeInfo, seas, number, name: `the way into ${id}` });
  const today = { ...record, elite: false, boon: false };
  assert.deepEqual(entranceCardOf(entranceAt('gullwing-vale', 'patrol', 'continent-1', 'elite'), drawn, gates, today), {
    name: 'the way into gullwing-vale', tier: 'Elite seas · Levels 3 to 6', rules: [], modifiers: [burn],
    pays: 'Taken today. It pays its kills and its cache.', shut: null, finds: null });
  assert.equal(entranceCardOf(entranceAt('gullwing-vale', 'patrol', 'continent-1', 'elite'), drawn, gates, { ...today, day: 20_777 }).pays,
    'Once a day at each tier, on any island: a Vestige and a richer cache.', 'yesterday’s clear is not today’s');
  const halls = entranceCardOf(entranceAt('gullwing-vale', 'patrol', 'continent-1', 'abyss', 1), drawn, gates, today);
  assert.deepEqual([halls.tier, halls.rules, halls.modifiers, halls.pays], ['Abyss seas · Levels 4 to 7',
    ['5 revives for the company. A wipe starts the run over.'], [], 'It pays its kills and its cache.']);
  const grotto = entranceCardOf(entranceAt('krakens-grotto', 'dungeon', 'continent-1', 'normal'), drawn, gates, today);
  assert.deepEqual([grotto.tier, grotto.pays, grotto.finds], ['Elite Dungeon · Levels 1 to 4', 'It pays its kills and its cache.', 'node-krakens-grotto']);
  const cistern = entranceCardOf(entranceAt('forsaken-cistern', 'dungeon', 'continent-4', 'elite'), drawn, gates, today);
  assert.deepEqual([cistern.tier, cistern.modifiers.map((one) => one.name), cistern.pays, cistern.finds], [
    'Elite Dungeon of the week · Level 26', ['Brawler'], 'Once a week: a Legendary Vestige and Essence.', 'node-forsaken-cistern--elite']);
  const early = entranceCardOf(entranceAt('forsaken-cistern', 'dungeon', 'continent-4', 'elite'), drawn, gatesAt(await module, 23, true), today);
  assert.deepEqual([early.shut, early.finds], ['This dungeon opens at level 24.', null]);
  const warrens = entranceCardOf(entranceAt('saltworm-warrens', 'dungeon', 'continent-7', 'abyss'), drawn, gates, today);
  assert.deepEqual([warrens.tier, warrens.rules, warrens.shut, warrens.finds], ['Abyss Dungeon of the week · Level 30',
    ['5 revives for the company. A wipe starts the run over.', 'Never matched. Bring your company.'], 'This dungeon opens at level 28.', null]);
  assert.equal(entranceCardOf(entranceAt('forsaken-cistern', 'dungeon', 'continent-4', 'abyss'), drawn, gates, today).tier,
    'Elite Dungeon · Levels 10 to 13', 'the Elite’s, reached at Abyss seas: its Normal run');
});
```
2. Run `npm run wasm && node --import ./tools/testStyles.mjs --test client/src/game/activityWords.test.ts`. It should fail: cannot find module `./activityWords.ts`.
3. Implement the signatures and the strings above. The revives line is built from `drawn.revives`.
4. Run `npm test`, then `cargo xtask check`.
5. Commit: "What This Week and an entrance's card say: what is on, its tier and level, what it pays, and what is taken or shut".

**Bible.** None: nothing shows yet. Tasks 4 and 5 describe the screens.

---

## Task 4: This Week, in the Journal

**Files**
- Create `client/src/game/activityScreens.ts` (the glue: the last gear kept, and `week()`), `client/src/game/activityScreens.test.ts` and `client/src/game/activityScreens.css`.
- `client/src/game/menuPages.ts`: `thisWeekPage`. The file's comment becomes "…Journal, This Week now and its quests still to come; Guild, still to come…".
- Create `client/src/game/menuPages.test.ts`.
- `client/src/game/gearWindow.ts`:
  - `TAB_PRESSES.journal` loses `later`.
  - `startGearWindow` gains a last parameter, `week`.
  - `plainPage` gains `const board = shown === 'journal' ? week() : null;`, the key `JSON.stringify([shown, panel, board])`, and `: shown === 'journal' ? thisWeekPage(board)`.
- `client/src/game/game.ts`:
  - One import.
  - `const screens = startActivityScreens(hudRoot, roomModule, world.nodes, () => foot);` right after `const trips = dungeonTrips(...)`.
  - The `startGearWindow(...)` call gains `screens.week` as its last argument.

**Interfaces**
```ts
// activityScreens.ts
/** What the screens read of the player on foot: the room's word on their gear. */
export interface ScreensFoot { readonly gear: { readonly gear: GearState | null } | null }
/** The screens' clock, and how they look again: every quarter second on the page. */
export interface ScreensClock { readonly now: () => number; readonly every: (run: () => void) => void }
export interface ActivityScreens {
  /** This Week as the Journal shows it, built again only when the minute or the gear changes; null before the room
   *  module is read. */
  week(): ThisWeek | null;
}
export function startActivityScreens(root: HTMLElement, module: Promise<WebAssembly.Module>, nodes: readonly NodeInfo[],
  foot: () => ScreensFoot | null, clock?: ScreensClock): ActivityScreens;
// menuPages.ts
/** The Journal: This Week's day and week, then Bounties and Quests, still to come and marked Later. */
export function thisWeekPage(board: ThisWeek | null): HTMLElement;
// gearWindow.ts
export function startGearWindow(root, link, here, ship, travel?, resting?, week: () => ThisWeek | null = () => null): void;
```
- The last gear is kept with `kept = foot()?.gear?.gear ?? kept` at every look.
- `Named` comes from `askDungeon(module, patrol, nodeName(patrol), number).name` (already laid once and kept by `dungeonLayout.ts`) and from `nodes`' names.
- The gates are `gatesAt(module, kept.level, kept.prologueDone ?? true)`, matching Phase 1's rule that a save with no story is past the prologue.
- The page layout is in the kit:
  - A panel whose `h2` is "This Week".
  - Rule headings "Today" and "The week", each with a chip giving its reset time.
  - "Dungeon of the day": its pay line, then "At Elite and Abyss seas" with the modifier's name and words, the three tier rows and the nine dungeon rows.
  - The week's two, each with its rules, modifiers and pay, then the boon line when held.
  - Under rule headings marked Later: "Breaches"; "Bounties", saying "Six a day, from the board in Overlook’s plaza."; and "Quests", saying "Your quests will be kept here.".
  - With no board it shows "Loading…".

**Steps**
1. Write the failing tests.
   - `menuPages.test.ts`:
```ts
test('the Journal is This Week: the day’s and the week’s, each reset’s time, then Bounties and Quests marked Later', async () => {
  const { root } = fakePage();
  const drawn = activitiesAt(await module, 29_919_420);
  const record = { day: 20_778, cleared: [1], week: 2_968, elite: false, abyss: false, boon: false };
  const board = thisWeekOf(drawn, gatesAt(await module, 26, true), record, { dungeon: (patrol) => patrol, place: (id) => id });
  root.append(thisWeekPage(board) as never);
  for (const words of ['This Week', 'Today', 'Resets in 24h 0m', 'The week', 'Resets in 4d 0h', 'Elite seas', 'Taken',
    'Burn (Shadow)', 'Elite Dungeon of the week · Level 26', 'Breaches', 'Bounties', 'Quests', 'Your quests will be kept here.'])
    assert.ok(root.find(words), words);
  root.replaceChildren(thisWeekPage(null) as never);
  assert.ok(root.find('Loading…'));
});
```
   - `activityScreens.test.ts`:
```ts
const nodes = [{ id: 'gullwing-vale', name: 'The Gullwing Vale', kind: 'patrol', continent: 'continent-1' }] as NodeInfo[];
const gearAt = (level: number, activity: ActivityRecord) => ({ level, prologueDone: true, activity }) as GearState;

test('This Week reads the last word a room sent of the character, kept through a voyage, and turns with the minute', async () => {
  let clock = 29_919_420 * 60_000;
  let look = () => undefined as void;
  let here: ScreensFoot | null = { gear: { gear: gearAt(12, { day: 20_778, cleared: [1], week: 2_968, elite: false, abyss: false, boon: false }) } };
  const screens = startActivityScreens(fakePage().root as never, module, nodes, () => here, { now: () => clock, every: (run) => (look = run) });
  assert.equal(screens.week(), null, 'before the room module is read');
  await module;
  look();
  assert.deepEqual(screens.week()?.today.tiers.map((row) => row.state), ['Not taken', 'Taken', 'Abyss seas open at level 20.']);
  assert.match(screens.week()?.today.dungeons[0]?.name ?? '', /Gullwing Vale$/);
  here = null;
  look();
  assert.equal(screens.week()?.today.tiers[1]?.state, 'Taken', 'at sea, as last heard');
  clock += 60_000;
  assert.equal(screens.week()?.today.resets, 'Resets in 23h 59m');
});
```
2. Run `npm run wasm && node --import ./tools/testStyles.mjs --test client/src/game/menuPages.test.ts client/src/game/activityScreens.test.ts`. It should fail: `thisWeekPage` is not exported, and `./activityScreens.ts` is missing.
3. Implement. `week()` keys its memo on the minute and the kept gear's identity, since the menu asks every 100 ms.
4. Run `npm test`, then `cargo xtask check`. Then, in `npm run dev` offline, open the menu's Journal in Overlook and after sailing: the day's and the week's should show, with the time to each reset. That check is offline.
5. Commit: "The Journal is This Week: what is on today and this week, what each pays, what is taken or shut, and when each turns".

**Bible.**
- `Interface.md` "The menu":
  - "Journal and Guild marked Later" becomes "Guild marked Later".
  - A new bullet, **Journal**: This Week, as built, read from the rules and the last word of the character a room sent, so it reads the same at sea; its Bounties and Quests marked Later.
- `Activities.md` "The screen": the This Week bullet as built. Add `client/src/game/activityWords.ts#thisWeekOf` to `code:`.

---

## Task 5: the card at a dungeon's entrance

**Files**
- Create `client/src/game/entranceCard.ts`: `EntranceCardView`.
- `client/src/game/activityScreens.ts`:
  - `ScreensFoot` gains `node`, `seas`, `dungeon` and `fallen`.
  - It gains a `trips` parameter and `card`.
  - Each look closes the card if its foot is gone, has fallen or is in a dungeon, and otherwise builds it again on a new minute.
- `client/src/game/activityScreens.css`: the card's room.
- `client/src/game/activityScreens.test.ts`: appended.
- `client/src/game/game.ts`:
  - `footContext.trips.enter` becomes `(number, name) => screens.card(number, name)`.
  - The screens' call gains `trips`.

**Interfaces**
```ts
// entranceCard.ts
export interface CardPresses { enter(): void; close(): void }
/** The card E opens at a dungeon's entrance, in the kit's window: the dungeon's name under its header; its tier and
 *  level, its rules, its modifiers and what it pays; why it is shut, if it is; and Enter (E) and Close (Esc) on its
 *  footer. While it stands, the pointer is free and the game's keys rest, as under the menu. */
export class EntranceCardView {
  constructor(root: HTMLElement, presses: CardPresses);
  show(card: EntranceCard): void;
  hide(): void;
  get open(): boolean;
}
// activityScreens.ts
export interface ScreensFoot {
  readonly node: NodeInfo; readonly seas: Difficulty; readonly dungeon: object | null; readonly fallen: boolean;
  readonly gear: { readonly gear: GearState | null } | null;
}
export function startActivityScreens(root, module, nodes, foot, trips: { enter(number: number, name: string): void }, clock?): ActivityScreens;
// ActivityScreens gains
/** E at entrance `number`, its dungeon named `name`: its card, or straight in while the room module is unread. */
card(number: number, name: string): void;
```
- Presses carry `data-key` `card-enter` and `card-close`. Enter is disabled while the card is shut.
- Keys are heard in the window's capture phase while the card is open. `e` enters, `Escape` closes, and each is stopped.
- The card calls `setGearScreenOpen(true)` while open and again at each look, in case the menu was shut over it. It calls `document.exitPointerLock()` and plays `open` and `close`.

**Steps**
1. Write the failing tests in `activityScreens.test.ts`:
```ts
const vale = { id: 'gullwing-vale', name: 'The Gullwing Vale', kind: 'patrol', continent: 'continent-1' } as NodeInfo;
const keyed = (root: FakeElement, key: string) => root.all().find((node) => node.dataset['key'] === key);

test('E at an entrance opens its card: its tier, level and modifiers and what it pays; Enter goes in and Escape closes it', async () => {
  const { root, window } = fakePage();
  const entered: unknown[][] = [];
  const here = { node: vale, seas: 'elite', dungeon: null, fallen: false,
    gear: { gear: gearAt(12, { day: 20_778, cleared: [], week: 2_968, elite: false, abyss: false, boon: false }) } } as ScreensFoot;
  const screens = startActivityScreens(root as never, module, [vale], () => here,
    { enter: (...given) => void entered.push(given) }, { now: () => 29_919_420 * 60_000, every: () => undefined });
  await module;
  screens.card(0, 'The Caverns of the Gullwing Vale');
  for (const words of ['The Caverns of the Gullwing Vale', 'Elite seas · Levels 3 to 6', 'Burn (Shadow)',
    'Once a day at each tier, on any island: a Vestige and a richer cache.'])
    assert.ok(root.find(words), words);
  assert.equal(gearScreenOpen(), true, 'the game’s keys rest under it');
  keyed(root, 'card-enter')?.click();
  assert.deepEqual(entered, [[0, 'The Caverns of the Gullwing Vale']]);
  assert.equal(gearScreenOpen(), false);
  screens.card(0, 'The Caverns of the Gullwing Vale');
  window.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
  assert.equal(gearScreenOpen(), false);
  assert.equal(entered.length, 1, 'closed, not entered');
});

test('the card goes when its player falls or leaves the place, and gives the keys back', async () => {
  // A foot whose `fallen` turns true, then a foot() of null: each look closes an open card and sets gearScreenOpen false.
});
```
2. Run `npm run wasm && node --import ./tools/testStyles.mjs --test client/src/game/activityScreens.test.ts`. It should fail with a TypeError: `screens.card` is not a function.
3. Implement. The card's body is `entranceCardOf(...)` with the kept gear's gates and record.
4. Run `npm test` and `cargo xtask check`. Then in `npm run dev` offline:
   - At a patrol at Elite, press E at a door. The card should show "Elite seas · Levels …" and Enter should go in.
   - At Kraken's Grotto it should read "Elite Dungeon · Levels 1 to 4".
   - That check is offline.
5. Commit: "E at a dungeon's entrance opens its card: the run's tier, level and modifiers, what it pays and whether it is taken, with Enter".

**Bible.**
- `Interface.md`: a new section "## At a dungeon's entrance", describing the card as built.
- `Game.md` "A dungeon", the "Going in" bullet: E opens the card, and its Enter goes in as before.
- `Activities.md` "The screen": the card bullet as built. Add `client/src/game/activityWords.ts#entranceCardOf` to `code:`.

---

## Task 6: the voyage card shuts a tier the player's level shuts

**Files**
- `client/src/heldmap/heldMapLaw.ts`: `seasChoices`. `client/src/heldmap/heldMapLaw.test.ts`: appended.
- `client/src/heldmap/heldMap.ts`:
  - `open(...)` gains `shut` and sets `this.picked = seasChoices(this.picked, shut).picked`.
  - `layoutCard` disables a shut tier's press and titles it with its reason, writes `why` in a line under the row, and adds a "Seas" label before the presses. The card's shape key includes `shut`.
- `client/src/game/helmMap.ts`: `HelmMapContext.shut`, and `frame` passes `this.context.shut()` to `open`.
- `client/src/game/activityScreens.ts`: `seasShut`. `activityScreens.test.ts`: appended.
- `client/src/game/game.ts`: `new HelmMap({ gpu, outlines, store, root: hudRoot, sea: () => sea, shut: () => screens.seasShut() })`. The same line keeps under 120 characters.

**Interfaces**
```ts
/** The voyage card's difficulty as the gates leave it: the hardest one open at or below the one picked, and the first
 *  reason a tier is shut, for the card's line (null when none is). With no word of the character, none is shut. */
export function seasChoices(picked: Difficulty, shut: readonly (string | null)[]): { readonly picked: Difficulty; readonly why: string | null };
// HeldMap
open(viewport, ship: Point2, gauntlets: string | null, charted: Uint8Array, shut: readonly (string | null)[]): void;
// HelmMapContext
readonly shut: () => readonly (string | null)[];
// ActivityScreens
/** Why each tier's seas are shut to the player by their level, by tier (null where open); none before a room's word. */
seasShut(): readonly (string | null)[];
```

**Steps**
1. Write the failing tests.
   - `heldMapLaw.test.ts`:
```ts
test('the voyage card shuts a difficulty the player’s level shuts, says why, and never keeps it picked', () => {
  const young = [null, 'Elite seas open at level 10.', 'Abyss seas open at level 20.'];
  assert.deepEqual(seasChoices('abyss', young), { picked: 'normal', why: 'Elite seas open at level 10.' });
  assert.deepEqual(seasChoices('abyss', [null, null, 'Abyss seas open at level 20.']), { picked: 'elite', why: 'Abyss seas open at level 20.' });
  assert.deepEqual(seasChoices('abyss', [null, null, null]), { picked: 'abyss', why: null });
  assert.deepEqual(seasChoices('elite', []), { picked: 'elite', why: null }, 'no word of the character: nothing shut');
});
```
   - `activityScreens.test.ts`: kept gear at level 9 gives `screens.seasShut()` deepEqual `[null, 'Elite seas open at level 10.', 'Abyss seas open at level 20.']`; with no gear yet it gives `[]`.
2. Run `node --import ./tools/testStyles.mjs --test client/src/heldmap/heldMapLaw.test.ts client/src/game/activityScreens.test.ts`. It should fail: `seasChoices` is not exported, and `screens.seasShut` is not a function.
3. Implement.
4. Run `npm test`, `npm run types` and `cargo xtask check`. Then, offline at level 1 in `npm run dev`: the held map's card should show Elite and Abyss greyed and "Elite seas open at level 10." under them, and Set sail should go at Normal. That check is offline.
5. Commit: "The voyage card shuts a difficulty the player's level shuts, saying why".

**Bible.**
- `Held Map.md` "The difficulty": shut tiers, the reason line, the "Seas" label, and the pick that falls to the hardest open tier.
- `Activities.md`:
  - "What opens when", last sentence: "The screens show what is shut and why: This Week, an entrance's card and the voyage's card."
  - Line 13: "Its core, its dungeons and its screens are built (steps 1 to 3); companies of four, Find a Company and the quests are not."

---

# Phase 4: companies of four and Find a Company

## Task 7: a company holds four, and so does a run

**Files**
- Company size:
  - `server/accounts/companies.ts`: `COMPANY_MOST = 4`; the module doc and the constant's doc say four.
  - `client/src/game/rosterRows.ts`: `COMPANY_MOST = 4`.
- A run's size:
  - `server/roomNames.ts`: `RUN_MOST` and `runFull`. `server/roomNames.test.ts`: appended.
  - `server/worker.ts` `fetch`: after `server.send(this.room.joined(player));` comes `const full = runFull(this.name, this.open().length); if (full) this.dismiss(server, SHUT, full);`.
- Tests:
  - `server/accounts/roster.test.ts`: the company test becomes four.
  - `client/src/game/rosterRows.test.ts`: `full` has four members.

**Interfaces**
```ts
/** The most players a company holds: four, as an Elite Dungeon's run is for. */
export const COMPANY_MOST = 4;                    // companies.ts and rosterRows.ts
/** The most a run holds: a company's most (`accounts/companies.ts`). */
export const RUN_MOST = 4;                        // roomNames.ts
/** Why a run sends away a player who would make it more than RUN_MOST, counting them; null for a run with room, or
 *  a room that is no run. */
export function runFull(room: string, players: number): string | null;   // "This run is full."
```
- A fifth player is welcomed and then sent away with 4003, so the page takes Phase 1's shut path back to the ship with the reason. A close before the welcome would read to the page as a failed join.

**Steps**
1. Write the failing tests.
   - `roster.test.ts`: rename the test to `a company holds four, joined by invite or as its leader allows, and its lead passes on`.
     - `world` adds `'Eve'`.
     - After Cal joins: `assert.equal((await dee.ask('company/join', { name: 'Ada' })).status, 200, 'the fourth comes in');`
     - Then `assert.equal((await eve.ask('company/join', { name: 'Ada' })).status, 409, 'four at most');`
     - Then `await dee.ask('company/leave');`, so the rest reads as before.
   - `rosterRows.test.ts`:
     - `full` holds Ada, Ben, Cal and Dee, and `!labels(full, 'Eve').includes('Invite to company')`.
     - Add `assert.ok(labels(roster({ company: { leader: 'Ada', members: [person('Ada'), person('Ben'), person('Cal')] } }), 'Dee').includes('Invite to company'), 'three of four invite one more');`.
   - `roomNames.test.ts`:
```ts
test('a run holds four, a company’s most, and only a run is ever full this way', () => {
  assert.equal(RUN_MOST, COMPANY_MOST);
  assert.equal(runFull('node-krakens-grotto--run-k3j4h5g6', 4), null);
  assert.equal(runFull('node-krakens-grotto--run-k3j4h5g6', 5), 'This run is full.');
  assert.equal(runFull('node-saltgrass-downs', 65), null, 'no run');
});
```
2. Run `node --import ./tools/testStyles.mjs --test server/accounts/roster.test.ts client/src/game/rosterRows.test.ts server/roomNames.test.ts`. It should fail: the fourth gets 409, a company of three is offered no invite, and `runFull` is not exported.
3. Implement.
4. Run `npm test`, then `cargo xtask check`.
5. Commit: "A company holds four, as an Elite Dungeon's run is for, and a run holds four".

**Bible.**
- `Accounts.md` "The Roster", the company bullet: "four at most, as an Elite Dungeon's run is for, one its leader…" (drop "sized as Destiny's fireteam").
- `Activities.md` "Runs and companies": "A company holds up to four." Remove "Companies hold three now.". Add that a run holds four too.
- `Server.md` "The host": a fifth player in a run is welcomed and sent away with 4003, "This run is full.".

---

## Task 8: a run found for strangers lets them in together, for that run alone

**Files**
- Create `server/accounts/migrations/<UTC now>_found_runs.sql`, timestamped after `20261118181357`.
- Create `server/accounts/finding.ts`: `FOUND_KEPT_MS` and `foundRun`. Task 9 extends it.
- `server/accounts/companies.ts`: `companionsOf(database, account, room)`.
- `server/accounts/characters.ts`: `Characters.companions(account, room)`.
- `server/accounts/worker.ts`: `CharacterKeeper.companions(account, room)`.
- `server/keeping.ts` `signIn`: `characters.companions(claimed.account, this.name)`.
- Tests: `server/keeping.test.ts` is appended. `server/accounts/roster.test.ts`: Phase 2's companions test gains a room, and a test is appended.

**Interfaces**
```sql
-- The players a run was found for by Find a Company, so its room lets them in together for that run alone; the
-- company each keeps stays as it is. Kept a day, far past any run.
CREATE TABLE found_runs (
  room TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  found_at INTEGER NOT NULL,
  PRIMARY KEY (room, account_id)
);
CREATE INDEX found_runs_by_time ON found_runs (found_at);
```
```ts
// finding.ts
/** How long the accounts keep whom a run was found for: a day, far past any run. */
export const FOUND_KEPT_MS = 24 * 60 * 60_000;
/** Keeps that `run` was found for `accounts`, so its room lets them in together, forgetting runs found more than
 *  FOUND_KEPT_MS ago; false if it could not be kept. */
export async function foundRun(database: Db, run: string, accounts: readonly string[], now: number): Promise<boolean>;
// companies.ts
/** Those a player may share `room` with: their company's members, longest there first (or the player alone), then
 *  those `room` was found for with them. */
export async function companionsOf(database: Db, account: string, room: string): Promise<string[]>;
// Characters and CharacterKeeper
companions(account: string, room: string): Promise<string[]>;
```

**Steps**
1. Write the failing tests.
   - `keeping.test.ts` (Review focus 4):
```ts
test('a run found for strangers lets in each one found for it, and none of them into another run', async () => {
  const made = accounts();
  const tokens: Record<string, string> = {};
  for (const name of ['Ada', 'Ben', 'Cal']) {
    tokens[name] = (await made.ask('POST', '/v1/guest')).body['token'] as string;
    await made.ask('POST', '/v1/register', { username: name, password: 'long enough' }, tokens[name]);
  }
  const kept = characters(made.deps.database, () => made.clock.now, () => Promise.resolve());
  const idOf = async (name: string) => {
    const claimed = await kept.claim(tokens[name] ?? '', `probe:${name}`);
    await kept.release(claimed?.account ?? '', `probe:${name}`, null);
    return claimed?.account ?? '';
  };
  const [ada, ben] = [await idOf('Ada'), await idOf('Ben')];
  assert.equal(await foundRun(made.deps.database, 'node-krakens-grotto--run-k3j4h5g6', [ada, ben], made.clock.now), true);
  const sent: [number, string | undefined][] = [];
  const [now, here] = [() => made.clock.now, () => true];
  const room = roomOf();
  for (const player of [1, 2, 3]) room.held.set(player, '{"starting":true}');
  const run = new Keeper(kept, room, 'node-krakens-grotto--run-k3j4h5g6', (player, why) => sent.push([player, why])).forCompany();
  assert.equal(await run.signIn(1, tokens['Ada'] ?? '', now, here), true);
  assert.equal(await run.signIn(2, tokens['Ben'] ?? '', now, here), true, 'found with Ada');
  assert.equal(await run.signIn(3, tokens['Cal'] ?? '', now, here), false);
  await run.leave(2);
  const elsewhere = roomOf();
  for (const player of [4, 5]) elsewhere.held.set(player, '{"starting":true}');
  const other = new Keeper(kept, elsewhere, 'node-krakens-grotto--run-a1b2c3d4', (player, why) => sent.push([player, why])).forCompany();
  assert.equal(await other.signIn(4, tokens['Cal'] ?? '', now, here), true, 'none kept: whoever has the name');
  assert.equal(await other.signIn(5, tokens['Ben'] ?? '', now, here), false, 'found with Ada for another run');
  assert.deepEqual(sent, [[3, "This run is another company's."], [5, "This run is another company's."]]);
});
```
   - `roster.test.ts`:
```ts
test('a player’s companions in a run are their company, and those it was found for with them in that run alone', async () => {
  const { player, kept, tokens, deps } = await world('Ada', 'Ben', 'Cal', 'Dee');
  await player('Ada').ask('company/invite', { name: 'Ben' });
  await player('Ben').ask('company/accept', { name: 'Ada' });
  const account = async (name: string) => (await kept.claim(tokens[name] ?? '', `room:${name}`))?.account ?? '';
  const [ada, ben, cal, dee] = [await account('Ada'), await account('Ben'), await account('Cal'), await account('Dee')];
  await foundRun(deps.database, 'node-krakens-grotto--run-k3j4h5g6', [cal, dee], 0);
  assert.deepEqual(await kept.companions(ben, 'node-x--run-a1b2c3d4'), [ada, ben]);
  assert.deepEqual((await kept.companions(cal, 'node-krakens-grotto--run-k3j4h5g6')).sort(), [cal, dee].sort());
  assert.deepEqual(await kept.companions(cal, 'node-krakens-grotto--run-a1b2c3d4'), [cal], 'for one run alone');
  assert.deepEqual(await kept.companions(ada, 'node-krakens-grotto--run-k3j4h5g6'), [ada, ben], 'not found for it');
});
```
     Phase 2's `a player’s companions are their company’s members…` calls `kept.companions(ben, 'node-x--run-a1b2c3d4')`.
2. Run `node --import ./tools/testStyles.mjs --test server/keeping.test.ts server/accounts/roster.test.ts`. It should fail: `./finding.ts` is missing.
3. Implement.
   - `foundRun` deletes rows older than `FOUND_KEPT_MS`, then inserts one row an account (`INSERT OR REPLACE`), inside a try that answers false on error.
   - `companionsOf` joins `found_runs` with itself on the room where the player has a row, and adds those accounts after the company, each once.
4. Run `npm test`, then `cargo xtask check`.
5. Commit: "A run found for strangers lets them in together for that run alone, and no one's company changes".

**Bible.**
- `Accounts.md` "The character, kept": a run lets in the company of anyone kept there, or those it was found for with them (`companions(account, room)`, `found_runs`, kept a day).
- `Server.md` "The host": the same, in a line.

---

## Task 9: Find a Company's queue, and its Durable Object

**Files**
- `server/accounts/finding.ts`: `FIND_WAIT_MS`, `BAND_LEVELS`, `bandOf`, `findingAt`, `runInstance`, `Seeker`, `Queue`, `seekerOf`, `FinderSocket`, `FinderDeps` and `Finder`.
- `server/accounts/characters.ts`: `live` becomes the exported `liveAccount`, which `characters()` calls. Its behaviour is unchanged.
- Create `server/accounts/finding.test.ts`.
- Create `server/accounts/finder.ts`: `CompanyFinder`, the Durable Object, which only carries sockets to `Finder`.
- `server/accounts/worker.ts`:
  - `export { CompanyFinder } from './finder.ts';`
  - `Env` gains `FINDERS: DurableObjectNamespace<CompanyFinder>`.
  - The default `fetch` first does `const finding = findingAt(request); if (finding !== null) return env.FINDERS.getByName(finding).fetch(request);`.
- `server/accounts/wrangler.jsonc`:
```jsonc
  // Find a Company (finder.ts): one Durable Object for each dungeon a run is found for, reached by WebSocket.
  "durable_objects": { "bindings": [{ "name": "FINDERS", "class_name": "CompanyFinder" }] },
  "migrations": [{ "tag": "finders", "new_sqlite_classes": ["CompanyFinder"] }],
```

**Interfaces**
```ts
/** How long the first seeker of a band waits before a run starts with fewer than four: the design's minute. */
export const FIND_WAIT_MS = 60_000;
/** The levels a band spans: those within one ten are matched together. */
export const BAND_LEVELS = 10;
/** The band a level is matched in: 1 to 10 the first, 11 to 20 the second, 21 to 30 the third. */
export function bandOf(level: number): number;
/** The run's base a Find a Company request is for, `/v1/find/<base>` by WebSocket: an Elite Dungeon at Normal
 *  (`node-<id>`) or the week's at Elite (`node-<id>--elite`), short enough that its run's name fits 64; never the
 *  Abyss Dungeon of the week, a patrol's dungeon or a run. Null for any other request. */
export function findingAt(request: Request): string | null;
/** A run's instance: eight of a-z0-9, each a random byte mod 36. */
export function runInstance(random?: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array): string;
export interface Seeker { readonly socket: number; readonly account: string; readonly band: number; readonly since: number; readonly apart: readonly string[] }
/** Those waiting for runs of one dungeon. */
export class Queue {
  /** Puts a seeker in: the socket of the same account's earlier search, which this one replaces, or null. */
  join(seeker: Seeker): number | null;
  leave(socket: number): void;
  /** The runs to start at `now`, taken out of the queue, in the order their first joined. Within a band, oldest first,
   *  each with the oldest still free who block none of those taken: four as soon as there are four, or as many as
   *  there are once its first has waited FIND_WAIT_MS. */
  due(now: number): Seeker[][];
  get size(): number;
}
/** A session's account, the level its room last kept (1 for none yet), and whom it blocks or is blocked by, by id;
 *  null for a token that is no live session. */
export async function seekerOf(database: Db, token: string, now: number): Promise<{ account: string; level: number; apart: string[] } | null>;
export interface FinderSocket { send(text: string): void; close(code: number, reason: string): void }
export interface FinderDeps {
  seeker(token: string): Promise<{ account: string; level: number; apart: readonly string[] } | null>;
  found(run: string, accounts: readonly string[]): Promise<boolean>;
  readonly now: () => number;
  readonly instance: () => string;
}
/** One dungeon's Find a Company: each socket's first message is its session's token; each run found is told to its
 *  seekers as {"run":"<base>--run-<instance>"} and their sockets closed. */
export class Finder {
  constructor(base: string, deps: FinderDeps);
  opened(socket: FinderSocket): number;
  heard(socket: number, message: string | ArrayBuffer): Promise<void>;
  closed(socket: number): void;
  tick(): Promise<void>;
  get waiting(): number;
  get open(): number;
}
// characters.ts
export async function liveAccount(database: Db, token: string, now: number): Promise<string | null>;
// finder.ts
/** The most sockets one finder holds: a guard, as the rooms' is. And how often it starts the runs due. */
const FINDING_MOST = 64;
const FIND_TICK_MS = 1_000;
export class CompanyFinder extends DurableObject<{ readonly DB: D1Database }> { override fetch(request: Request): Response }
```
- `findingAt` needs `Upgrade: websocket`. Its base matches `/^node-[a-z0-9]+(?:-[a-z0-9]+)*(?:--elite)?$/` and is at most 50 characters, so `--run-<8>` fits 64.
- Closes:
  - The first message not a token: `1008 'not a token'`. A second message: `1008`.
  - No session: `4003 'Sign in to find a company.'`.
  - A search replaced: `4003 'You are finding a company in another tab.'`.
  - Found: `1000 'found'`.
  - `found` false: `1011 'the run could not be kept'`.
- `CompanyFinder` answers 503 past `FINDING_MOST`. It accepts the socket, passes `message`, `close` and `error` to the `Finder`, and runs `tick` every `FIND_TICK_MS` while any socket is open.

**Steps**
1. Write the failing tests in `finding.test.ts`. Use `accounts()`, `characters()` and a world helper as `roster.test.ts`'s `world` does. Each seeker's level is saved as `{ shown: { level } }`. A `FakeSocket` records `sent` and `closed`.
```ts
const seeker = (socket: number, account: string, since: number, band = 0, apart: string[] = []): Seeker => ({ socket, account, band, since, apart });
const sockets = (group: readonly Seeker[]) => group.map((one) => one.socket);

test('a run starts with four of a band as soon as four wait, oldest first, and with fewer once the first has waited a minute', () => {
  const queue = new Queue();
  for (const one of [seeker(1, 'ada', 0), seeker(2, 'ben', 10_000), seeker(3, 'cal', 20_000, 1), seeker(4, 'dee', 30_000)]) queue.join(one);
  assert.deepEqual(queue.due(50_000).map(sockets), [], 'three of band 0 and one of band 1');
  queue.join(seeker(5, 'eve', 40_000));
  queue.join(seeker(6, 'fay', 45_000));
  assert.deepEqual(queue.due(50_000).map(sockets), [[1, 2, 4, 5]]);
  assert.deepEqual(queue.due(79_999).map(sockets), [], 'cal has waited a minute less a millisecond');
  assert.deepEqual(queue.due(80_000).map(sockets), [[3]], 'cal alone; fay is of another band');
  assert.deepEqual(queue.due(105_000).map(sockets), [[6]]);
  assert.equal(queue.size, 0);
});

test('two who block each other are never in one run, whichever blocked whom', () => {
  const queue = new Queue();
  for (const one of [seeker(1, 'ada', 0, 0, ['ben']), seeker(2, 'ben', 1_000), seeker(3, 'cal', 2_000, 0, ['eve']),
    seeker(4, 'dee', 3_000), seeker(5, 'eve', 4_000), seeker(6, 'fay', 5_000)]) queue.join(one);
  assert.deepEqual(queue.due(6_000).map(sockets), [[1, 3, 4, 6]], 'ada without ben, cal without eve');
  assert.deepEqual(queue.due(61_000).map(sockets), [[2, 5]]);
});

test('one account waits once: a second search replaces its first, and a search left is in no run', () => {
  const queue = new Queue();
  assert.equal(queue.join(seeker(1, 'ada', 0)), null);
  assert.equal(queue.join(seeker(2, 'ada', 5_000)), 1, 'its first socket, to let go');
  queue.join(seeker(3, 'ben', 6_000));
  queue.leave(3);
  queue.leave(9);
  assert.equal(queue.size, 1);
  assert.deepEqual(queue.due(64_999).map(sockets), []);
  assert.deepEqual(queue.due(65_000).map(sockets), [[2]], 'ada once, waiting from her second search');
});

test('bands are tens of levels, and an instance is eight of a-z0-9', () => {
  assert.deepEqual([1, 10, 11, 20, 21, 24, 30].map(bandOf), [0, 0, 1, 1, 2, 2, 2]);
  assert.equal(runInstance((bytes) => bytes.fill(0)), 'aaaaaaaa');
  assert.equal(runInstance((bytes) => bytes.fill(35)), '99999999');
});

test('Find a Company is reached by WebSocket for an Elite Dungeon or the week’s at Elite, never the Abyss’s', () => {
  const asked = (path: string, upgrade = 'websocket') => findingAt(new Request(`https://accounts.test${path}`, { headers: { Upgrade: upgrade } }));
  assert.equal(asked('/v1/find/node-krakens-grotto'), 'node-krakens-grotto');
  assert.equal(asked('/v1/find/node-forsaken-cistern--elite'), 'node-forsaken-cistern--elite');
  for (const path of ['/v1/find/node-saltworm-warrens--abyss', '/v1/find/node-saltgrass-downs--dungeon-1',
    '/v1/find/node-krakens-grotto--run-k3j4h5g6', '/v1/find/node-krakens-grotto--normal', '/v1/find/sea',
    `/v1/find/node-${'a'.repeat(46)}`, '/v1/find/node-krakens-grotto/'])
    assert.equal(asked(path), null, path);
  assert.equal(asked('/v1/find/node-krakens-grotto', ''), null, 'only by WebSocket');
});

test('a run found for each Elite Dungeon, and for each at Elite, is named as its room reads a run', async () => {
  // The 18 ids are read from content/world/land/continent-1..9.json, nodes of kind "dungeon".
  for (const id of ids) for (const [base, tier] of [[`node-${id}`, 0], [`node-${id}--elite`, 1]] as const) {
    const run = `${base}--run-k3j4h5g6`;
    assert.ok(run.length <= 64 && asked(`/v1/find/${base}`) === base, run);
    assert.deepEqual(JSON.parse(runAsk(run, 29_919_420) ?? 'null'), { dungeon: { place: id }, tier, minute: 29_919_420 });
  }
});

test('a seeker is their session’s account, the level their room last kept, and whom they block or are blocked by', async () => {
  // Ada kept at level 24; Ada blocks Ben; Cal blocks Ada.
  assert.deepEqual(await seekerOf(database, tokens.Ada, now), { account: ids.Ada, level: 24, apart: [ids.Ben, ids.Cal].sort() });
  assert.equal((await seekerOf(database, tokens.Dee, now))?.level, 1, 'no character kept yet');
  assert.equal(await seekerOf(database, '0'.repeat(64), now), null);
});

test('four seekers of a band are sent into one run, which their room lets them into together', async () => {
  // Ada, Ben, Cal, Dee at level 5; Finder('node-krakens-grotto', { seeker: seekerOf on the database, found: foundRun,
  // now, instance: () => 'k3j4h5g6' }); each socket opened and its token heard; then one tick.
  for (const socket of all) {
    assert.deepEqual(socket.sent, ['{"run":"node-krakens-grotto--run-k3j4h5g6"}']);
    assert.deepEqual(socket.closed, [1000, 'found']);
  }
  assert.deepEqual((await companionsOf(database, ids.Ben, 'node-krakens-grotto--run-k3j4h5g6')).sort(), Object.values(ids).sort());
  assert.equal(finder.waiting, 0);
});

test('a socket that sends no session, or anything but its token, is let go, and a second search of one account ends its first', async () => {
  // '0'.repeat(64) gives closed [4003, 'Sign in to find a company.']; 'hello' gives [1008, 'not a token'];
  // Ada twice gives her first socket [4003, 'You are finding a company in another tab.'] and waiting 1.
});

test('a seeker gone before their run is found is told nothing, and the rest still go in', async () => {
  // Ada, Ben, Cal, Dee heard; Dee's socket closed (finder.closed); tick at once: nothing sent;
  // clock + 60_000, tick: Ada, Ben, Cal each sent the run; Dee's socket sent nothing.
});
```
2. Run `node --import ./tools/testStyles.mjs --test server/accounts/finding.test.ts`. It should fail: no export named `Queue`.
3. Implement.
   - `Queue.due` is the greedy rule in its doc.
   - `seekerOf` reads `json_extract(body, '$.shown.level')` and the blocks either way, `ORDER BY` id.
   - `Finder.tick` takes `queue.due(now())` and names each run `${base}--run-${instance()}`. It awaits `deps.found`, then tells or closes each socket still held.
4. Run `npm test`, `npm run types` and `npm run server:bundle`, which bundles the accounts with the object. Then run `cargo xtask check`. The object itself has no unit test: it only carries sockets to `Finder`, and Task 10's offline check covers it.
5. Commit: "Find a Company: one queue a dungeon in the accounts, by level band, four at once or fewer after a minute, never with one blocked".

**Bible.**
- `Accounts.md`: a new "## Find a Company" section:
  - The object, its address and token, and the bands from `shown.level`.
  - Oldest first, four, or fewer after a minute; blocks keep seekers apart; one search an account.
  - The Abyss Dungeon of the week is never matched.
  - The run's name, and `found_runs`.
  - Closing the socket leaves the queue.
  - "Running it here": `npm run accounts` runs it too.
- `Code Map.md`, the `server/accounts/` row: "…the characters the rooms hold, Find a Company's queues, and the database's migrations".
- `Activities.md`: add `server/accounts/finding.ts#Queue` to `code:`.

---

## Task 10: the page finds a company

**Files**
- `client/src/network/accounts.ts`: `AccountLink.finderAt`. `server/accounts/link.test.ts`: appended.
- Create `client/src/game/companyFinder.ts` and `client/src/game/companyFinder.test.ts`.
- `client/src/game/dungeonTrips.ts`: `enter(number, name, run?)`. `dungeonTrips.test.ts`: appended.
- `client/src/game/entranceCard.ts`: `CardPresses` gains `find` and `stop`; `show` gains the search's state.
- `client/src/game/activityScreens.ts`:
  - A `link` parameter, and `ScreensClock.open`.
  - Find and stop. A match enters the run.
  - Each look ends a search whose card no longer `finds` its base.
- `client/src/game/activityScreens.test.ts`: appended.
- `client/src/game/game.ts`: the screens' call gains `link`.

**Interfaces**
```ts
// AccountLink
/** Where Find a Company is for a run's base, by WebSocket, at these accounts. */
finderAt(base: string): string;   // `${base without trailing /, http -> ws}/v1/find/${base}`
// companyFinder.ts
export type FinderSocket = Pick<WebSocket, 'send' | 'close' | 'addEventListener'>;
export interface Finding { readonly base: string; readonly since: number; stop(): void }
/** The words a search that ended unasked says. */
export const SEARCH_LOST = 'The search stopped. Try again.';
/** Searches for a company for a run of `base`: sends the session's token once open, hears the run found (one of
 *  `base`'s, once), and says why it ended, unless the page stopped it. */
export function findCompany(address: string, base: string, token: string,
  heard: { found(run: string): void; ended(why: string): void },
  now?: () => number, open?: (address: string) => FinderSocket): Finding;
/** The wait as the card shows it: "Finding a company · 0:23". */
export function findingWords(since: number, now: number): string;
// dungeonTrips
enter(number: number, name: string, run?: string): void;   // a run given is taken only when it is one of this entrance's base
// EntranceCardView
show(card: EntranceCard, search: { readonly canFind: boolean; readonly finding: string | null; readonly said: string | null }): void;
// CardPresses gains find(): void; stop(): void;   data-keys card-find, card-stop
// activityScreens
export function startActivityScreens(root, module, nodes, foot,
  trips: { enter(number: number, name: string, run?: string): void },
  link: Pick<AccountLink, 'token' | 'finderAt'> | null, clock?: ScreensClock): ActivityScreens;
// ScreensClock gains readonly open?: (address: string) => FinderSocket
```
- The card offers Find a Company (F) when `card.finds` is set and `link?.token` is a token.
- While searching it shows `findingWords`, the line "A run starts with four, or with fewer after a minute.", and Stop finding (F).
- Enter (E) stops the search and goes in. Escape and Close stop it and close the card.
- A run found closes the card and calls `trips.enter(number, name, run)`.
- A search that ended shows its words in the card.

**Steps**
1. Write the failing tests.
   - `link.test.ts`:
     - `assert.equal(browser().link.finderAt('node-krakens-grotto'), 'wss://accounts.test/v1/find/node-krakens-grotto');`
     - `new AccountLink('http://127.0.0.1:8788', storage).finderAt('node-x--elite')` should be `'ws://127.0.0.1:8788/v1/find/node-x--elite'`.
   - `companyFinder.test.ts`:
```ts
test('a search sends its token once open, hears its own run found once, and says why it ended', () => {
  const socket = new FakeSocket();
  const heard: string[] = [];
  const told = { found: (run: string) => heard.push(`found ${run}`), ended: (why: string) => heard.push(`ended ${why}`) };
  const search = findCompany('ws://finder.test/v1/find/node-krakens-grotto', 'node-krakens-grotto', 'a'.repeat(64), told, () => 5_000, () => socket);
  assert.equal(search.since, 5_000);
  socket.fire('open');
  assert.deepEqual(socket.sent, ['a'.repeat(64)]);
  socket.fire('message', { data: '{"run":"node-pearl-tomb--run-k3j4h5g6"}' });
  socket.fire('message', { data: '{"run":"node-krakens-grotto--run-k3j4h5g6"}' });
  socket.fire('close', { code: 1000, reason: 'found' });
  assert.deepEqual(heard, ['found node-krakens-grotto--run-k3j4h5g6']);
  // A second socket closed 4003 'You are finding a company in another tab.' -> ended with those words;
  // a third closed 1006 '' -> ended 'The search stopped. Try again.'; a fourth stopped -> closed 1000, nothing heard.
});
test('the wait reads in minutes and seconds', () => {
  assert.deepEqual([[0, 0], [0, 23_400], [0, 61_000]].map(([since, now]) => findingWords(since ?? 0, now ?? 0)),
    ['Finding a company · 0:00', 'Finding a company · 0:23', 'Finding a company · 1:01']);
});
```
   - `dungeonTrips.test.ts`:
```ts
test('a run Find a Company found is entered by its own name, and one of another dungeon is not', async () => {
  const grotto = recorded({ foot: standing(elite('krakens-grotto', 'Kraken’s Grotto'), 'normal') });
  grotto.trips.enter(0, 'Kraken’s Grotto', 'node-krakens-grotto--run-m9n8b7v6');
  await grotto.settled();
  assert.equal(grotto.ways[0]?.[2], 'node-krakens-grotto--run-m9n8b7v6');
  const wrong = recorded({ foot: standing(elite('krakens-grotto', 'Kraken’s Grotto'), 'normal') });
  wrong.trips.enter(0, 'Kraken’s Grotto', 'node-pearl-tomb--run-m9n8b7v6');
  await wrong.settled();
  assert.deepEqual(wrong.happenings, [], 'not this entrance’s run');
});
```
   - `activityScreens.test.ts`, with a `link` stub `{ token: 'a'.repeat(64), finderAt: (base) => `ws://finder.test/v1/find/${base}` }` and `open` recording `FakeSocket`s:
     - `Find a Company at an Elite Dungeon searches by its run, shows the wait, and goes in by the run found`:
       - At the Grotto, Normal, at `FRIDAY_NINE`, pressing `card-find` opens `ws://finder.test/v1/find/node-krakens-grotto`, which is sent the token.
       - After `clock += 23_400` and a look, the card shows 'Finding a company · 0:23' and `card-stop`.
       - The message `{"run":"node-krakens-grotto--run-m9n8b7v6"}` calls `entered` with `[0, 'Kraken’s Grotto', 'node-krakens-grotto--run-m9n8b7v6']` and `gearScreenOpen()` goes false.
     - `Stop and Escape leave the search; the Abyss Dungeon of the week, a patrol’s dungeon and a page offline offer none`:
       - `card-stop` closes its socket with 1000 and `card-find` is back. Escape closes the next socket and the card.
       - At Saltworm Warrens at Abyss and level 30 there is no `card-find`, and 'Never matched. Bring your company.' shows.
       - At the Gullwing Vale there is none, nor with `link` null.
     - Review focus 1, `a search for the Elite Dungeon of the week ends as the week turns, and the card offers its Normal run`:
       - At `29_925_179`, at Forsaken Cistern seas `'elite'` and level 26, press `card-find`. The socket's address ends with `/node-forsaken-cistern--elite`.
       - Move the clock one minute on and look. The socket is closed with 1000.
       - The card shows 'Elite Dungeon · Levels 10 to 13', and `card-find` is offered again.
2. Run `node --import ./tools/testStyles.mjs --test server/accounts/link.test.ts client/src/game/companyFinder.test.ts client/src/game/dungeonTrips.test.ts client/src/game/activityScreens.test.ts`. It should fail: `finderAt` is not a function, `./companyFinder.ts` is missing, and the found run is not entered.
3. Implement. In `dungeonTrips.enter`, a run given skips `companyPlaces` and is used only when it starts with `${base}--run-` and passes Phase 2's `RUN_ENDING` shape.
4. Run `npm test` and `cargo xtask check`. Then run `npm run accounts` and `npm run server`, and open two pages as two guests (one in a private window) at `?at=krakens-grotto&room=ws://127.0.0.1:8787&accounts=http://127.0.0.1:8788`.
   - Each presses E at the cave mouth and then Find a Company.
   - After a minute both should be in one `node-krakens-grotto--run-…`, and each Roster should show the other in "Krakens Grotto · Elite Dungeon".
   - A third guest searching afterwards should go in alone a minute later.
   - That check is offline.
5. Commit: "Find a Company at an Elite Dungeon's entrance: the page waits, shows it, can stop, and goes into the run found".

**Bible.**
- `Interface.md` "At a dungeon's entrance": Find a Company, the wait, Stop, and the words of a search that ended.
- `Game.md` "A dungeon": Find a Company, and going into the run found by its name.
- `Accounts.md` "Find a Company": the page's side (`finderAt`).
- `Activities.md`:
  - "Runs and companies" and "The screen" as built.
  - Line 13 becomes: "Steps 1 to 4 are built: the core, the dungeons, the screens, and companies of four with Find a Company; the quests and bounties are not."
  - Add `client/src/game/companyFinder.ts#findCompany` to `code:`.
- At the session's end, rewrite `bible/Hand-off.md`.

---

## What I could not determine, and how I chose

**This Week and the card**

1. **Where This Week goes.** The owner set the menu's tabs, with "Journal (For quests, deferred until later)". So This Week is the Journal tab's page, titled "This Week", with Quests still marked Later inside it. The tab list is unchanged. A tab of its own would change that decision, so it needs the owner's yes.
2. **E at an entrance opens the card.** It no longer enters at once; the card's Enter (E again) goes in. The prompt keeps saying "Enter <name>". The card is modal, as the menu is, and closes if the player falls or leaves.
3. **Each screen says which Elite it means.**
   - This Week names the day's tiers "Normal seas", "Elite seas" and "Abyss seas".
   - The entrance card says "Elite seas", "Elite Dungeon" or "Elite Dungeon of the week".
   - The voyage card gains a "Seas" label before its tiers.
4. **Words and numbers.**
   - Modifier words live in Rust beside their numbers.
   - The levels at each tier come from the rules (`bands`), so the page never raises a level itself.
   - The pay lines are TypeScript words, as the voyage card's are now.
   - "a richer cache" stands for "its cache, raised by the tier".
5. **"Taken" is judged by the page.** The gear sends the record raw, and the page compares it with its own clock's day and week. A record from yesterday reads as not taken.
6. **Before any room's word on the character** (no gear yet), the screens show no state and shut nothing. The rooms still judge every join.
7. **On the voyage card,** a shut pick falls to the hardest open tier below it. The line shows the first reason.

**Find a Company**

8. **Where the queue lives.** It is a Durable Object of the accounts' Worker, one for each run's base. The reasons are in the Architecture above. At most 19 are live at once.
9. **A found group is not a company.** It is admitted to that one run through `found_runs`. The reasons are in the Architecture above.
10. **Level bands.**
    - Bands are tens of levels: 1 to 10, 11 to 20 and 21 to 30. The design names bands but not their width.
    - A band is read from the level the player's room last kept, never from the page.
    - The Elite Dungeon of the week (24 and up) is all one band.
11. **"Fewer after a minute" includes one.** A lone seeker goes in alone after a minute.
12. **Blocks keep seekers apart**, as they keep them out of a company.
13. **One search an account a dungeon.** A second replaces the first.
14. **The finder checks neither the gates nor the week.** The room is the authority, and the card offers Find a Company only where the gate is open. A page that queues while shut wastes only its group's slot.
15. **The week turning mid-search** is handled by the page: the card's run changes, so the search ends. The finder keeps no clock.
16. **A run holds four.** A fifth is welcomed and then sent away with 4003, "This run is full.", by Phase 1's path back to the ship.
17. **A player in a company may search alone.** Their company stays as it is, and members can follow by the Roster until the run holds four.
18. **Find a Company is online only.** Offline, the card offers Enter alone.

**Left out, or left as it was**

19. **No card at sea islands' dungeons yet.** Their door belongs to the islands session and calls `enterSeaDungeon` directly. A `seaCard` entry can follow the same model.
20. **The decision page keeps its old number.** "The Roster and Emblems as Claude Shapes Them" still says "A company | 3 at most". It is a decision page, so it is not rewritten; `Accounts.md` and `Activities.md` say four. The lead may want a line added there with the owner's leave.
21. **Old migrations keep their comments.** The applied migration `20261118151123_roster.sql` says companies of up to three; applied migrations are never edited.

**The builder's numbers**
- `BAND_LEVELS = 10`, `FIND_WAIT_MS = 60_000` (the design's minute), `FIND_TICK_MS = 1_000`, `FINDING_MOST = 64`, `FOUND_KEPT_MS` one day, `RUN_MOST = COMPANY_MOST = 4`.
- The screens look again every 250 ms.

## Every screen string added

**From the rules (Rust)**
- `Modifier::words`:
  - "Storm spells deal double damage. Wearing Storm, you take double." (and the same for Divine and Shadow)
  - "Melee deals 50% more damage."
  - "Ranged deals 50% more damage."
  - "Foes' melee deals double damage."
  - "Half of all foes carry shields."
  - "Arts take 50% longer to recharge."
  - "No ammunition drops."
  - "Heals restore half as much."

**This Week and the card** (`activityWords.ts`, `menuPages.ts`, `entranceCard.ts`)
- Headings:
  - "This Week", "Today", "The week", "Dungeon of the day", "At Elite and Abyss seas"
  - "Breaches", "Bounties", "Quests" (each with the existing "Later" chip)
- Bounties' line: "Six a day, from the board in Overlook’s plaza." Quests keep the existing "Your quests will be kept here.".
- Resets: "Resets in {n}m", "Resets in {h}h {m}m", "Resets in {d}d {h}h".
- Tiers and levels:
  - "Normal seas", "Elite seas", "Abyss seas"
  - "Levels {low} to {high}", "Level {n}"
  - "{tier} · {levels}", for example "Elite seas · Levels 3 to 6"
  - "Elite Dungeon · {levels}", "Elite Dungeon of the week · Level {n}", "Abyss Dungeon of the week · Level {n}"
- State: "Taken", "Not taken".
- Pay:
  - "Once a day at each tier, on any island: a Vestige and a richer cache."
  - "Taken today. It pays its kills and its cache."
  - "Taken this week. It pays its kills and its cache."
  - "It pays its kills and its cache."
  - "Once a week: a Legendary Vestige and Essence."
  - "Once a week: a Legendary or Atheric Vestige, Essence, and the Abyss boon."
- Rules: "{n} revives for the company. A wipe starts the run over.", "Never matched. Bring your company.".
- The boon: "Abyss boon: 25% more XP until the week turns."
- Presses: "Enter" (keycap E); "Close" (Esc) is the existing word. While loading it shows the existing "Loading…".

**The voyage card:** "Seas".

**Phase 4**
- The card:
  - "Find a Company" (keycap F), "Stop finding" (keycap F)
  - "Finding a company · {m}:{ss}"
  - "A run starts with four, or with fewer after a minute."
  - "The search stopped. Try again."
- From the server:
  - "Sign in to find a company."
  - "You are finding a company in another tab."
  - "This run is full."

**Reused, not added:** the gates' reasons, "Elite Dungeon", "Elite Dungeon of the week", "Abyss Dungeon of the week", "This run is another company's." and "N revives left" (Phase 2).

### Critical Files for Implementation
- /home/user/overlook-source/.claude/worktrees/activities/client/src/game/activityWords.ts (new: every word of This Week and the card)
- /home/user/overlook-source/.claude/worktrees/activities/client/src/game/activityScreens.ts (new: the kept gear, the Journal's board, the card, the search)
- /home/user/overlook-source/.claude/worktrees/activities/crates/room-wasm/src/run_door.rs (Phase 2's file: the bands, modifier words and `gates_json`)
- /home/user/overlook-source/.claude/worktrees/activities/server/accounts/finding.ts (new: found runs, the queue, the finder) with /home/user/overlook-source/.claude/worktrees/activities/server/accounts/finder.ts
- /home/user/overlook-source/.claude/worktrees/activities/server/accounts/companies.ts (four, and `companionsOf(account, room)`)

I built and ran nothing, since this was read-only.
- Every pin that depends on Phase 2's draws assumes its pins hold in Rust; Phase 2's own note says they came from a Python replica.
- Phase 2 is mid-build. Its `activities.ts`, `roomNames.ts`, `forCompany` and `companions` are planned, not yet on disk; recheck them before Tasks 1, 8 and 10.
- I could not see the plaza keepers' panels on main: the local `main` and `origin/main` refs have no `client/src/game/npc/`. I read #92's `npcScreen.ts` from `origin/claude/game-experience-factions-94un6s`, and the card follows the kit's window, header and footer as the menu and stations do.
- `game.ts` keeps within 600 lines only if Phase 2 lands at about 591, as planned.
