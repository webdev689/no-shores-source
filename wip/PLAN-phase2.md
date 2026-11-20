# Activities, Phase 2: the dungeons. Implementation plan

**Goal.** Build step 2 of the approved Activities design: the dungeon of the day on each island with its modifier at Elite and Abyss; the 18 Elite Dungeons, laid by the Forge from their place, each ending at a Boss of its own, entered from their node's open-air approach; the week's two (Elite at 26, Abyss at 30) with their modifiers; what each pays once; private runs for every dungeon at Elite or Abyss, every Elite Dungeon and the week's two; Abyss's rules (five shared revives, a wipe starts the run over); the eight modifiers, one hook each; and the sea islands' dungeon rooms and the page's trip in and out, owed to the Sea islands session.

**Architecture.** Everything that is drawn or paid lives in `gear`, which the server and the browser both run:
- `gear::activities` holds each island's places (its three patrols and its two Elite Dungeons, each with its style and its Boss), the draws by the clock's day and week, the modifiers and the week's two.
- `gear::clears` pays the first clear in a period into Phase 1's `Character.activity`.
- `gear::gate` gains the Elite Dungeon and the week's two as places.

The room (`crates/room`) gains one field, `run`, from a new `run.rs`. It holds what the room's clear pays, its modifiers, its revives and the week's fixed level. The modifiers' hooks read it: `empower_as`, `spell_strikes`, `step_arts`, the heals, `drop_spoils` and `gird_of`. A new constructor, `Room::dungeon_run(of, tier, minute)`, stands any dungeon's room for a run: a patrol's, an Elite Dungeon (four or five blocks, its Boss at the end), the week's two, and a sea island's. `abyss.rs` keeps the revives and the wipe.

`room-wasm` gains `open_run` (a JSON ask) and `activities` (what is on at a minute). The server parses run names (`--run-<8 a-z0-9>` after the dungeon's name, and `sea-dungeon-…`) into that ask (`runAsk`). It opens runs without a node file, keeps characters in them, lets in only the company of those kept there, and forgets an emptied run after a minute. The page names a new instance or joins a company member's run (found in a fresh Roster), lays any dungeon from one `DungeonAsk`, enters Elite Dungeons from their node's entrance, and takes a fallen company out to the entrance.

**Tech stack.** Rust (workspace edition; `gear` only serde, serde_json, libm; `room` no serde, so JSON is parsed in `room-wasm`), FlatBuffers (`crates/protocol/messages.fbs`, `npm run schema`), the wasm32 room module, TypeScript strict with `node --test`, Cloudflare Durable Objects and D1.

**Spec path.** `/home/user/overlook-source/.claude/worktrees/activities/bible/02-Systems/Activities.md`, step 2 of "How it is built". It builds on Phase 1's plan (`…/scratchpad/activities/PLAN-phase1.md`) and on COORD.md's Sea islands agreement.

**Line numbers.** None are given. Phase 1 is being committed on `claude/activities` as this is written (its tasks 1 to 3 are in, and 4 to 6 are partly on disk), so find every edit by the symbol named.

---

## Task 0: the Phase 1 review's fixes (do first, one commit each)

1. **The gate's promise, said exactly.** A joiner the accounts do not hand over (no token, a token that is no session,
   or the accounts not answering) plays unkept as `Character::starting()` and keeps nothing, so it can skip no kept
   progress. Change the words, not the behaviour: the doc at the top of crates/gear/src/gate.rs and Activities.md ("The
   rooms refuse a join a gate shuts") say that no kept character passes a gate it has not opened, and that a player
   playing unkept keeps nothing. No test.
2. **The story only moves forward, and the gate judges what the room already knows.** A fresh guest whose page tells
   its room the prologue is behind it (`Ask::FinishPrologue`, sent on the first gear message) before the accounts'
   claim answers is today judged on the claimed body (`server/keeping.ts` `shut` before restore; `gear_door.rs`
   `shut`), which reads as short of the prologue, so a `?at=<patrol>` first visit is sent back. Fix at the root: when
   the room judges a joiner's claimed character it first carries forward the story the in-room player already holds
   (a `Story` merge that keeps every step either side has, never one going back), and `restore_character` keeps that
   merged story. Test (room crate): a player who finished the prologue in the room before their claim answered with a
   body short of it is not shut from a patrol and keeps the prologue done after restore; and a kept story ahead of the
   in-room one is never put back.
3. **A page from before the rename finds its room.** Pages loaded before this deploy build `--rough`/`--storm` room
   names; the server now refuses them, and such a page retries forever without a welcome, so it never loads again.
   In server/roomNames.ts read `--rough` as `--elite` and `--storm` as `--abyss` (only as tier suffixes) and make the
   worker open the room under its canonical name, so the old page joins, gets the welcome with the new protocol hash,
   and loads again. Test (server/roomNames.test.ts): `node-x--rough` and `node-x--storm--dungeon-1` parse to the same
   room as their `--elite`/`--abyss` names; a canonical name stays as it is. Say in a one-line comment why the old
   names are read.
4. **Two pages that still name the old tiers.** In "The Tiers Are Normal, Elite and Abyss.md" remove the bullet "Not
   in the game yet: the voyage's card still offers Calm, Rough and Storm." (it is now in the game; keep everything
   else). In "Gear as Claude Shapes It.md" near its line 127, name the tiers Normal, Elite and Abyss where it says Calm,
   Rough and Storm. Leave every quote of the owner's words as written.

## Changes from the lead's review (these override the tasks below)

### A. Phase 1 as built, and test comments
- Phase 1 took the sea session's own tier rename: `Difficulty::{Normal, Elite, Abyss}`, `--elite`/`--abyss`, the words
  "Elite difficulty". It gates every `Room::dungeon_of` room by its tier alone (`Place::Node`, set in `dungeon_of`) and
  only `Room::dungeon` (a patrol's) as `Place::PatrolDungeon`. Task 7's `laid_dungeon` keeps both where Phase 1 put
  them; a sea run opened by `Room::dungeon_run` is `Place::Node`. Recheck Phase 1's `gate.rs`, `Keeper.lost` and
  `Place` on disk before Task 3.
- No test comment carries a calendar date (the comments check refuses them). Task 7's comment becomes
  `// A Tuesday's 08:59 UTC: the last minute of week 2,968`; a doc on `FRIDAY_NINE` reads
  `/// A Friday's 09:00 UTC: day 20,778, in week 2,968.`
- The pinned draws were computed by a Python replica of `Dice::roll`. If Rust disagrees, check the construction
  against Task 1's formulas before changing a pin, and say in the commit and PR when a pin changed.

### B. The Bosses (overrides Task 5 and "could not determine" 4)
Each Elite Dungeon's Boss belongs to its own dungeon's garrison, the faction its Reeve and bands are drawn from (the
dungeon garrison in crates/room/src/garrison.rs), at Boss rank, with a name of its own and a nameplate. Not the Grey
Tithe: the lore puts the Tithe at sea. Its fight may reuse Corvane's three phases. The 18 names are Claude's picks,
listed in the PR for the owner to change.

### C. The island dungeons, against the agreed door contract (overrides Tasks 11, 13, 14 where they differ)
- Name: `sea-dungeon-<continent>-<style>-<seed 8 hex>[--elite|--abyss]`; `<continent>` is the layout id of the
  island's water's continent (`continent-4`), its band `gear::world::island_levels(continent)`; style one of the
  Forge's six keys (the islands use caverns, crypt, mines); seed the island's u64 folded `(s ^ (s >> 32)) as u32`, 8
  lowercase hex; tier the sea room's. The islands session folds the seed and makes the name.
- Task 11 (server): `seaDungeonRoom` pattern
  `^sea-dungeon-(continent-[1-9])-(crypt|halls|cells|sanctum|caverns|mines)-([0-9a-f]{8})(?:--(elite|abyss)--run-([a-z0-9]{8}))?$`.
  Refused: `sea-dungeon-continent-4-grotto-0a1b2c3d` (no such style); `sea-dungeon-continent-4-crypt-0a1b2c3d--elite`
  (Elite or Abyss only as a run). Parsed: `sea-dungeon-continent-7-mines-ffffffff--elite--run-k3j4h5g6` ->
  `{ continent: 'continent-7', style: 'mines', seed: 4_294_967_295, seas: 1, run: 'k3j4h5g6' }`;
  `sea-dungeon-continent-1-crypt-00000000` -> `{ continent: 'continent-1', style: 'crypt', seed: 0, seas: 0, run: null }`.
  The world seed name is the base name without tier or run.
- Task 13 (page): replace `enterSea(room, name, back)` with one function on what `dungeonTrips(…)` answers:
  `enterSeaDungeon(room: string, back: SeaBack): void` with
  `export interface SeaBack { readonly x: number; readonly y: number; readonly facing: number }`.
  It parses the name (a name that does not parse does nothing); lays `askDungeonOf(module, seed, style, 'the Sea')`
  ("The Caverns of the Sea"); joins the name itself at Normal, or `sharedRun(room, places) ?? runOf(room, instance())`
  at Elite or Abyss; travels `{ kind: 'enter', node: `${room}--dungeon`, name }` into
  `game.intoDungeon({ node: seaPlace(continent, layout), text: '' }, { number: 0, ask, room }, layout, seas)`;
  leaving (exit door or open portal) travels `{ kind: 'surface', name, fell: false }` into `game.ontoSea(back)`, a
  wipe the same with `fell: true`. flow.ts: `enter` also from `sea` mode with no menu open; a new happening
  `{ kind: 'surface'; name; fell }` from `foot` only (even with the menu open) -> `{ mode: 'loading', words:
  `${fell ? 'Your company fell. ' : ''}Leaving ${name}`, then: { mode: 'sea', menu: false } }`. footTrips.ts:
  `seaPlace(continent, layout): NodeInfo`. TripGame gains `ontoSea: (back: SeaBack) => Promise<void>`; game.ts wires
  `ontoSea: (back) => goSea(back)`, `goSea` gaining an optional `standing?: SeaBack` that the islands' code completes;
  until then leaving returns the player to their ship (say so in the PR). Their `enterDungeon(door)` callback is one
  line: `(door) => trips.enterSeaDungeon(door.room, { x: door.at[0], y: door.at[1], facing: door.facing })`.
- Tests for Task 13 (replace its sea test): in dungeonTrips.test.ts (recorded() also records ontoSea as
  ['sea', back]) `a sea island's dungeon is entered by its name and left back onto the island at its door, facing out`:
  enter `sea-dungeon-continent-4-caverns-0a1b2c3d--abyss` with back `{ x: 1_250.5, y: -340.25, facing: Math.PI / 2 }`
  -> ways[0].slice(2) is [`…--abyss--run-<instance>`, 'The Caverns of the Sea', 'abyss']; leave -> ways[1] is
  ['sea', back]; happenings ['enter', 'surface']; `sea-dungeon-continent-1-crypt-00000000` stays shared (Normal); a
  grotto name goes nowhere. In flow.test.ts `a sea island's dungeon is entered from the sea and left back to it, the
  veil saying why` with the four transitions above (and not with the sea menu open).
- Task 14: `fell()` takes the way out kept at entry: `leave` for a patrol's or an Elite Dungeon's, `surface` with
  `fell: true` for a sea island's.
- Bible: Game.md "A dungeon" and Dungeons.md "In the Game": a sea island's dungeon is entered from its door in the
  sea's room and left back to it; named "The <Style> of the Sea".
- After Task 13 is pushed, the lead messages the Sea islands session (`trips.enterSeaDungeon(room, { x, y, facing })`).
- A company member in a sea island's dungeon is not joined from the Roster in this phase ("They are across the sea").
  A sea island's dungeon is a private run at Elite and Abyss, shared at Normal, gated by its tier alone, pays no day's
  or week's clear, and keeps Abyss's revives and wipe.

## Global constraints

- `gear` uses only `serde`, `serde_json` and `libm`, and holds no clock. Every draw reads `gear::clock::day_of`/`week_of` of the minute its host passed.
- Agree to the bit: draws use `gear::dice::Dice` over a fixed seed, with no `HashMap` order and no float that could round differently. Each pinned draw is pinned natively and through the compiled module.
- A source file holds at most 600 lines and a test file at most 800. Watch these:
  - `crates/room/src/lib.rs`: about 584 after Phase 1; this phase adds 5 lines.
  - `client/src/game/game.ts`: about 585; this phase adds about 3.
  - `client/src/game/foot.ts`: about 577; this phase adds about 8. Keep helpers in `footTrips.ts`.
  - `crates/room-wasm/src/lib.rs`: about 530; this phase adds about 6.
  - `crates/room/src/garrison.rs`: about 475.
  - `server/worker.ts`: about 275; this phase adds about 20.
  - `crates/foes/src/roster.rs`: 178, to about 260.
- A comment says why, in at most 8 lines, with no history, dates, issue numbers or `bible/` paths.
- Names are spelled out (clippy, ESLint).
- The bible says how things work now. Each system note changes in the same commit as its code; a decision page is never rewritten.
- Tests pin behaviour, never where lines sit.
- Text is plain, short and easily explained. No em dashes on screen and none of Destiny's words ("Nightfall", "Strike", "Fireteam"). Each screen says which Elite it means: "Elite difficulty", "Elite Dungeon", or an Elite foe's nameplate.
- `cargo xtask check` passes before every commit (`npm ci` once first).
- Generated files stay out of git (`generated/messages`, `target/protocol`). The protocol version is the schema's hash.
- Invent no game design beyond the values the design pins. Everything else is in the two lists at the end.
- Phase 1 still binds:
  - Use #92's names: `DAY_MINUTES`, `WEEK_MINUTES`, `week_of`, `Room::minute`, `Room::day()`, `Room::set_minute`, `set_minute`/`room_minute`, `MINUTE_MS`, `Here { social, day, week }`.
  - Always write `Difficulty::Elite` in full (`garrison.rs` imports `Rank::Elite` bare).
  - The Storm Art, the prologue's `storm`/`calm` beats, the sky's storm and the music's songs keep their names.
- Saves: this phase adds no Character field and no new value of a saved enum. Everything kept goes in Phase 1's `Character.activity`.
- A room name is at most 64 characters of `[a-z0-9-]` (`server/worker.ts` `roomName`).
- Each task is one commit on the Phase 2 branch, ending with the session's attribution lines. One pull request goes up for the phase, merged only on the owner's yes.

## Review focus

These five inputs are the most likely to break this phase, and ordinary task tests would not reach them. Each has a pinning test, added to the task named.

1. **An Abyss run with no one in it, or two falling in one tick.** `players.values().all(dead)` is true over an empty room, so a room ticking empty would "wipe" forever and reset its revives. Two players falling together with one revive left must stand only one of them. Pinned by `a_run_with_no_one_in_it_is_never_wiped_and_one_revive_stands_one_of_two_fallen_together` (Task 8). That task also pins that once the cache stands open, a fallen company is no wipe, so a cleared run's weekly Vestige is never thrown away.
2. **The week turning during a run.** A run opened as the Abyss Dungeon of the week at Tuesday 08:59 and cleared after 09:00 must pay as a clear again: no weekly Vestige and no boon. Pinned by `a_weeks_run_cleared_after_the_week_turns_pays_as_a_clear_again` (Task 7).
3. **The week's fixed level against the host's `set_difficulty`.** `raise_garrison` and `keep_cache` both go through `at_seas`. If the fixed level is not honoured there, Abyss lifts 30 to the cap of 32 and Elite lifts 26 to 28. Pinned by `the_weeks_dungeons_stand_every_foe_at_their_own_level_whatever_the_difficulty_set_after` (Task 7).
4. **Names that would make a shared copy of a private run, or a private copy of a shared room.** Examples: `--elite--dungeon-0` with no instance, `--dungeon-0--run-…` at Normal, an instance of 7 or 9 characters or in capitals, a sea seed of 7 hex digits, a name past 64. Pinned by `no room name opens a shared Elite or Abyss dungeon, a private Normal one, or a run without its whole instance` (Task 11).
5. **A clear in a room whose day is behind the record.** Phase 1's `today(day)` never turns back and hands back the later day's record. A clear made in a room a few seconds behind 09:00 would then write yesterday's tier into today's record and rob today's clear. Pinned by `a_clear_in_a_room_whose_day_is_behind_the_record_pays_no_more` (Task 2).

Shared test constants (computed from Phase 1's clock):
- `FRIDAY_NINE = 29_919_420`: Friday 20 November 2026, 09:00 UTC; day 20_778, week 2_968.
- `TUESDAY_NINE = 29_915_100`: day 20_775, week 2_968.
- `29_925_179`: Tuesday 24 November, 08:59, the last minute of week 2_968.

---

## Task 1: `gear::activities`, what is on

**Files**
- Create `crates/gear/src/activities.rs` and `crates/gear/src/activities_tests.rs`.
- `crates/gear/src/lib.rs`: `pub mod activities;`, `#[cfg(test)] mod activities_tests;`, and the module doc names "what is on, drawn by the day and the week".
- `crates/gear/src/dice.rs`: `Purpose` gains `/// The draws of what is on (`activities`). Draw = 12,` (12 is free).

**Interfaces**
- Consumes `crate::dice::{Dice, Purpose}`, `crate::arts::arts()` (Art ids 1 Storm, 2 Divine, 3 Shadow, in file order), `crate::world::{Difficulty, ISLANDS}`.
- Produces:
```rust
/// An Elite Dungeon: its node's id, the Forge's style key it is laid in (`dungeon::style_of`), and its Boss's type
/// (`foes::roster`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct EliteDungeon { pub id: &'static str, pub style: &'static str, pub boss: u8 }
/// An island's places as the draws know them: its continent, its three patrols and its two Elite Dungeons, each in its
/// land file's order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Island { pub continent: &'static str, pub patrols: [&'static str; 3], pub elite: [EliteDungeon; 2] }
pub const ISLAND_PLACES: [Island; 9];
#[must_use] pub fn island_of(place: &str) -> Option<&'static Island>;          // a patrol's or an Elite Dungeon's
#[must_use] pub fn elite_dungeon(place: &str) -> Option<&'static EliteDungeon>;
pub fn elite_dungeons() -> impl Iterator<Item = &'static EliteDungeon>;      // the 18, island by island

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Modifier { Burn(u8 /* Art id */), Brawler, Marksman, Lightswitch, Ironclad, Trickle, Juggler, Exposure }
pub const MODIFIER_KINDS: usize = 8;
pub const BURN_TIMES: f64 = 2.0;        // the burning Art's spells deal, and its wearers take from foes
pub const BRAWLER_TIMES: f64 = 1.5;     // a player's swing
pub const MARKSMAN_TIMES: f64 = 1.5;    // a player's shot
pub const LIGHTSWITCH_TIMES: f64 = 2.0; // a foe's swing or telegraphed blow on a player
pub const IRONCLAD_SHIELDS: f64 = 0.5;  // the share of foes shielded, for element::SHIELD_CHANCE's 0.2
pub const TRICKLE_TIMES: f64 = 1.5;     // how much longer an Art's recharge takes
pub const EXPOSURE_TIMES: f64 = 0.5;    // what a heal gives
impl Modifier {
    #[must_use] pub fn kind(self) -> usize;   // its place in the set: Burn 0 … Exposure 7
    #[must_use] pub fn key(self) -> String;   // "burn-shadow", "brawler", …
    #[must_use] pub fn name(self) -> String;  // "Burn (Shadow)", "Brawler", …
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Weekly { Elite, Abyss }
impl Weekly {
    #[must_use] pub fn of(tier: Difficulty) -> Option<Self>;   // Normal none
    #[must_use] pub const fn tier(self) -> Difficulty;
    #[must_use] pub const fn foes_at(self) -> u8;              // 26, 30
    #[must_use] pub const fn opens_at(self) -> u8;             // 24, 28
    #[must_use] pub const fn name(self) -> &'static str;       // "Elite Dungeon of the week", "Abyss Dungeon of the week"
}

#[must_use] pub fn dungeon_of_the_day(day: u64, continent: &str) -> Option<(&'static str, usize)>;
#[must_use] pub fn modifier_of_the_day(day: u64) -> Modifier;
#[must_use] pub fn week_dungeons(week: u64) -> (&'static EliteDungeon, &'static EliteDungeon); // (Elite's, Abyss's)
#[must_use] pub fn of_the_week(week: u64, weekly: Weekly) -> &'static EliteDungeon;
#[must_use] pub fn week_modifiers(week: u64, weekly: Weekly) -> Vec<Modifier>;
```
- The draws, exactly, since the pins below depend on them:
```rust
/// The draws' own seed, apart from every room's ("ACTIVITY"); the kind of draw is the dice's tick.
const DRAWS: u64 = 0x4143_5449_5649_5459;
fn drawn(period: u64, kind: u64, nth: u32, count: usize) -> usize {
    Dice { seed: DRAWS ^ period, tick: kind, player: 0 }.pick(Purpose::Draw, nth, count)
}
```
- Kinds are 0 for the day's dungeons, 1 the day's modifier, 2 the week's dungeons and 3 the week's modifiers.
- **Day's dungeon:** `pick = drawn(day, 0, island_index, 9)` gives `(patrols[pick / 3], pick % 3)`.
- **One modifier** `(period, kind, nth)`: `drawn(period, kind, nth, 8)` gives its kind. Burn's Art is `arts().arts[drawn(period, kind, nth + 1, arts.len())].id`. The day's is `(day, 1, 0)` and the Elite week's is `(week, 3, 0)`.
- **The week's two:** `elite = drawn(week, 2, 0, 18)`, `other = drawn(week, 2, 1, 17)`, and `abyss = if other >= elite { other + 1 } else { other }`, indexing `elite_dungeons()`.
- **The Abyss week's three:** from `left = (0..8).collect::<Vec<usize>>()`, `left.remove(drawn(week, 3, nth, count))` for `(nth, count)` in `[(2, 8), (3, 7), (4, 6)]`, in that order. Burn's Art is `drawn(week, 3, 5, arts.len())`.
- **The table** follows the land files in order, with styles and Bosses as picked (the builder's, listed at the end):

| Continent | Patrols | Elite Dungeons (style, Boss type) |
|---|---|---|
| continent-1 | saltgrass-downs, gullwing-vale, driftwood-moors | krakens-grotto (caverns, 19), pearl-tomb (crypt, 20) |
| continent-2 | highwater-fells, highwater-glen, greystone-tors | cinder-deep (mines, 21), hollow-crypt (crypt, 22) |
| continent-3 | elder-thicket, hollow-dells, oakshade-weald | black-tide-caverns (caverns, 23), pale-undercroft (sanctum, 24) |
| continent-4 | ochre-wastes, sunscorched-barrens, scorpion-erg | forsaken-cistern (halls, 25), sandworn-vault (halls, 26) |
| continent-5 | lion-grasslands, baobab-grasslands, thunderhoof-grasslands | smugglers-labyrinth (cells, 27), silt-barrows (crypt, 28) |
| continent-6 | emerald-tangle, vinewood-basin, rainshadow-canopy | deepwater-vault (halls, 29), coral-halls (halls, 30) |
| continent-7 | kurgan-plateau, horsehead-mounds, greywind-steppe | barrow-halls (crypt, 31), saltworm-warrens (mines, 32) |
| continent-8 | bogmire-sloughs, sunken-fen, blackwater-marsh | mire-hollows (caverns, 33), rotwater-sewers (cells, 34) |
| continent-9 | whitewind-tundra, pale-wastes, aurora-wastes | frozen-sepulchre (sanctum, 35), brine-catacombs (crypt, 36) |

**Steps**
1. Write the failing tests in `activities_tests.rs`:
```rust
use crate::activities::*;
use crate::world::Difficulty;
use std::collections::BTreeSet;

const LAND: [&str; 9] = [
    include_str!("../../../content/world/land/continent-1.json"),
    // … continent-2 to continent-9, in order
];

#[test]
fn the_places_are_each_islands_patrols_and_elite_dungeons_as_its_land_file_holds_them() {
    for (island, text) in ISLAND_PLACES.iter().zip(LAND) {
        let file: serde_json::Value = serde_json::from_str(text).expect("a land file");
        let ids = |kind: &str| -> Vec<String> {
            let nodes = file["nodes"].as_array().expect("nodes");
            nodes.iter().filter(|node| node["kind"] == kind).map(|node| node["id"].as_str().expect("an id").to_owned()).collect()
        };
        assert_eq!(ids("patrol"), island.patrols, "{}", island.continent);
        assert_eq!(ids("dungeon"), island.elite.iter().map(|elite| elite.id).collect::<Vec<_>>());
    }
    assert_eq!(ISLAND_PLACES.map(|island| island.continent), crate::world::ISLANDS.map(|(id, ..)| id));
    assert_eq!(elite_dungeons().count(), 18);
    assert_eq!(island_of("saltworm-warrens").map(|island| island.continent), Some("continent-7"));
    assert_eq!(island_of("gullwing-vale").map(|island| island.continent), Some("continent-1"));
    assert_eq!(elite_dungeon("gullwing-vale"), None, "a patrol is no Elite Dungeon");
}

#[test]
fn each_island_draws_one_of_its_patrols_dungeons_each_day_the_same_for_everyone() {
    let drawn: Vec<(&str, usize)> =
        ISLAND_PLACES.iter().map(|island| dungeon_of_the_day(20_778, island.continent).expect("an island")).collect();
    assert_eq!(drawn, [
        ("gullwing-vale", 0), ("highwater-fells", 2), ("elder-thicket", 2), ("sunscorched-barrens", 2),
        ("thunderhoof-grasslands", 1), ("emerald-tangle", 1), ("greywind-steppe", 2), ("bogmire-sloughs", 2),
        ("whitewind-tundra", 0),
    ]);
    assert_eq!(dungeon_of_the_day(20_775, "continent-1"), Some(("saltgrass-downs", 2)), "Tuesday's");
    assert_eq!(dungeon_of_the_day(20_778, "continent-0"), None);
    for island in &ISLAND_PLACES {
        let seen: BTreeSet<_> = (0..365).map(|day| dungeon_of_the_day(20_000 + day, island.continent)).collect();
        assert_eq!(seen.len(), 9, "{}: all nine of its dungeons in a year", island.continent);
    }
}

#[test]
fn the_modifier_of_the_day_is_one_of_the_eight_and_burn_names_an_art() {
    assert_eq!(modifier_of_the_day(20_775), Modifier::Juggler);
    assert_eq!(modifier_of_the_day(20_777), Modifier::Trickle);
    assert_eq!(modifier_of_the_day(20_778), Modifier::Burn(3));
    assert_eq!((Modifier::Burn(3).key(), Modifier::Burn(3).name()), ("burn-shadow".to_owned(), "Burn (Shadow)".to_owned()));
    assert_eq!((Modifier::Lightswitch.key(), Modifier::Exposure.name()), ("lightswitch".to_owned(), "Exposure".to_owned()));
}

#[test]
fn the_weeks_two_are_two_of_the_eighteen_never_the_same_with_one_modifier_and_three() {
    let (elite, abyss) = week_dungeons(2_968);
    assert_eq!((elite.id, abyss.id), ("forsaken-cistern", "saltworm-warrens"));
    assert_eq!(of_the_week(2_968, Weekly::Abyss).id, "saltworm-warrens");
    assert_eq!(week_modifiers(2_968, Weekly::Elite), [Modifier::Brawler]);
    assert_eq!(week_modifiers(2_968, Weekly::Abyss), [Modifier::Lightswitch, Modifier::Burn(2), Modifier::Juggler]);
    assert_eq!((week_dungeons(2_969).0.id, week_dungeons(2_969).1.id), ("pearl-tomb", "coral-halls"));
    for week in 0..5_000 {
        let (elite, abyss) = week_dungeons(week);
        assert_ne!(elite.id, abyss.id, "week {week}");
        let kinds: BTreeSet<usize> = week_modifiers(week, Weekly::Abyss).into_iter().map(Modifier::kind).collect();
        assert_eq!(kinds.len(), 3, "week {week}: three apart");
    }
}

#[test]
fn the_weeks_two_stand_at_their_own_levels_and_open_two_below() {
    assert_eq!([Weekly::Elite, Weekly::Abyss].map(Weekly::foes_at), [26, 30]);
    assert_eq!([Weekly::Elite, Weekly::Abyss].map(Weekly::opens_at), [24, 28]);
    assert_eq!(Difficulty::ALL.map(Weekly::of), [None, Some(Weekly::Elite), Some(Weekly::Abyss)]);
    assert_eq!(Weekly::Abyss.name(), "Abyss Dungeon of the week");
}
```
2. Run `cargo test -p gear --lib activities_tests`. It should fail to compile: unresolved import `crate::activities`.
3. Implement the signatures, table and draws above.
4. Run `cargo test -p gear` until it passes, then `cargo xtask check`.
5. Commit: "What is on: the dungeon of the day on each island, the week's two and their modifiers, drawn by the clock".

**Bible.**
- `Activities.md` "What is on": the draws are `gear::activities`, seeded by the day's or the week's number, the same in every room and page.
- Add `crates/gear/src/activities.rs#week_dungeons` to its `code:` list.
- `bible/03-Code/Code Map.md` `crates/gear` row: "what is on, drawn by the day and the week".

---

## Task 2: what a first clear pays (`gear::clears`)

**Files**
- Create `crates/gear/src/clears.rs`. Its tests go in `crates/gear/src/activity_tests.rs` (Phase 1's), appended. `lib.rs` gains `pub mod clears;`.
- `crates/gear/src/vestige.rs`: `of_colours`, which `dropped` now calls.
- `crates/gear/src/rewards.rs`: `fn at_level` becomes `pub(crate)`.

**Interfaces**
- Consumes Phase 1's `Activity::today`/`this_week`, `Today.cleared`, `ThisWeek { elite, abyss, boon }`, `rewards::{worth, Foe::Captain, Reward}`, `Weekly` (Task 1).
- Produces:
```rust
// vestige.rs: a Vestige of these colour weights for a foe of this level, gated as every drop is
#[must_use] pub fn of_colours(weights: [u32; 5], foe_level: u8, dice: &Dice) -> (Rarity, Slot, u8);
// clears.rs
pub const BOON_SHARE: u32 = 4;   // the boon is xp / 4 more
impl Character {
    /// The dungeon of the day's first clear at `tier` today: a Captain's kill at `level` (the run's, the tier applied),
    /// its XP and Aurem times the tier's reward, and a sure Vestige in a boss's colours at `level`. None once taken
    /// today, or when `day` is behind the record's.
    pub fn clear_of_the_day(&mut self, day: u64, tier: Difficulty, level: u8, dice: &Dice) -> Option<Reward>;
    /// The week's Elite or Abyss Dungeon's first clear this week: a Legendary Vestige (the Abyss's Atheric one in five),
    /// Essence of each stock, and for the Abyss its boon. None once taken, or when `week` is behind the record's.
    pub fn clear_of_the_week(&mut self, week: u64, weekly: Weekly, dice: &Dice) -> Option<Vestige>;
    /// A quarter more of a kill's XP while the Abyss boon is held this week; the XP it gave.
    pub fn boon_xp(&mut self, week: u64, xp: u32, weapon: Option<Slot>) -> u32;
}
```
- Week colours: Elite `[0, 0, 0, 1, 0]`, Abyss `[0, 0, 0, 4, 1]`. Essence: Elite 3, Abyss 5, to each stock (`Stuff::Essence(Stock::Weapon)` and `Armor`).
- The day's XP and Aurem are `libm::round(f64::from(at_level(amount, level)) * tier.reward())`.

**Steps**
1. Append the failing tests to `activity_tests.rs`:
```rust
const DICE: Dice = Dice { seed: 7, tick: 1, player: 1 };

#[test]
fn the_first_clear_at_each_tier_of_a_day_pays_a_captains_worth_raised_by_the_tier_and_a_sure_vestige() {
    let mut character = Character::starting();
    let (xp, aurem) = (character.xp, character.materials.aurem);
    let paid = character.clear_of_the_day(20_778, Difficulty::Elite, 12, &DICE).expect("the first Elite clear today");
    assert_eq!((paid.xp, paid.aurem), (5_100, 306), "2,000 and 120 at level 12, times 1.5");
    assert_eq!((character.xp, character.materials.aurem), (xp + 5_100, aurem + 306));
    let vestige = paid.vestige.expect("sure");
    assert_eq!(vestige.level, 12);
    assert!(matches!(vestige.rarity, Rarity::Magic | Rarity::Rare), "no Legendary below 18");
    assert_eq!(character.clear_of_the_day(20_778, Difficulty::Elite, 12, &DICE), None, "once a day at a tier");
    assert!(character.clear_of_the_day(20_778, Difficulty::Normal, 10, &DICE).is_some());
    assert!(character.clear_of_the_day(20_778, Difficulty::Abyss, 13, &DICE).is_some());
    assert_eq!(character.activity.today(20_778).cleared.len(), 3, "three a day at most");
    assert!(character.clear_of_the_day(20_779, Difficulty::Elite, 12, &DICE).is_some(), "the next day anew");
}

#[test]
fn a_clear_in_a_room_whose_day_is_behind_the_record_pays_no_more() {
    let mut character = Character::starting();
    assert!(character.clear_of_the_day(20_778, Difficulty::Elite, 12, &DICE).is_some());
    assert_eq!(character.clear_of_the_day(20_777, Difficulty::Normal, 12, &DICE), None, "that day is over for it");
    assert_eq!(character.activity.today.cleared, BTreeSet::from([Difficulty::Elite]), "and nothing is written today");
    assert!(character.clear_of_the_week(2_968, Weekly::Elite, &DICE).is_some());
    assert_eq!(character.clear_of_the_week(2_967, Weekly::Abyss, &DICE), None);
    assert!(!character.activity.this_week.abyss);
}

#[test]
fn the_weeks_two_pay_once_a_legendary_vestige_and_essence_and_the_abyss_its_boon() {
    let mut character = Character::starting();
    let (weapon, armor) = (character.materials.weapon_essence, character.materials.armor_essence);
    let elite = character.clear_of_the_week(2_968, Weekly::Elite, &DICE).expect("once");
    assert_eq!((elite.rarity, elite.level), (Rarity::Legendary, 20));
    assert_eq!((character.materials.weapon_essence, character.materials.armor_essence), (weapon + 3, armor + 3));
    assert!(!character.activity.this_week(2_968).boon, "the Elite's gives no boon");
    assert_eq!(character.clear_of_the_week(2_968, Weekly::Elite, &DICE), None);
    let abyss = character.clear_of_the_week(2_968, Weekly::Abyss, &DICE).expect("once");
    assert!(matches!(abyss.rarity, Rarity::Legendary | Rarity::Atheric));
    assert!(character.activity.this_week(2_968).boon);
    assert_eq!(character.materials.weapon_essence, weapon + 8);
    let atheric = (0..1_000_u32)
        .filter(|&player| {
            let dice = Dice { seed: 7, tick: 1, player };
            Character::starting().clear_of_the_week(2_968, Weekly::Abyss, &dice).map(|found| found.rarity)
                == Some(Rarity::Atheric)
        })
        .count();
    assert!((150..=250).contains(&atheric), "about one in five: {atheric}");
}

#[test]
fn the_abyss_boon_gives_a_quarter_more_xp_until_the_week_turns() {
    let mut character = Character::starting();
    character.activity.this_week(2_968).boon = true;
    let before = character.xp;
    assert_eq!(character.boon_xp(2_968, 1_000, None), 250);
    assert_eq!(character.boon_xp(2_968, 3, None), 0, "a quarter, rounded down");
    assert_eq!(character.boon_xp(2_969, 1_000, None), 0, "the week turned");
    assert_eq!(character.boon_xp(2_968, 1_000, None), 0, "and never turns back");
    assert_eq!(character.xp, before + 250);
}
```
   Append to `vestige_tests.rs`:
```rust
#[test]
fn a_vestige_of_chosen_colours_keeps_the_gate_every_drop_keeps() {
    let dice = Dice { seed: 3, tick: 0, player: 1 };
    assert_eq!(of_colours([0, 0, 0, 1, 0], 26, &dice).0, Rarity::Legendary);
    assert_eq!(of_colours([0, 0, 0, 1, 0], 12, &dice).0, Rarity::Rare, "no Legendary below 18");
    assert_eq!(of_colours([0, 0, 0, 0, 1], 19, &dice).0, Rarity::Legendary, "no Atheric below 20");
    assert_eq!(of_colours([0, 0, 0, 1, 0], 26, &dice).2, 20, "its item at the named level");
}
```
2. Run `cargo test -p gear --lib activity_tests vestige_tests`. It should fail to compile: no method `clear_of_the_day`, no function `of_colours`.
3. Implement. `dropped` becomes `boss || roll` then `Some(of_colours(if boss { FROM_BOSSES } else { FROM_FOES }, foe_level, dice))`. Its draws keep their purposes and order, so every existing drop is the same.
4. Run `cargo test -p gear` until it passes, then `cargo xtask check`.
5. Commit: "A first clear pays once: the dungeon of the day at each tier, the week's two and the Abyss boon".

**Bible.**
- `Activities.md` "What it pays, once": the numbers above, the never-behind rule and `gear::clears`.
- `Gear.md` "A dungeon's cache": the day's first clear lays a second Vestige ("Activities").
- Add `crates/gear/src/clears.rs#clear_of_the_day` to `code:`.

---

## Task 3: the gates for the Elite Dungeons and the week's two

**Files**
- `crates/gear/src/gate.rs` (Phase 1): new `Place` and `Shut` variants, and `shut_at`.
- `crates/gear/src/gate_tests.rs`: appended.
- `crates/room/src/garrison.rs` `place_of`: `NodeKind::Dungeon` becomes `Place::EliteDungeon`.
- `crates/room/src/gate_tests.rs` (Phase 1): appended.

**Interfaces**
- Consumes `Weekly` (Task 1).
- Produces:
```rust
pub enum Place { Social, Patrol, PatrolDungeon, /** An Elite Dungeon, its approach and its run at Normal. */ EliteDungeon,
                 /** The week's Elite or Abyss Dungeon's run. */ Week(Weekly), Node }
pub enum Shut { Prologue, Seas(Difficulty), Level(u8) }
/// As `shut` judges, from a level and whether the prologue was played: past the prologue (which stands in for the
/// campaign's end until the missions exist), the week's two by their own level, then the tier's.
#[must_use] pub fn shut_at(level: u8, prologue: bool, place: Place, tier: Difficulty) -> Option<Shut>;
// shut(character, place, tier) == shut_at(character.level(), character.story.prologue, place, tier)
```
- The reason for `Level(n)` is `"This dungeon opens at level {n}."`.

**Steps**
1. Write the failing tests. Append to `gear/src/gate_tests.rs`:
```rust
#[test]
fn an_elite_dungeon_opens_after_the_prologue_and_the_weeks_two_at_24_and_28() {
    assert_eq!(shut_at(30, false, Place::EliteDungeon, Difficulty::Normal), Some(Shut::Prologue));
    assert_eq!(shut_at(1, true, Place::EliteDungeon, Difficulty::Normal), None);
    for (weekly, opens) in [(Weekly::Elite, 24), (Weekly::Abyss, 28)] {
        let place = Place::Week(weekly);
        assert_eq!(shut_at(30, false, place, weekly.tier()), Some(Shut::Prologue), "the prologue stands in for the campaign");
        assert_eq!(shut_at(opens - 1, true, place, weekly.tier()), Some(Shut::Level(opens)));
        assert_eq!(shut_at(opens, true, place, weekly.tier()), None);
    }
    assert_eq!(Shut::Level(24).reason(), "This dungeon opens at level 24.");
    assert_eq!(shut(&at_level(9, true), Place::Patrol, Difficulty::Elite), shut_at(9, true, Place::Patrol, Difficulty::Elite));
}
```
   Append to `room/src/gate_tests.rs`:
```rust
#[test]
fn an_elite_dungeons_node_keeps_out_a_character_short_of_the_prologue() {
    let (room, _) = node_of(NodeKind::Dungeon, gear::Difficulty::Normal);
    assert_eq!(room.shut(&gear::Character::starting()), Some(gear::gate::Shut::Prologue));
    let mut past = gear::Character::starting();
    past.story.prologue = true;
    assert_eq!(room.shut(&past), None);
}
```
2. Run `cargo test -p gear --lib gate_tests` and `cargo test -p room --lib gate_tests`. They should fail to compile: no variant `EliteDungeon`, no function `shut_at`.
3. Implement. `shut_at` checks in this order: `Social` gives None; then `Patrol | PatrolDungeon | EliteDungeon | Week(_)` without the prologue give `Prologue`; then `Week(weekly)` below `weekly.opens_at()` gives `Level`; then the tier's level.
4. Run `cargo test -p gear -p room -p room-wasm`, then `cargo xtask check`.
5. Commit: "The Elite Dungeons open after the prologue, and the week's two at levels 24 and 28".

**Bible.** `Activities.md` "What opens when": the two places, their reasons and `gear::gate::shut_at`.

---

## Task 4: the Forge lays a dungeon within a count of blocks

**Files**
- `crates/dungeon/src/dungeon.rs`: `Dungeon::forge_within` and `ELITE_BLOCKS`. `forge` calls `forge_within(seed, style, BLOCKS)`.
- `crates/dungeon/src/lib.rs`: export `ELITE_BLOCKS`.
- `crates/dungeon/src/dungeon_tests.rs`: appended.

**Interfaces**
```rust
/// Blocks an Elite Dungeon grows to: four or five, longer than a patrol's.
pub const ELITE_BLOCKS: (usize, usize) = (4, 5);
/// The dungeon a seed lays in a style, its block count drawn within `blocks` on its size lane.
#[must_use] pub fn forge_within(seed: u32, style: Style, blocks: (usize, usize)) -> Self;
```

**Steps**
1. Write the failing test:
```rust
#[test]
fn a_dungeon_forged_within_four_and_five_blocks_takes_one_of_them_and_the_forges_own_count_is_unchanged() {
    let counts: std::collections::BTreeSet<usize> = (0..200_u32)
        .map(|seed| Dungeon::forge_within(seed, STYLES[seed as usize % STYLES.len()], ELITE_BLOCKS).squares.len())
        .collect();
    assert_eq!(counts, std::collections::BTreeSet::from([4, 5]));
    for seed in [0, 7, 4242] {
        assert_eq!(Dungeon::forge(seed, STYLES[0]), Dungeon::forge_within(seed, STYLES[0], BLOCKS));
    }
}
```
2. Run `cargo test -p dungeon forge_within`. It should fail to compile: no function `forge_within`.
3. Implement. The `size:<seed>` lane's `int(blocks.0, blocks.1)` replaces `int(BLOCKS.0, BLOCKS.1)`, so `room-wasm`'s `AGREED_HASH` stays as it is.
4. Run `cargo test -p dungeon -p room-wasm`, then `cargo xtask check`.
5. Commit: "The Forge lays a dungeon within a count of blocks: four or five for an Elite Dungeon".

**Bible.** `Dungeons.md` "Its size": an Elite Dungeon is four or five blocks, each count as likely, on the same lane.

---

## Task 5: a Boss of its own for each Elite Dungeon

**Files**
- `crates/foes/src/roster.rs`: `ROSTER: [FoeType; 36]`. Types 19 to 36 are added with a `const fn warden(number, name, right, left) -> FoeType` built on `row(…, GREY_TITHE, Land, …, Captain, …, &[Rank::Boss])` and `boss_phases: &CORVANE`.
- `crates/foes/tests/roster.rs`: "numbered 1 to 36", the Grey Tithe's land list with the 18 appended, and a new test.
- `crates/room-wasm/src/roster_door.rs` test: 36.
- `server/roomDoor.test.ts` roster test: `roster.length` 36.

**Interfaces.** These rows, the builder's picks:

| # | Elite Dungeon | Name | Right | Left |
|---|---|---|---|---|
| 19 | krakens-grotto | Wreck-Reeve Oswin Tarr | sword_steel | |
| 20 | pearl-tomb | Pearl-Keeper Isolde Varne | mace_iron | shield_kite_iron |
| 21 | cinder-deep | Forgemaster Garrick Soot | warhammer_iron | |
| 22 | hollow-crypt | Tithe-Warden Mabry Hollis | mace_iron | shield_kite_iron |
| 23 | black-tide-caverns | Wrecker Dunstan Black | axe_iron | |
| 24 | pale-undercroft | Sister-Assessor Aldith | flail_iron | shield_kite_iron |
| 25 | forsaken-cistern | Cistern-Steward Corwin Vey | sword_steel | shield_kite_steel |
| 26 | sandworn-vault | Vaultwarden Hesk Amaro | warhammer_iron | |
| 27 | smugglers-labyrinth | Gaoler Renna Crake | sword_iron | shield_kite_iron |
| 28 | silt-barrows | Barrow-Reeve Tobin Silt | mace_iron | |
| 29 | deepwater-vault | Treasurer Lucan Deeps | sword_ebony | |
| 30 | coral-halls | Factor Odile Coralle | flail_iron | |
| 31 | barrow-halls | Lord-Assessor Edric Barrow | sword_ebony | shield_kite_steel |
| 32 | saltworm-warrens | Digmaster Ulf Hargreave | axe_iron | |
| 33 | mire-hollows | Bog-Reeve Hester Mire | mace_iron | shield_kite_iron |
| 34 | rotwater-sewers | Sluice-Warden Abel Rook | sword_steel | |
| 35 | frozen-sepulchre | Abbess Ylva Frost | flail_iron | shield_kite_steel |
| 36 | brine-catacombs | Catacomb-Reeve Silas Brine | warhammer_iron | |

**Steps**
1. Write the failing test in `crates/foes/tests/roster.rs`:
```rust
#[test]
fn each_elite_dungeon_has_a_boss_of_its_own_named_on_its_bar_fighting_corvanes_three_phases() {
    let bosses: Vec<&foes::FoeType> = ROSTER.iter().filter(|foe| (19..=36).contains(&foe.number)).collect();
    assert_eq!(bosses.len(), 18);
    for boss in &bosses {
        assert_eq!((boss.ranks, boss.faction, boss.domain, boss.role), (&[Rank::Boss][..], 1, Domain::Land, Role::Captain));
        assert_eq!(boss.boss_phases, &CORVANE[..], "{}", boss.name);
    }
    let names: std::collections::BTreeSet<&str> = bosses.iter().map(|boss| boss.name).collect();
    assert_eq!(names.len(), 18, "each its own name");
    assert_eq!((foe_type(19).unwrap().name, foe_type(36).unwrap().name), ("Wreck-Reeve Oswin Tarr", "Catacomb-Reeve Silas Brine"));
}
```
2. Run `cargo test -p foes --test roster`. It should fail with an assertion: `bosses.len()` is 0.
3. Add the rows, and update the counts and lists named above.
4. Run `cargo test -p foes -p room-wasm`, then `npm run wasm && node --import ./tools/testStyles.mjs --test server/roomDoor.test.ts`, then `cargo xtask check`.
5. Commit: "Each Elite Dungeon has a Boss of its own, named on its bar".

**Bible.**
- `Enemies.md` "The roster": the 18 rows, and the sentence that each Elite Dungeon's Boss is a Captain fighting Corvane's three phases.
- `Activities.md` "The Elite Dungeons": its Boss is one of these.

---

## Task 6: a run's modifiers, one hook each

**Files**
- Create `crates/room/src/run.rs` (the `Run` and its hooks) and `crates/room/src/run_tests.rs`. The tests are declared at the end of `run.rs` with `#[cfg(test)] #[path = "run_tests.rs"] mod run_tests;`, as `garrison.rs` declares its own.
- `crates/room/src/lib.rs`:
  - `mod run;`
  - the field `/// A dungeon's run (`run.rs`): what its clear pays, its modifiers and its revives; none in any other room.` followed by `pub(crate) run: Option<run::Run>,`
  - `run: None,` in `on`.
- `crates/gear/src/element.rs`: `Shield::rolled(dice, nth, health, chance)`. Its one caller is updated.
- `crates/room/src/garrison.rs`: `gird_of(seed, nth, levels, shield_chance)`, and `gird_and_stand` passes `self.shield_chance()`.
- `crates/room/src/power.rs` `empower_as`: `times` is multiplied by `self.modded_blow(&blow, defender)`.
- `crates/room/src/spells.rs`: `spell_strikes` uses `damage: damage * self.spell_times(spell.art)`. `fn heal` becomes `pub(crate)` and multiplies `amount` by `self.heal_times()`.
- `crates/room/src/statuses.rs` `heal_linked`: a player's `LINKED_HEAL * self.heal_times()`; foes heal as before.
- `crates/room/src/arts.rs` `step_arts`: `let slower = self.recharge_times();` before the loop, and each `recharge_s * slower`.
- `crates/room/src/drops.rs` `drop_spoils`: `let juggling = self.modded(Modifier::Juggler);` before the borrow. The Ammo box and the crate are both skipped while juggling, and `take_crate` is not called.

**Interfaces**
- Consumes `gear::activities::{Modifier, *_TIMES, IRONCLAD_SHIELDS}`, `gear::element::SHIELD_CHANCE`, `combat::judge::{Blow, BlowKind}`.
- Produces:
```rust
pub const REVIVES: u8 = 5;
/// What a run's first clear in its period pays beside its kills and cache.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Pays { Nothing, Day { patrol: String, number: usize }, Week { weekly: Weekly, week: u64 } }
#[derive(Clone, Debug, PartialEq)]
pub struct Run { pub pays: Pays, pub modifiers: Vec<Modifier>, pub revives: Option<u8>, pub foes_at: Option<u8> }
impl Room {
    pub(crate) fn modded(&self, modifier: Modifier) -> bool;   // contains; never true for a room with no run
    pub(crate) fn burning(&self) -> Option<u8>;                // the Art a Burn names
    /// Brawler a player's swing, Marksman a player's shot, Lightswitch a foe's swing or telegraphed blow on a player,
    /// Burn a foe's blow on a player wearing its Art; their product, 1 for none.
    pub(crate) fn modded_blow(&self, blow: &Blow, defender: FighterId) -> f64;
    pub(crate) fn spell_times(&self, art: u8) -> f64;   // BURN_TIMES for the burning Art's
    pub(crate) fn recharge_times(&self) -> f64;         // TRICKLE_TIMES
    pub(crate) fn heal_times(&self) -> f64;             // EXPOSURE_TIMES
    pub(crate) fn shield_chance(&self) -> f64;          // IRONCLAD_SHIELDS, else SHIELD_CHANCE
}
```

**Steps**
1. Write the failing tests in `run_tests.rs`. Use a blow helper built as `gird_tests.rs::blow` builds one, with the striker and kind given.
```rust
fn run_of(modifiers: Vec<Modifier>) -> Run { Run { pays: Pays::Nothing, modifiers, revives: None, foes_at: None } }

#[test]
fn each_modifier_weighs_only_the_blows_it_names() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("in");
    let foe = crate::arts_tests::stand_foe(&mut room, 3.0, 0.0, 100.0);
    let blows = [
        (blow_of(player, BlowKind::Swing(Stroke::Down)), foe),
        (blow_of(player, BlowKind::Shot(Ranged::Bow)), foe),
        (blow_of(foe, BlowKind::Swing(Stroke::Down)), player),
        (blow_of(foe, BlowKind::Shot(Ranged::Crossbow)), player),
    ];
    let mut times = |modifiers: Vec<Modifier>| {
        room.run = Some(run_of(modifiers));
        blows.map(|(blow, defender)| room.modded_blow(&blow, defender))
    };
    assert_eq!(times(vec![]), [1.0; 4]);
    assert_eq!(times(vec![Modifier::Brawler]), [1.5, 1.0, 1.0, 1.0]);
    assert_eq!(times(vec![Modifier::Marksman]), [1.0, 1.5, 1.0, 1.0]);
    assert_eq!(times(vec![Modifier::Lightswitch]), [1.0, 1.0, 2.0, 1.0]);
    assert_eq!(times(vec![Modifier::Burn(1)]), [1.0, 1.0, 2.0, 2.0], "a Storm wearer takes twice");
    assert_eq!(times(vec![Modifier::Burn(2)]), [1.0; 4]);
    assert_eq!((room.spell_times(2), room.spell_times(1)), (2.0, 1.0), "Divine's spells deal twice");
    room.run = Some(run_of(vec![Modifier::Trickle, Modifier::Exposure, Modifier::Ironclad]));
    assert_eq!((room.recharge_times(), room.heal_times(), room.shield_chance()), (1.5, 0.5, 0.5));
    room.run = None;
    assert_eq!((room.recharge_times(), room.heal_times(), room.shield_chance()), (1.0, 1.0, 0.2));
}

/// The shields a patrol's garrison stands with, its run's modifiers known before it stands.
fn shields(id: &str, run: Option<Run>) -> Vec<Option<gear::Element>> {
    let ring = vec![[-300.0, -300.0], [300.0, -300.0], [300.0, 300.0], [-300.0, 300.0]];
    let mut room = Room::node(Floor::Flat, Vec::new(), Section { ring, spawns: vec![[0.0, 0.0]] });
    room.world_seed = crate::garrison::node_seed(id);
    room.foes_most = crate::NODE_FOES_MOST;
    room.run = run;
    room.stand_garrison(NodeKind::Patrol, Some((10, 14)));
    room.garrison.iter().flat_map(|post| post.girds.iter().map(|&(_, shield)| shield)).collect()
}

#[test]
fn ironclad_shields_more_foes_and_every_foe_shielded_without_it_keeps_its_shield() {
    let (mut plain, mut ironclad) = (0, 0);
    for id in ["saltgrass-downs", "gullwing-vale", "driftwood-moors", "highwater-glen", "aurora-wastes"] {
        let (without, with) = (shields(id, None), shields(id, Some(run_of(vec![Modifier::Ironclad]))));
        assert_eq!(without.len(), with.len());
        for (one, other) in without.iter().zip(&with) {
            if one.is_some() { assert_eq!(other, one, "{id}: the same shield of the same element"); }
        }
        (plain, ironclad) = (plain + without.iter().flatten().count(), ironclad + with.iter().flatten().count());
    }
    assert!(ironclad > plain, "{ironclad} against {plain}");
}

#[test]
fn juggler_drops_no_ammunition_and_trickle_and_exposure_slow_what_returns() {
    for (modifiers, dropped) in [(vec![], (1, 1)), (vec![Modifier::Juggler], (0, 0))] {
        let mut room = Room::new(Vec::new(), (0.0, 0.0));
        room.run = Some(run_of(modifiers));
        let player = room.join().expect("in");
        let dice = room.dice(player);
        room.drop_spoils(player, None, 4, [2.0, 0.0, 0.0], &dice); // a Miniboss: a box, and a crate taken
        assert_eq!((room.drops.len(), room.players[&player].character.materials.crates), dropped);
    }
    let filled = |modifiers: Vec<Modifier>| {
        let mut room = Room::new(Vec::new(), (0.0, 0.0));
        room.run = Some(run_of(modifiers));
        let player = room.join().expect("in");
        let found = room.players.get_mut(&player).expect("in");
        (found.casting.anima, found.fighter.health) = (0.0, 50.0);
        room.tick();
        room.heal(player, 10.0);
        (room.players[&player].casting.anima, room.players[&player].fighter.health)
    };
    let ((anima, health), (slow, exposed)) = (filled(vec![]), filled(vec![Modifier::Trickle, Modifier::Exposure]));
    assert!(anima > 0.0 && (anima / slow - 1.5).abs() < 1e-9, "two thirds as fast");
    assert_eq!((health, exposed), (60.0, 55.0));
}
```
2. Run `cargo test -p room --lib run_tests`. It should fail to compile: unresolved module `run`.
3. Implement the signatures and every listed edit. `gird_of`'s shield draw is the same roll at a higher bar, so every foe shielded at 0.2 stays shielded with the same element.
4. Run `cargo test -p room -p gear` until it passes, then `cargo xtask check`.
5. Commit: "A run's modifiers, each one hook in the rules".

**Bible.** `Activities.md` "Abyss's rules", the Modifiers bullet: each one's hook and number as above. Add `crates/room/src/run.rs#modded_blow` to `code:`.

---

## Task 7: a dungeon's room for a run: Elite Dungeons, the week's two, the day's, and what they pay

**Files**
- Create `crates/room/src/run_room.rs` and `crates/room/src/run_room_tests.rs`. `run.rs` declares `#[path = "run_room.rs"] mod run_room; pub use run_room::{RunOf, elite_laid};`. `lib.rs` gains `pub use run::{RunOf, elite_laid};`.
- `crates/room/src/dungeon_room.rs`:
  - `laid_dungeon` holds what `dungeon_of` did, takes the laid dungeon, its end foe and its run, and sets `room.run` before the garrison stands.
  - `dungeon_of` calls it with `(REEVE, Miniboss)` and no run, and keeps setting `Place::Node` as Phase 1 does.
  - `dungeon` calls it with `Some(Run::day(patrol, number))` and keeps `Place::PatrolDungeon`.
  - `stand_dungeon_garrison(dungeon, levels, end)` posts `end` instead of `(REEVE, Miniboss)`.
  - `keep_cache` calls `self.pay_clear(player, level, &cache)` after `lay_cache_vestige`.
- `crates/room/src/garrison.rs` `at_seas`: 0 stays 0; otherwise `run.foes_at` when set, else `difficulty.raise`.
- `crates/room/src/power.rs` `pay_kill`: `week_of(self.minute)` is taken before the loop, and after `reward_kill` comes `found.character.boon_xp(week, reward.xp, Some(hand));`.

**Interfaces**
- Consumes Tasks 1, 2, 4, 5 and 6, plus Phase 1's `Room::minute`, `Room::day()`, `set_minute` and `room.place`.
- Produces:
```rust
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RunOf {
    Patrol { patrol: String, number: usize },
    /// An Elite Dungeon by its node's id: the Elite Dungeon at Normal, the week's Elite or Abyss at those.
    Elite { place: String },
    /// A sea island's, by its seed, its style's key and its continent.
    Sea { seed: u32, style: String, continent: String },
}
/// An Elite Dungeon's seed and style, fixed by its place: none for a place that is none.
#[must_use] pub fn elite_laid(place: &str) -> Option<(u32, dungeon::Style)>;   // seed lane::named("elite:{place}")
impl Run { #[must_use] pub fn day(patrol: &str, number: usize) -> Self; }
impl Room {
    /// The room of a run at `tier`, opened at Unix `minute`: none for a dungeon no rule lays, an Elite Dungeon at Elite
    /// or Abyss that is not this week's, or a sea island of no band.
    #[must_use] pub fn dungeon_run(of: &RunOf, tier: gear::Difficulty, minute: u64) -> Option<Self>;
    pub(crate) fn laid_dungeon(name: &str, laid: &Dungeon, levels: Option<(u8, u8)>, end: (u8, Rank), run: Option<Run>) -> Option<Self>;
    /// Pays a player in the room as the cache opens: the day's clear in today's dungeon, the week's in the week it
    /// was opened for; its Vestige lies BONUS_BEFORE_M before the cache.
    pub(crate) fn pay_clear(&mut self, player: PlayerId, level: u8, cache: &Cache);
}
```
- `dungeon_run` rules, each the design's or Phase 2's:

| `of` | World seed name | Levels | End | Pays | Modifiers | Place |
|---|---|---|---|---|---|---|
| Patrol (in `ISLAND_PLACES`, number < 3) | `{patrol}--dungeon-{n}` | its island's band | (REEVE, Miniboss) | `Day` | the day's, if Elite or Abyss and it is today's | PatrolDungeon |
| Elite at Normal | `{place}--elite-dungeon` | its island's band | (its boss, Boss) | Nothing | none | EliteDungeon |
| Elite at Elite or Abyss (this week's) | the same | `(foes_at, foes_at)` | the same | `Week { weekly, week }` | `week_modifiers` | Week(weekly) |
| Sea (band and style known) | `sea-dungeon-{continent}-{style}-{seed:08x}` | its continent's band | (REEVE, Miniboss) | Nothing | none | Node |

  In every case: `revives = (tier == Abyss).then_some(REVIVES)`, `foes_at` only for the week's, then `set_difficulty(tier)` and `set_minute(minute)`.
- `BONUS_BEFORE_M = 1.4`.

**Steps**
1. Write the failing tests in `run_room_tests.rs`:
```rust
const FRIDAY_NINE: u64 = 29_919_420;

/// A character past the prologue at level 10, kept in the room.
fn kept_in(room: &mut Room, character: &gear::Character) -> PlayerId {
    let player = room.join().expect("a room with space");
    assert!(room.restore_character(player, &character.to_json()));
    player
}
fn clear_the_end(room: &mut Room) {
    for id in room.garrison[0].standing.clone() {
        let found = room.foes.get_mut(&id).expect("standing");
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    }
    room.tick();
}
fn vestiges_for(room: &Room, player: PlayerId) -> usize {
    room.drops.iter().filter(|drop| drop.player == player && matches!(drop.what, crate::Dropped::Vestige(_))).count()
}

#[test]
fn every_elite_dungeon_lays_by_its_style_in_four_or_five_blocks_and_ends_at_a_boss_of_its_own() {
    for elite in gear::activities::elite_dungeons() {
        let (seed, style) = elite_laid(elite.id).expect(elite.id);
        assert_eq!(style.key, elite.style);
        assert!((4..=5).contains(&Dungeon::forge_within(seed, style, dungeon::ELITE_BLOCKS).squares.len()));
        assert_eq!(::foes::foe_type(elite.boss).map(|boss| boss.ranks), Some(&[::foes::Rank::Boss][..]));
    }
    for place in ["krakens-grotto", "smugglers-labyrinth", "brine-catacombs"] {
        let room = Room::dungeon_run(&RunOf::Elite { place: place.into() }, gear::Difficulty::Normal, FRIDAY_NINE).expect(place);
        let elite = gear::activities::elite_dungeon(place).expect("one");
        assert_eq!(room.garrison[0].members[0].0, elite.boss);
        assert_eq!(room.garrison[0].members[0].1, ::foes::Rank::Boss);
        assert_eq!(room.place, Some(gear::gate::Place::EliteDungeon));
    }
    assert_eq!(elite_laid("saltgrass-downs"), None);
}

#[test]
fn the_weeks_dungeons_stand_every_foe_at_their_own_level_whatever_the_difficulty_set_after() {
    for (place, tier, level) in [("forsaken-cistern", gear::Difficulty::Elite, 26), ("saltworm-warrens", gear::Difficulty::Abyss, 30)] {
        let mut room = Room::dungeon_run(&RunOf::Elite { place: place.into() }, tier, FRIDAY_NINE).expect(place);
        room.set_difficulty(tier);
        assert!(room.foes.values().all(|foe| foe.level == level), "{place}");
        assert_eq!(room.place, Some(gear::gate::Place::Week(Weekly::of(tier).expect("a week's"))));
    }
    let elite = |place: &str| RunOf::Elite { place: place.into() };
    assert!(Room::dungeon_run(&elite("forsaken-cistern"), gear::Difficulty::Abyss, FRIDAY_NINE).is_none(), "the Elite's, not the Abyss's");
    assert!(Room::dungeon_run(&elite("krakens-grotto"), gear::Difficulty::Elite, FRIDAY_NINE).is_none(), "not this week's");
}

#[test]
fn a_run_carries_its_days_or_weeks_modifiers_and_at_abyss_its_revives() {
    let rules = |of: RunOf, tier| Room::dungeon_run(&of, tier, FRIDAY_NINE).and_then(|room| room.run.map(|run| (run.modifiers, run.revives)));
    let patrol = |patrol: &str, number| RunOf::Patrol { patrol: patrol.into(), number };
    use gear::Difficulty::{Abyss, Elite, Normal};
    assert_eq!(rules(patrol("gullwing-vale", 0), Elite), Some((vec![Modifier::Burn(3)], None)));
    assert_eq!(rules(patrol("gullwing-vale", 0), Abyss), Some((vec![Modifier::Burn(3)], Some(5))));
    assert_eq!(rules(patrol("gullwing-vale", 0), Normal), Some((vec![], None)));
    assert_eq!(rules(patrol("gullwing-vale", 1), Abyss), Some((vec![], Some(5))), "not today's");
    assert_eq!(rules(RunOf::Elite { place: "saltworm-warrens".into() }, Abyss),
        Some((vec![Modifier::Lightswitch, Modifier::Burn(2), Modifier::Juggler], Some(5))));
    assert_eq!(rules(RunOf::Elite { place: "forsaken-cistern".into() }, Elite), Some((vec![Modifier::Brawler], None)));
    assert_eq!(rules(RunOf::Elite { place: "krakens-grotto".into() }, Normal), Some((vec![], None)));
    assert_eq!(rules(patrol("glade", 0), Normal), None, "no island's");
    assert_eq!(rules(patrol("gullwing-vale", 3), Normal), None);
    let sea = |style: &str, continent: &str| RunOf::Sea { seed: 4_242, style: style.into(), continent: continent.into() };
    assert_eq!(rules(sea("caverns", "continent-4"), Abyss), Some((vec![], Some(5))));
    assert_eq!(rules(sea("grotto", "continent-4"), Normal), None);
    assert_eq!(rules(sea("caverns", "continent-0"), Normal), None);
}

#[test]
fn the_first_clear_of_a_tier_on_any_islands_dungeon_of_the_day_pays_once_and_a_clear_again_its_cache_alone() {
    let mut character = gear::Character::starting();
    character.story.prologue = true;
    character.earn_xp(45_000, None); // level 10, which Elite asks
    let run = |patrol: &str, number, tier| Room::dungeon_run(&RunOf::Patrol { patrol: patrol.into(), number }, tier, FRIDAY_NINE).expect(patrol);
    let mut first = run("gullwing-vale", 0, gear::Difficulty::Elite);
    let player = kept_in(&mut first, &character);
    clear_the_end(&mut first);
    assert_eq!(vestiges_for(&first, player), 2, "its cache's and the day's");
    let kept = first.players[&player].character.clone();
    assert_eq!(kept.activity.today.cleared, BTreeSet::from([gear::Difficulty::Elite]));
    let mut other = run("highwater-fells", 2, gear::Difficulty::Elite);
    let again = kept_in(&mut other, &kept);
    clear_the_end(&mut other);
    assert_eq!(vestiges_for(&other, again), 1, "Elite is taken today on every island: its cache alone");
    let mut shared = Room::dungeon("gullwing-vale", 0, Some((1, 4))).expect("the shared Normal room");
    shared.set_minute(FRIDAY_NINE);
    let plain = kept_in(&mut shared, &kept);
    clear_the_end(&mut shared);
    assert_eq!(vestiges_for(&shared, plain), 2, "Normal is its own tier");
    let mut not_today = run("gullwing-vale", 1, gear::Difficulty::Normal);
    let late = kept_in(&mut not_today, &shared.players[&plain].character.clone());
    clear_the_end(&mut not_today);
    assert_eq!(vestiges_for(&not_today, late), 1, "not the dungeon of the day");
}

#[test]
fn a_weeks_run_cleared_after_the_week_turns_pays_as_a_clear_again() {
    let last_minute = 29_925_179; // Tuesday 24 November 2026, 08:59 UTC: week 2,968's last
    for (cleared_at, paid) in [(last_minute, true), (last_minute + 1, false)] {
        let of = RunOf::Elite { place: "saltworm-warrens".into() };
        let mut room = Room::dungeon_run(&of, gear::Difficulty::Abyss, last_minute).expect("week 2,968's Abyss Dungeon");
        let player = room.join().expect("in");
        room.set_minute(cleared_at);
        clear_the_end(&mut room);
        let week = &room.players[&player].character.activity.this_week;
        assert_eq!((week.abyss, week.boon), (paid, paid), "cleared at {cleared_at}");
        assert_eq!(vestiges_for(&room, player), if paid { 2 } else { 1 });
    }
}

#[test]
fn a_kill_under_the_abyss_boon_pays_a_quarter_more_xp() {
    let xp = |boon: bool| {
        let mut room = Room::new(Vec::new(), (0.0, 0.0));
        room.set_minute(FRIDAY_NINE);
        let player = room.join().expect("in");
        room.players.get_mut(&player).expect("in").character.activity.this_week(2_968).boon = boon;
        let foe = crate::arts_tests::stand_foe(&mut room, 2.0, 0.0, 1.0);
        let clock = room.clock;
        room.foes.get_mut(&foe).expect("standing").struck_by.insert(player, (clock, gear::Slot::Melee));
        room.pay_kill(foe);
        room.players[&player].character.xp
    };
    let (plain, boon) = (xp(false), xp(true));
    assert!(plain > 0);
    assert_eq!(boon, plain + plain / 4);
}
```
2. Run `cargo test -p room --lib run_room_tests`. It should fail to compile: no function `dungeon_run`, no `RunOf`.
3. Implement the signatures and the edits listed. Moving the body of `dungeon_of` into `laid_dungeon` changes no existing dungeon: the existing `dungeon_room_tests` and the agreed hash both stay as they are.
4. Run `cargo test -p room -p room-wasm` until it passes, then `cargo xtask check`.
5. Commit: "A dungeon's room for a run: the Elite Dungeons and their Bosses, the week's two at their levels, and what a first clear pays".

**Bible.**
- `Dungeons.md` "In the rooms":
  - "An Elite Dungeon's room": four or five blocks, its Boss on the end post.
  - "A run's room" (`Room::dungeon_run`): the table above.
  - The cache's second Vestige on a first clear.
- `Activities.md` "The Elite Dungeons" and "What it pays, once": as built.
- `Gear.md` "Kills": the Abyss boon's quarter more.
- Add `crates/room/src/run_room.rs#dungeon_run` to `code:` of both pages.

---

## Task 8: Abyss's rules: five shared revives, and a wipe starts the run over

**Files**
- Create `crates/room/src/abyss.rs` and `crates/room/src/abyss_tests.rs`, declared in `run.rs` as `#[path = "abyss.rs"] mod abyss;`.
- `crates/room/src/judging.rs` `EventKind`: `/// Every player in an Abyss run fell at once: the run starts over. Told to each player. Wiped = 14,`.
- `crates/room/src/fallen.rs` `raise_the_dead`:
  - It starts with `if self.wiped() { self.start_over(); return; }`.
  - In the raising loop, `if !self.revive() { continue; }` comes before a player stands.
- `crates/room/src/garrison.rs`: `stand_post` becomes `pub(crate)`.

**Interfaces**
```rust
impl Room {
    /// The revives an Abyss run's company has left; none in any other room.
    #[must_use] pub fn revives(&self) -> Option<u8>;
    /// Whether a fallen player may stand again, taking one of the run's revives if it counts them.
    pub(crate) fn revive(&mut self) -> bool;
    /// Whether an Abyss run has just been wiped: someone is in it, every one of them is down, and its cache is shut.
    pub(crate) fn wiped(&self) -> bool;
    /// Starts an Abyss run over:
    /// - every player is told Wiped;
    /// - every foe, its way and the board's memory of it are gone;
    /// - shots, blows waiting and spells are dropped, and so are drops;
    /// - every post stands again;
    /// - the cache shuts and the revives are back at REVIVES;
    /// - every player stands whole at the way in.
    pub(crate) fn start_over(&mut self);
}
```

**Steps**
1. Write the failing tests in `abyss_tests.rs`:
```rust
const FRIDAY_NINE: u64 = 29_919_420;
fn abyss_run() -> Room {
    let of = RunOf::Patrol { patrol: "gullwing-vale".into(), number: 1 };
    Room::dungeon_run(&of, gear::Difficulty::Abyss, FRIDAY_NINE).expect("an Abyss run")
}
/// A player fallen long enough to stand again at the next tick, if the run lets them.
fn fallen(room: &mut Room, player: PlayerId) {
    let found = room.players.get_mut(&player).expect("in the room");
    (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: combat::tuning::RESPAWN });
}
fn wiped(events: &[Event]) -> Vec<PlayerId> {
    events.iter().filter(|event| event.kind == EventKind::Wiped).map(|event| event.defender).collect()
}

#[test]
fn an_abyss_company_shares_five_revives_and_its_fallen_stay_down_once_none_is_left() {
    let mut room = abyss_run();
    let (first, _second) = (room.join().expect("in"), room.join().expect("in"));
    for left in (0..5).rev() {
        fallen(&mut room, first);
        room.tick();
        assert!(!room.players[&first].fighter.dead(), "stands again, {left} left");
        assert_eq!(room.revives(), Some(left));
    }
    fallen(&mut room, first);
    room.tick();
    assert!(room.players[&first].fighter.dead(), "none left: down");
    assert!(wiped(&room.take_events()).is_empty(), "one still stands");
    let of = RunOf::Patrol { patrol: "gullwing-vale".into(), number: 1 };
    let mut elite = Room::dungeon_run(&of, gear::Difficulty::Elite, FRIDAY_NINE).expect("an Elite run");
    let alone = elite.join().expect("in");
    for _ in 0..6 {
        fallen(&mut elite, alone);
        elite.tick();
        assert!(!elite.players[&alone].fighter.dead(), "below Abyss the dead stand again as ever");
    }
    assert!(wiped(&elite.take_events()).is_empty());
    assert_eq!(elite.revives(), None);
}

#[test]
fn a_run_with_no_one_in_it_is_never_wiped_and_one_revive_stands_one_of_two_fallen_together() {
    let mut room = abyss_run();
    room.tick();
    assert!(wiped(&room.take_events()).is_empty(), "no one in: no wipe");
    let players = [room.join().expect("in"), room.join().expect("in"), room.join().expect("in")];
    room.run.as_mut().expect("a run").revives = Some(1);
    fallen(&mut room, players[0]);
    fallen(&mut room, players[1]);
    room.tick();
    assert_eq!(players.map(|player| room.players[&player].fighter.dead()), [false, true, false], "the first by number takes the last");
    assert_eq!(room.revives(), Some(0));
    for player in players { room.leave(player); }
    room.tick();
    assert!(wiped(&room.take_events()).is_empty(), "left empty: no wipe");
    assert_eq!(room.revives(), Some(0), "nor started over");
}

#[test]
fn when_every_player_is_down_at_once_the_run_starts_over_and_its_five_revives_with_it() {
    let mut room = abyss_run();
    let players = [room.join().expect("in"), room.join().expect("in")];
    let posted: usize = room.garrison.iter().map(|post| post.members.len()).sum();
    room.run.as_mut().expect("a run").revives = Some(2);
    for player in players {
        let found = room.players.get_mut(&player).expect("in");
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    }
    room.tick();
    assert_eq!(wiped(&room.take_events()), players, "each is told");
    assert_eq!(room.revives(), Some(5));
    assert_eq!(room.foes.values().filter(|foe| !foe.fighter.dead()).count(), posted, "every post stands again");
    assert_eq!(room.cache().map(|cache| cache[4]), Some(0.0), "its cache shut");
    let start = room.section.as_ref().expect("a section").spawns[0];
    for player in players {
        let fighter = room.players[&player].fighter;
        assert!(!fighter.dead() && [fighter.body.x, fighter.body.y] == start, "whole at the way in");
    }
    let mut cleared = abyss_run();
    let both = [cleared.join().expect("in"), cleared.join().expect("in")];
    for id in cleared.garrison[0].standing.clone() {
        let found = cleared.foes.get_mut(&id).expect("standing");
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    }
    cleared.tick();
    cleared.take_events();
    for player in both { fallen(&mut cleared, player); }
    cleared.tick();
    assert!(wiped(&cleared.take_events()).is_empty(), "a cleared run is won: no wipe");
}
```
2. Run `cargo test -p room --lib abyss_tests`. It should fail to compile: no method `revives`, no variant `Wiped`.
3. Implement. `wiped()` is `run.revives.is_some() && !self.players.is_empty() && every player's fighter.dead() && !cache open`.
4. Run `cargo test -p room` until it passes, then `cargo xtask check`.
5. Commit: "Abyss's rules: five revives a company shares, and a wipe starts the run over".

**Bible.**
- `Activities.md` "Abyss's rules": as built, with no wipe once the cache stands open.
- `Server.md` "The room", the dead bullet: in an Abyss run each stand takes one of the company's revives; when all are down at once, it starts over.
- `Dungeons.md` "In the rooms": the same in a line.

---

## Task 9: an Elite Dungeon's node gains its entrance

**Files**
- `crates/room/src/entrances.rs`:
  - `laid` takes `dungeons: &[(u32, dungeon::Style)]` in place of drawing `of_patrol` itself, and stops at `dungeons.len()`.
  - `impl Room` gains `lay_elite_entrance`.
- `crates/room/src/patrol.rs` `start_patrol`: passes `(0..PER_PATROL).map(|number| dungeon::of_patrol(node, number))`.
- `crates/room/src/entrance_tests.rs`: appended.

**Interfaces**
```rust
pub(crate) fn laid(node: &str, dungeons: &[(u32, dungeon::Style)], floor: &dyn Terrain, dry: &dyn Fn(f64, f64) -> bool,
                   ring: &[[f64; 2]], spawns: &[[f64; 2]], spots: &[[f64; 2]]) -> Vec<Entrance>;
impl Room {
    /// Lays an Elite Dungeon's node's one entrance, drawn as a patrol's are from its id; none for a node that is none.
    pub fn lay_elite_entrance(&mut self, node: &str);   // patrol = Some(Patrol { entrances, ..default })
}
```

**Steps**
1. Write the failing test:
```rust
#[test]
fn an_elite_dungeons_node_lays_one_entrance_of_its_style_and_is_joined_before_it() {
    let mut room = Room::node(Floor::Flat, Vec::new(), Section { ring: ring(), spawns: SPAWNS.to_vec() });
    room.lay_elite_entrance("krakens-grotto");
    assert_eq!(room.entrances().len(), 1);
    let (seed, style) = crate::elite_laid("krakens-grotto").expect("an Elite Dungeon");
    assert_eq!(room.entrances()[0].model, crate::entrances::model_of(&style, seed));
    assert!([4, 5].contains(&room.entrances()[0].model), "the caverns': a cave mouth");
    assert!(room.join_at(0).is_some());
    assert!(room.join_at(1).is_none());
    let mut patrol_land = Room::node(Floor::Flat, Vec::new(), Section { ring: ring(), spawns: SPAWNS.to_vec() });
    patrol_land.lay_elite_entrance("saltgrass-downs");
    assert!(patrol_land.entrances().is_empty(), "a patrol is no Elite Dungeon");
}
```
2. Run `cargo test -p room --lib entrance_tests`. It should fail to compile: no method `lay_elite_entrance`.
3. Implement. The patrol's pinned entrances (`a_patrol_lays_its_three_entrances_the_same_every_time…`) stay as they are: the dice, the order and the draws do not change.
4. Run `cargo test -p room`, then `cargo xtask check`.
5. Commit: "An Elite Dungeon's node keeps its open-air approach and gains its entrance".

**Bible.** `Dungeons.md` "The entrances": an Elite Dungeon's node lays one, drawn as a patrol's are.

---

## Task 10: the room module's doors: runs, what is on, Elite layouts, and the revives on the wire

**Files**
- `crates/protocol/messages.fbs` `Snapshot`, after `cache`:
  `// In an Abyss run, the revives its company has left; -1 in any other room.` then `revives: byte = -1;`.
- `crates/protocol/src/lib.rs`: `Snapshot` gains `pub revives: Option<u8>`, written as `revives.map_or(-1, |left| i8::try_from(left).unwrap_or(i8::MAX))`. `protocol_tests.rs` literals gain `revives: None`.
- `crates/room-wasm/src/lib.rs`:
  - `snapshot()` passes `revives: room.revives()`.
  - `open_node` calls `room.lay_elite_entrance(&node.id)` when `node.kind == NodeKind::Dungeon`.
  - `mod run_door; pub use run_door::{activities_json, open_run};`.
- Create `crates/room-wasm/src/run_door.rs`, with tests in its own `#[cfg(test)] mod tests`.
- `crates/room-wasm/src/dungeon_door.rs`:
  - `Asked` gains `place: Option<String>`.
  - `asked` answers `(u32, Style, (usize, usize))`: `(Some(place), …) => room::elite_laid(&place)` with `ELITE_BLOCKS`, and `BLOCKS` otherwise.
  - `dungeon_json` forges with `forge_within`, and names a place's dungeon by its `name` as given.
- `crates/room-wasm/src/fighter_door.rs` `set_dungeon`: `forge_within`.
- `server/roomDoor.ts`: `openRun`, `activities` and `layout` on `RoomDoor`, `room_open_run` and `room_activities` on `RoomExports`, and their bindings.
- `client/src/network/messages.ts`: the land snapshot gains `/** In an Abyss run, the revives its company has left; -1 in any other room. */ readonly revives: number;`, read as `snapshot.revives()`.
- Tests: `run_door.rs` tests, `door_tests.rs` appended, `server/roomDoor.test.ts` appended.

**Interfaces**
```rust
// run_door.rs. The ask: {"dungeon": {"patrol","number"} | {"place"} | {"seed","style","continent"}, "tier": 0..=2, "minute": u64}
pub fn open_run(text: &[u8]) -> bool;
#[unsafe(no_mangle)] pub unsafe extern "C" fn room_open_run(address: *const u8, length: usize) -> u32;
/// {"day","week","untilDay","untilWeek","ofTheDay":[{"continent","patrol","number"}×9],"dayModifier",
///  "weekElite":{"place","modifiers":[key]},"weekAbyss":{…}}
pub fn activities_json(minute: u64) -> String;
#[unsafe(no_mangle)] pub extern "C" fn room_activities(minute: u32) -> u64;
```
```ts
openRun(ask: string): boolean;          // RoomDoor
activities(minute: number): string;     // RoomDoor
layout(ask: string): string;            // RoomDoor: room_dungeon with any ask (a patrol's, a place's, a seed's)
room_open_run(address: number, length: number): number;   // RoomExports
room_activities(minute: number): bigint;                  // RoomExports
```

**Steps**
1. Write the failing tests:
   - `run_door.rs`:
```rust
fn ask(dungeon: Value, tier: u8) -> String { json!({ "dungeon": dungeon, "tier": tier, "minute": 29_919_420_u64 }).to_string() }
fn revives() -> i8 {
    crate::room_tick();
    let bytes = crate::snapshot();
    protocol::messages::root_as_from_room(&bytes).expect("read").snapshot().expect("a snapshot").revives()
}

#[test]
fn a_run_opens_from_its_ask_at_its_tier_with_its_revives_and_refuses_what_no_rule_lays() {
    assert!(open_run(ask(json!({ "place": "saltworm-warrens" }), 2).as_bytes()));
    assert_ne!(crate::room_join(), 0);
    assert_eq!(revives(), 5);
    assert!(open_run(ask(json!({ "patrol": "gullwing-vale", "number": 0 }), 1).as_bytes()));
    assert_eq!(revives(), -1, "an Elite run counts none");
    assert!(open_run(ask(json!({ "seed": 4_242, "style": "caverns", "continent": "continent-4" }), 0).as_bytes()));
    assert!(!open_run(ask(json!({ "place": "krakens-grotto" }), 2).as_bytes()), "not this week's Abyss");
    assert!(!open_run(ask(json!({ "seed": 4_242, "style": "caverns", "continent": "continent-0" }), 0).as_bytes()));
    assert!(!open_run(ask(json!({ "place": "krakens-grotto" }), 3).as_bytes()), "no fourth tier");
    assert!(!open_run(b"not an ask"));
}

#[test]
fn what_is_on_reads_as_the_rules_draw_it() {
    let on: Value = serde_json::from_str(&activities_json(29_919_420)).expect("JSON");
    assert_eq!([&on["day"], &on["week"], &on["untilDay"], &on["untilWeek"]], [20_778, 2_968, 1_440, 5_760].map(|n| json!(n)).each_ref());
    assert_eq!(on["ofTheDay"].as_array().map(Vec::len), Some(9));
    assert_eq!(on["ofTheDay"][0], json!({ "continent": "continent-1", "patrol": "gullwing-vale", "number": 0 }));
    assert_eq!(on["dayModifier"], "burn-shadow");
    assert_eq!(on["weekElite"], json!({ "place": "forsaken-cistern", "modifiers": ["brawler"] }));
    assert_eq!(on["weekAbyss"], json!({ "place": "saltworm-warrens", "modifiers": ["lightswitch", "burn-divine", "juggler"] }));
}
```
   - `door_tests.rs`:
```rust
#[test]
fn an_elite_dungeon_is_laid_for_a_browser_by_its_place_and_its_node_sends_its_one_entrance() {
    let ask = br#"{"place":"krakens-grotto","name":"Kraken's Grotto"}"#;
    let laid: Value = serde_json::from_str(&dungeon_door::dungeon_json(ask)).unwrap();
    assert_eq!((laid["name"].as_str(), laid["style"].as_str()), (Some("Kraken's Grotto"), Some("caverns")));
    let (seed, style) = room::elite_laid("krakens-grotto").unwrap();
    let native = dungeon::Dungeon::forge_within(seed, style, dungeon::ELITE_BLOCKS);
    assert_eq!((laid["columns"].as_u64(), laid["rows"].as_u64()), (Some(native.columns as u64), Some(native.rows as u64)));
    assert_eq!(dungeon_door::dungeon_json(br#"{"place":"saltgrass-downs","name":"x"}"#), "null");
    assert!(set_dungeon(ask));
    let mut node = node_file();
    node["id"] = json!("krakens-grotto");
    node["kind"] = json!("dungeon");
    node["continent"] = json!("continent-1");
    node["ring"] = json!([[-800.0, -800.0], [800.0, -800.0], [800.0, 800.0], [-800.0, 800.0]]);
    node["bounds"] = json!([-900.0, -900.0, 900.0, 900.0]);
    assert!(open_node(node.to_string().as_bytes()));
    let player = dungeon_door::room_join_at(0);
    assert_ne!(player, 0);
    assert_eq!(dungeon_door::room_join_at(1), 0, "one entrance");
}
```
   - `server/roomDoor.test.ts`:
```ts
test('a run’s room opens from its ask with its revives, and what is on reads as the rules draw it', () => {
  const room = startRoomDoor(compiled);
  const friday = 29_919_420;
  const on = JSON.parse(room.activities(friday)) as { day: number; week: number; dayModifier: string; weekAbyss: unknown };
  assert.deepEqual([on.day, on.week, on.dayModifier], [20_778, 2_968, 'burn-shadow']);
  assert.deepEqual(on.weekAbyss, { place: 'saltworm-warrens', modifiers: ['lightswitch', 'burn-divine', 'juggler'] });
  assert.equal(room.openRun(JSON.stringify({ dungeon: { place: 'saltworm-warrens' }, tier: 2, minute: friday })), true);
  room.join();
  room.tick();
  assert.equal((readFromRoom(room.snapshot()) as { revives: number }).revives, 5);
  assert.equal(room.openRun(JSON.stringify({ dungeon: { place: 'krakens-grotto' }, tier: 2, minute: friday })), false);
  const laid = JSON.parse(room.layout(JSON.stringify({ place: 'krakens-grotto', name: 'Kraken’s Grotto' }))) as { name: string; style: string };
  assert.deepEqual([laid.name, laid.style], ['Kraken’s Grotto', 'caverns']);
});
```
2. Run `cargo test -p room-wasm`. It should fail to compile: unresolved `run_door`, no method `revives`. Then run `npm run wasm && node --import ./tools/testStyles.mjs --test server/roomDoor.test.ts`, which should fail with "room.activities is not a function".
3. Implement. `open_run` reads the JSON with serde into an `#[serde(untagged)]` enum, in this order: patrol, place, seed. Tier 0 to 2 maps to `Difficulty::ALL`. On success it `keep`s `Opened::Land { room, node: None }`. Run `npm run schema` after the `.fbs` edit.
4. Run `cargo test -p protocol -p room-wasm`, then `npm run wasm && npm test`, then `cargo xtask check`.
5. Commit: "The room module opens a run from its ask, says what is on, lays an Elite Dungeon by its place, and sends the revives".

**Bible.**
- `Server.md` "Messages": the snapshot's `revives`.
- `Dungeons.md`, the paragraph on `room_dungeon`: a place's ask lays an Elite Dungeon, named as given.
- `Server.md` "The room": `open_run` and `activities`.
- Add `crates/room-wasm/src/run_door.rs#open_run` to `code:`.

---

## Task 11: the server's runs: names, rooms opened and forgotten, and the company kept to its own

**Files**
- `server/roomNames.ts`: `nodeRoom` gains `run`; `seaDungeonRoom`, `runAsk` and `privateRun` are added.
- `server/roomNames.test.ts`: appended.
- `server/worker.ts`:
  - `openRoom`: when `runAsk(name, minute)` answers an ask, it opens with `this.room.openRun(ask) && this.room.reseed(seeds)` before the `node-` path, with no node file.
  - The keeper keeps characters for names starting `node-` or `sea-dungeon-`.
  - `privateRun(name)` sets `this.keeper.forCompany()`.
  - `RUN_LINGER_MS`, a `closing` timer, `left()` starting it, `fetch` clearing it.
  - The `characters` adapter gains `companions: (account) => accounts.companions(account)`.
  - The class doc names runs.
- `server/keeping.ts`: `Characters` adds `'companions'`; `forCompany()`; the company check in `signIn`, after Phase 1's gate.
- `server/keeping.test.ts`: appended.
- `server/accounts/companies.ts`: `companionsOf`. `server/accounts/characters.ts`: `Characters.companions`, implemented with it. `server/accounts/worker.ts` `CharacterKeeper.companions`.
- `server/accounts/roster.test.ts`: appended.
- `crates/bake/src/lib.rs`: `LONGEST_ENDING = "--abyss--dungeon-2--run-00000000"`, its doc, and its test at 27 and 28.

**Interfaces**
```ts
// server/roomNames.ts
/** A run's instance: eight lowercase letters or digits, after `--run-` at a room name's end. */
export const RUN_ENDING = /--run-[a-z0-9]{8}$/;
export function nodeRoom(name: string): { readonly id: string; readonly seas: number; readonly dungeon: number | null; readonly run: string | null } | null;
export function seaDungeonRoom(name: string): { readonly continent: string; readonly style: string; readonly seed: number; readonly seas: number; readonly run: string | null } | null;
/** The ask `open_run` opens a dungeon's room from, by its name and the minute it opens: null for a name that is no
 *  run or sea island's dungeon (a patrol's shared Normal dungeon opens from its patrol's file). */
export function runAsk(room: string, minute: number): string | null;
export function privateRun(room: string): boolean;   // RUN_ENDING.test(room)
// server/accounts/companies.ts
export async function companionsOf(database: Db, account: string): Promise<string[]>; // members longest first, or [account]
// Characters (accounts) and CharacterKeeper
companions(account: string): Promise<string[]>;
// server/keeping.ts
/** Keeps this room to one company: a character is given only while no one is kept here, or to one in the company of
 *  someone kept here; any other is let go untouched, its player sent away with the reason. */
forCompany(): this;
// server/worker.ts
/** How long an emptied run's room stays as its company left it, through a dropped connection, before it is forgotten. */
const RUN_LINGER_MS = 60_000;
```
- **Names:**
  - `node-<id>`, `--elite`, `--abyss` (as now).
  - `node-<patrol>--dungeon-<n>` (shared, Normal).
  - `node-<patrol>--{elite|abyss}--dungeon-<n>--run-<i>`.
  - `node-<elite id>--run-<i>` (the Elite Dungeon).
  - `node-<elite id>--{elite|abyss}--run-<i>` (the week's).
  - `sea-dungeon-<continent-n>-<style>-<seed 8 hex>` (shared, Normal), and `…--{elite|abyss}--run-<i>`.
  - Refused: an Elite or Abyss dungeon without `--run-`, and a Normal patrol dungeon with one.
- **The refusal reason** for another company is `"This run is another company's."`. It is sent through Phase 1's `lost(player, why)`, so it closes the socket with 4003.

**Steps**
1. Write the failing tests.
   - `server/roomNames.test.ts`:
```ts
test('a run is a room of its own: an instance after its dungeon, at Elite and Abyss and for every Elite Dungeon', () => {
  assert.deepEqual(nodeRoom('saltgrass-downs--abyss--dungeon-2--run-k3j4h5g6'), { id: 'saltgrass-downs', seas: 2, dungeon: 2, run: 'k3j4h5g6' });
  assert.deepEqual(nodeRoom('krakens-grotto--run-k3j4h5g6'), { id: 'krakens-grotto', seas: 0, dungeon: null, run: 'k3j4h5g6' });
  assert.deepEqual(nodeRoom('saltworm-warrens--abyss--run-k3j4h5g6'), { id: 'saltworm-warrens', seas: 2, dungeon: null, run: 'k3j4h5g6' });
  assert.deepEqual(nodeRoom('saltgrass-downs--dungeon-1'), { id: 'saltgrass-downs', seas: 0, dungeon: 1, run: null });
  assert.deepEqual(nodeRoom('tidewall--elite'), { id: 'tidewall', seas: 1, dungeon: null, run: null });
});

test('no room name opens a shared Elite or Abyss dungeon, a private Normal one, or a run without its whole instance', () => {
  for (const name of [
    'saltgrass-downs--elite--dungeon-0',
    'saltgrass-downs--dungeon-0--run-k3j4h5g6',
    'krakens-grotto--run-k3j4h5g',
    'krakens-grotto--run-k3j4h5g6x',
    'krakens-grotto--run-K3J4H5G6',
    'krakens-grotto--run-',
    'krakens-grotto--run-k3j4h5g6--run-a1b2c3d4',
    'krakens-grotto--elite--run-k3j4h5g6--dungeon-0',
    'krakens-grotto--normal--run-k3j4h5g6',
  ])
    assert.equal(nodeRoom(name), null, name);
  assert.deepEqual(seaDungeonRoom('sea-dungeon-continent-4-caverns-0a1b2c3d'),
    { continent: 'continent-4', style: 'caverns', seed: 169_552_957, seas: 0, run: null });
  assert.deepEqual(seaDungeonRoom('sea-dungeon-continent-4-caverns-0a1b2c3d--abyss--run-k3j4h5g6'),
    { continent: 'continent-4', style: 'caverns', seed: 169_552_957, seas: 2, run: 'k3j4h5g6' });
  for (const name of [
    'sea-dungeon-continent-4-caverns-0a1b2c3d--abyss',
    'sea-dungeon-continent-4-caverns-0a1b2c3',
    'sea-dungeon-continent-4-caverns-0A1B2C3D',
    'sea-dungeon-continent-4-caverns-0a1b2c3d--run-k3j4h5g6',
    'sea-dungeon-continent-10-caverns-0a1b2c3d',
    'sea-dungeon-4-caverns-0a1b2c3d',
  ])
    assert.equal(seaDungeonRoom(name), null, name);
  assert.ok('sea-dungeon-continent-9-sanctum-ffffffff--abyss--run-zzzzzzzz'.length <= 64);
  assert.ok('node-thunderhoof-grasslands--abyss--dungeon-2--run-zzzzzzzz'.length <= 64);
});

test('each run’s name makes the ask its room opens from', () => {
  const asked = (room: string) => JSON.parse(runAsk(room, 29_919_420) ?? 'null') as unknown;
  assert.deepEqual(asked('node-saltgrass-downs--elite--dungeon-0--run-k3j4h5g6'),
    { dungeon: { patrol: 'saltgrass-downs', number: 0 }, tier: 1, minute: 29_919_420 });
  assert.deepEqual(asked('node-saltworm-warrens--abyss--run-k3j4h5g6'), { dungeon: { place: 'saltworm-warrens' }, tier: 2, minute: 29_919_420 });
  assert.deepEqual(asked('sea-dungeon-continent-4-caverns-0a1b2c3d'),
    { dungeon: { seed: 169_552_957, style: 'caverns', continent: 'continent-4' }, tier: 0, minute: 29_919_420 });
  assert.equal(runAsk('node-saltgrass-downs--dungeon-0', 1), null, 'a shared dungeon opens from its patrol’s file');
  assert.equal(runAsk('node-saltgrass-downs', 1), null);
  assert.equal(runAsk('sea', 1), null);
  assert.deepEqual([privateRun('node-krakens-grotto--run-k3j4h5g6'), privateRun('sea-dungeon-continent-4-caverns-0a1b2c3d')], [true, false]);
});
```
   - `server/keeping.test.ts`. Use `accounts()` from `accounts/accountsForTests.ts`, as `roster.test.ts`'s `world` does.
```ts
test('a run’s room keeps only the company of those kept in it, and anyone once none is', async () => {
  const made = accounts();
  const tokens: Record<string, string> = {};
  for (const name of ['Ada', 'Ben', 'Cal']) {
    tokens[name] = (await made.ask('POST', '/v1/guest')).body['token'] as string;
    await made.ask('POST', '/v1/register', { username: name, password: 'long enough' }, tokens[name]);
  }
  await made.ask('POST', '/v1/social/company/invite', { name: 'Ben' }, tokens['Ada']);
  await made.ask('POST', '/v1/social/company/accept', { name: 'Ada' }, tokens['Ben']);
  const kept = characters(made.deps.database, () => made.clock.now, () => Promise.resolve());
  const room = roomOf();
  for (const player of [1, 2, 3, 4]) room.held.set(player, '{"starting":true}');
  const sent: [number, string | undefined][] = [];
  const keeper = new Keeper(kept, room, 'node-krakens-grotto--run-k3j4h5g6', (player, why) => sent.push([player, why])).forCompany();
  const [now, here] = [() => made.clock.now, () => true];
  assert.equal(await keeper.signIn(1, tokens['Ada'] ?? '', now, here), true, 'the first comes in');
  assert.equal(await keeper.signIn(2, tokens['Cal'] ?? '', now, here), false);
  assert.deepEqual(sent, [[2, "This run is another company's."]]);
  assert.equal(room.held.get(2), '{"starting":true}', 'never given the kept character');
  assert.equal(await keeper.signIn(3, tokens['Ben'] ?? '', now, here), true, 'in Ada’s company');
  await keeper.leave(1);
  await keeper.leave(3);
  assert.equal(await keeper.signIn(4, tokens['Cal'] ?? '', now, here), true, 'none kept: open to whoever has the name');
});
```
   - `server/accounts/roster.test.ts`:
```ts
test('a player’s companions are their company’s members, longest there first, or themselves alone', async () => {
  const { player, kept, tokens } = await world('Ada', 'Ben', 'Cal');
  await player('Ada').ask('company/invite', { name: 'Ben' });
  await player('Ben').ask('company/accept', { name: 'Ada' });
  const account = async (name: string) => (await kept.claim(tokens[name] ?? '', `room:${name}`))?.account ?? '';
  const [ada, ben, cal] = [await account('Ada'), await account('Ben'), await account('Cal')];
  assert.deepEqual(await kept.companions(ben), [ada, ben]);
  assert.deepEqual(await kept.companions(cal), [cal]);
});
```
   - `crates/bake/src/lib.rs` test: `"a".repeat(27)` is `None` with the message "node-, 27 and --abyss--dungeon-2--run-00000000 make 64", and `"a".repeat(28)` is a problem.
2. Run them.
   - `node --import ./tools/testStyles.mjs --test server/roomNames.test.ts server/keeping.test.ts server/accounts/roster.test.ts` should fail: `seaDungeonRoom` is not exported, and `forCompany`/`companions` are not functions.
   - `cargo test -p bake` should fail on the 41-character assertion's replacement.
3. Implement. `nodeRoom` pops a trailing `--run-<i>` first, then `--dungeon-<n>`, and then:
   - Refuses `dungeon !== null` unless `(seas === 0) === (run === null)`.
   - Refuses `--normal`, as now.
   - An instance that is not `[a-z0-9]{8}` makes the name null.
   - In `worker.ts`, `left()` with no socket open in a private run sets `this.closing = setTimeout(() => { this.closing = null; if (this.open().length === 0) this.opened = null; }, RUN_LINGER_MS)`. `fetch` clears it on a join.
4. Run `npm test`, `cargo test -p bake`, then `cargo xtask check`. Then, against `npm run server` with accounts on this machine, enter `node-saltgrass-downs--abyss--dungeon-1--run-a1b2c3d4` from two tabs signed in as members of one company: both should be in one room. A third, outside the company, should be sent to their ship with "This run is another company's.". That check is offline.
5. Commit: "Runs are rooms of their own: named by an instance, opened without a node file, forgotten a minute after their company leaves, and kept to the company".

**Bible.**
- `Server.md`:
  - "The host": the run names above, `runAsk`, `RUN_LINGER_MS`, and `forCompany`.
  - `Activities.md` "Runs and companies": as built.
  - The router's line on names: `sea-dungeon-` names.
- `Accounts.md` "The character, kept": a run lets in only the company of someone kept in it (`companions`).
- `Dungeons.md` "A room for each at each sea": Normal shared, Elite and Abyss runs.

---

## Task 12: the page names runs, asks any dungeon by one ask, and reads what is on

**Files**
- `client/src/game/rooms.ts`: `nodeOfRoom` gains `run` (its pattern ends `(?:--dungeon-([0-2]))?(?:--run-([a-z0-9]{8}))?$`). New: `runInstance`, `runOf`, `sharedRun`, `companyPlaces`.
- `client/src/game/rooms.test.ts`: appended.
- `client/src/game/rosterRows.ts` `placeWords`: a run with no dungeon reads "· Elite Dungeon" at Normal, or "· Elite Dungeon of the week" / "· Abyss Dungeon of the week", with no difficulty word. `rosterRows.test.ts` is appended.
- `client/src/game/dungeonLayout.ts`: `DungeonAsk`, `askLayout`. `askDungeon` and `askDungeonOf` call `askLayout`. `dungeonLayout.test.ts` is appended.
- `client/src/rules/combatRules.ts`: `setDungeon(ask: DungeonAsk)`. Its caller `standInDungeon` (`client/src/game/footTrips.ts`) takes the ask, and `Foot.enterDungeon` passes `{ patrol: patrol.node.id, name: patrol.node.name, number }` for now.
- `client/src/network/localRoom.ts`: `openRun`.
- Create `client/src/game/activities.ts` and `client/src/game/activities.test.ts`.

**Interfaces**
```ts
// dungeonLayout.ts
/** Which dungeon, as the room module's `room_dungeon` and `fighter_dungeon` read it: a patrol's by its number, an
 *  Elite Dungeon by its place, or one laid by a seed and a style (a sea island's). */
export type DungeonAsk =
  | { readonly patrol: string; readonly name: string; readonly number: number }
  | { readonly place: string; readonly name: string }
  | { readonly seed: number; readonly style: StyleKey; readonly name: string };
export function askLayout(module: WebAssembly.Module, ask: DungeonAsk): DungeonLayout;
// combatRules.ts
setDungeon(ask: DungeonAsk): boolean;
// localRoom.ts
static openRun(module: WebAssembly.Module, ask: string, snapshot: (snapshot: Snapshot) => void, gear?: (gear: GearMessage) => void): LocalRoom;
// rooms.ts
export function runInstance(random?: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array): string;  // 8 of a-z0-9, byte % 36
export function runOf(base: string, instance: string): string;                                  // `${base}--run-${instance}`
export function sharedRun(base: string, places: readonly (string | null)[]): string | null;     // a member's run of `base`
export function companyPlaces(link: AccountLink | null): Promise<string[]>;                     // a fresh Roster's company places
// activities.ts
export interface Activities {
  readonly day: number; readonly week: number; readonly untilDay: number; readonly untilWeek: number;
  readonly ofTheDay: readonly { readonly continent: string; readonly patrol: string; readonly number: number }[];
  readonly dayModifier: string;
  readonly weekElite: { readonly place: string; readonly modifiers: readonly string[] };
  readonly weekAbyss: { readonly place: string; readonly modifiers: readonly string[] };
}
export function activitiesAt(module: WebAssembly.Module, minute: number): Activities;
/** The run an Elite Dungeon's entrance opens at a difficulty: the week's Elite or Abyss where this place is it, else
 *  the Elite Dungeon at Normal; and what it is called. */
export function eliteRun(place: string, seas: Difficulty, on: Activities): { readonly seas: Difficulty; readonly words: string };
```

**Steps**
1. Write the failing tests.
   - `rooms.test.ts`:
```ts
test('a dungeon at Elite or Abyss and every Elite Dungeon is a run, joined where the company already is', () => {
  const base = dungeonRoom({ id: 'saltgrass-downs' }, 'abyss', 2);
  assert.equal(runOf(base, 'k3j4h5g6'), 'node-saltgrass-downs--abyss--dungeon-2--run-k3j4h5g6');
  assert.equal(runOf(nodeRoom({ id: 'krakens-grotto', kind: 'dungeon' }, 'normal'), 'k3j4h5g6'), 'node-krakens-grotto--run-k3j4h5g6');
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs--abyss--dungeon-2--run-k3j4h5g6'),
    { id: 'saltgrass-downs', seas: 'abyss', dungeon: 2, run: 'k3j4h5g6' });
  assert.deepEqual(nodeOfRoom('node-krakens-grotto--run-k3j4h5g6'), { id: 'krakens-grotto', seas: 'normal', dungeon: null, run: 'k3j4h5g6' });
  const places = [null, 'node-saltgrass-downs', `${base}--run-m9n8b7v6`, 'node-saltgrass-downs--abyss--dungeon-1--run-a1b2c3d4'];
  assert.equal(sharedRun(base, places), `${base}--run-m9n8b7v6`);
  assert.equal(sharedRun(dungeonRoom({ id: 'saltgrass-downs' }, 'elite', 2), places), null, 'another tier is another run');
  assert.match(runInstance(), /^[a-z0-9]{8}$/);
  assert.equal(runInstance((bytes) => bytes.fill(0)), 'aaaaaaaa');
  assert.equal(runInstance((bytes) => bytes.fill(35)), '99999999');
});
```
   - `rosterRows.test.ts`:
```ts
assert.equal(placeWords('node-saltgrass-downs--abyss--dungeon-2--run-k3j4h5g6'), 'Saltgrass Downs · Dungeon · Abyss difficulty');
assert.equal(placeWords('node-krakens-grotto--run-k3j4h5g6'), 'Krakens Grotto · Elite Dungeon');
assert.equal(placeWords('node-saltworm-warrens--abyss--run-k3j4h5g6'), 'Saltworm Warrens · Abyss Dungeon of the week');
```
   - `activities.test.ts`. Read the module as `dungeonTrips.test.ts` does.
```ts
test('what is on reads from the rules, and an Elite Dungeon’s entrance opens the week’s run only where it is', async () => {
  const on = activitiesAt(await module, 29_919_420);
  assert.deepEqual([on.day, on.week, on.weekElite.place, on.weekAbyss.place], [20_778, 2_968, 'forsaken-cistern', 'saltworm-warrens']);
  assert.deepEqual(eliteRun('saltworm-warrens', 'abyss', on), { seas: 'abyss', words: 'Abyss Dungeon of the week' });
  assert.deepEqual(eliteRun('forsaken-cistern', 'elite', on), { seas: 'elite', words: 'Elite Dungeon of the week' });
  assert.deepEqual(eliteRun('forsaken-cistern', 'abyss', on), { seas: 'normal', words: 'Elite Dungeon' });
  assert.deepEqual(eliteRun('krakens-grotto', 'normal', on), { seas: 'normal', words: 'Elite Dungeon' });
});
```
   - `dungeonLayout.test.ts`:
```ts
test('an Elite Dungeon is laid by its place, named as it is, four or five blocks long', async () => {
  const layout = askLayout(await module, { place: 'krakens-grotto', name: 'Kraken’s Grotto' });
  assert.deepEqual([layout.name, layout.style], ['Kraken’s Grotto', 'caverns']);
  assert.ok(layout.columns * layout.rows >= 4 * 16 * 16);
  assert.equal(askLayout(await module, { patrol: 'saltgrass-downs', name: 'The Saltgrass Downs', number: 0 }).name,
    askDungeon(await module, 'saltgrass-downs', 'The Saltgrass Downs', 0).name);
});
```
2. Run `node --import ./tools/testStyles.mjs --test client/src/game/rooms.test.ts client/src/game/rosterRows.test.ts client/src/game/activities.test.ts client/src/game/dungeonLayout.test.ts`. It should fail: `runOf` is not exported and `./activities.ts` is missing.
3. Implement. `activitiesAt` and `askLayout` keep one door per module, as `dungeonLayout.ts`'s `doors` already does.
4. Run `npm test`, then `cargo xtask check`.
5. Commit: "The page names runs, finds its company's, asks any dungeon by one ask, and reads what is on".

**Bible.** `Game.md` "Rooms": a run's name and how the page joins its company's. `Dungeons.md` "In the Game": `askLayout` and the place ask.

---

## Task 13: the page's trips: Elite Dungeons, runs, a company's run, and a sea island's

**Files**
- `client/src/game/footTrips.ts`:
  - `InDungeon` gains `ask` and `room`.
  - `standInDungeon(movement, combat, ask)`.
  - `Entrances.nameOf` answers a `dungeon` node's own name.
  - `tripAt` offers Enter at a `patrol` or a `dungeon` node.
- `client/src/game/dungeonTrips.ts`:
  - `TripGame.intoDungeon(outside, dungeon, layout, seas)`.
  - `TripGame.companyPlaces`.
  - `dungeonTrips(game, chance?)`: `enter` picks the run, and `join(node, place)` replaces `join(patrol, number, seas)`.
  - `enterSea`.
  - The way out is kept as a closure taken at entry.
- `client/src/game/foot.ts` `Foot.enterDungeon(context, outside, dungeon, layout, seas)`:
  - The address is `context.rooms?.(dungeon.room)`.
  - Alone, the page opens `LocalRoom.openDungeon` when `runAsk(dungeon.room, minute)` is null, else `LocalRoom.openRun(module, ask, …)`.
- `client/src/game/game.ts`:
  - `intoDungeon` passes the new arguments.
  - `companyPlaces: () => companyPlaces(<the page's account link>)`.
  - `joinAt` calls `trips.join(node, place)` when `where.dungeon !== null || where.run !== null`.
- `client/src/game/dungeonTrips.test.ts`: `recorded` is updated, and tests are appended.

**Interfaces**
```ts
export interface InDungeon { readonly patrol: NodeInfo; readonly number: number; readonly ask: DungeonAsk; readonly room: string; readonly layout: DungeonLayout }
/** A sea island's door, as the island's room stands it: its middle and the way it faces, outward (radians clockwise
 *  from north). */
export interface IslandDoor { readonly x: number; readonly y: number; readonly bearing: number }
/** Where a sea island's dungeon leads back to: the island's place, its door, and the way onto it, which the island's
 *  side gives. */
export interface IslandBack {
  readonly node: NodeInfo;
  readonly door: IslandDoor;
  onto(at: { readonly x: number; readonly y: number; readonly facing: number }): Promise<void>;
}
export interface TripGame {
  // …as now, but:
  readonly intoDungeon: (outside: { readonly node: NodeInfo; readonly text: string },
    dungeon: { readonly number: number; readonly ask: DungeonAsk; readonly room: string }, layout: DungeonLayout, seas: Difficulty) => Promise<void>;
  readonly companyPlaces: () => Promise<readonly (string | null)[]>;
}
export function dungeonTrips(game: TripGame, chance?: { readonly instance: () => string; readonly minute: () => number }): {
  enter(number: number, name: string): void;
  leave(): void;
  join(node: NodeInfo, place: string): void;
  /** Into a sea island's dungeon by its room's name (`sea-dungeon-…`, server/roomNames.ts) and its place's name. */
  enterSea(room: string, name: string, back: IslandBack): void;
};
```
- **Patrol:** the base is `dungeonRoom(node, seas, number)`. At Normal the room is the base. Otherwise it is `sharedRun(base, places) ?? runOf(base, instance())`.
- **Elite:** `run = eliteRun(node.id, seas, activitiesAt(module, minute()))` and the base is `nodeRoom(node, run.seas)`. The veil's name is `node.name`, or `${node.name}, the ${run.words}` for the week's.
- **Sea:** `seaDungeonRoom(room)` gives seed, style and seas, and the ask is `{ seed, style, name }`. At Normal the room is the agreed name; otherwise a company's run or a new one. Out is `back.onto({ x: door.x + Math.sin(door.bearing) * BEFORE_DOOR_M, y: door.y - Math.cos(door.bearing) * BEFORE_DOOR_M, facing: door.bearing })`.

**Steps**
1. Write the failing tests in `dungeonTrips.test.ts`. `recorded(here, places = [])` records `['into', outside.text, dungeon.room, layout.name, seas]`, sets `here.foot = { ...here.foot, dungeon: { patrol: outside.node, ...dungeon, layout }, seas }`, answers `companyPlaces` with `places`, and builds `dungeonTrips(game, { instance: () => 'k3j4h5g6', minute: () => 29_919_420 })`.
```ts
const elite = (id: string, name: string) => ({ id, name, kind: 'dungeon' }) as NodeInfo;
const standing = (node: NodeInfo, seas: Difficulty) => ({ node, text: 'the node file', dungeon: null, seas, held: { entrances: { entrances: [] } } });

test('a patrol’s dungeon at Abyss is a run of its own, or the company’s where it is in one', async () => {
  const alone = recorded({ foot: standing(patrol, 'abyss') });
  alone.trips.enter(1, 'The Halls of the Saltgrass Downs');
  await alone.settled();
  assert.deepEqual(alone.ways[0]?.slice(0, 3), ['into', 'the node file', 'node-saltgrass-downs--abyss--dungeon-1--run-k3j4h5g6']);
  const company = recorded({ foot: standing(patrol, 'abyss') }, ['node-saltgrass-downs--abyss--dungeon-1--run-m9n8b7v6']);
  company.trips.enter(1, 'The Halls of the Saltgrass Downs');
  await company.settled();
  assert.equal(company.ways[0]?.[2], 'node-saltgrass-downs--abyss--dungeon-1--run-m9n8b7v6');
  const shared = recorded({ foot: standing(patrol, 'normal') });
  shared.trips.enter(1, 'The Halls of the Saltgrass Downs');
  await shared.settled();
  assert.equal(shared.ways[0]?.[2], 'node-saltgrass-downs--dungeon-1', 'Normal stays shared');
});

test('an Elite Dungeon is entered from its node as its run, the week’s where it is this week’s, and left to its entrance', async () => {
  const grotto = recorded({ foot: standing(elite('krakens-grotto', 'Kraken’s Grotto'), 'abyss') });
  grotto.trips.enter(0, 'Kraken’s Grotto');
  await grotto.settled();
  assert.deepEqual(grotto.ways[0], ['into', 'the node file', 'node-krakens-grotto--run-k3j4h5g6', 'Kraken’s Grotto', 'normal']);
  grotto.trips.leave();
  await grotto.settled();
  assert.deepEqual(grotto.ways[1]?.slice(0, 2), ['onto', 'krakens-grotto']);
  const warrens = recorded({ foot: standing(elite('saltworm-warrens', 'Saltworm Warrens'), 'abyss') });
  warrens.trips.enter(0, 'Saltworm Warrens');
  await warrens.settled();
  assert.deepEqual(warrens.ways[0]?.slice(2), ['node-saltworm-warrens--abyss--run-k3j4h5g6', 'Saltworm Warrens', 'abyss']);
  assert.deepEqual(warrens.happenings[0], { kind: 'enter', node: 'saltworm-warrens--dungeon', name: 'Saltworm Warrens, the Abyss Dungeon of the week' });
});

test('a sea island’s dungeon is entered by its name and left before the island’s door, facing away', async () => {
  const { trips, ways, settled } = recorded({ foot: null });
  const backs: { x: number; y: number; facing: number }[] = [];
  const island = { id: 'isle-gull', name: 'Gull Isle', kind: 'social' } as NodeInfo;
  const back = { node: island, door: { x: 10, y: 20, bearing: Math.PI / 2 }, onto: async (at: { x: number; y: number; facing: number }) => void backs.push(at) };
  trips.enterSea('sea-dungeon-continent-4-caverns-0a1b2c3d--abyss', 'The Gull Cove', back);
  await settled();
  assert.deepEqual(ways[0]?.slice(2), ['sea-dungeon-continent-4-caverns-0a1b2c3d--abyss--run-k3j4h5g6', 'The Caverns of the Gull Cove', 'abyss']);
  trips.leave();
  await settled();
  const [at] = backs;
  assert.ok(at && Math.abs(at.x - 11.5) < 1e-9 && Math.abs(at.y - 20) < 1e-9 && at.facing === Math.PI / 2);
});

test('a company member is joined in the very room they are in', async () => {
  const { trips, happenings, ways, settled } = recorded({ foot: null });
  trips.join(patrol, 'node-saltgrass-downs--abyss--dungeon-2--run-m9n8b7v6');
  trips.join(elite('krakens-grotto', 'Kraken’s Grotto'), 'node-krakens-grotto--run-m9n8b7v6');
  await settled();
  assert.deepEqual(ways.map((way) => way.slice(2)), [
    ['node-saltgrass-downs--abyss--dungeon-2--run-m9n8b7v6', 'The Caverns of the Saltgrass Downs', 'abyss'],
    ['node-krakens-grotto--run-m9n8b7v6', 'Kraken’s Grotto', 'normal'],
  ]);
  assert.equal(happenings[0]?.kind, 'join');
});
```
   The existing three tests are updated to the new `recorded`, `intoDungeon` and `join`, keeping what each asserts.
2. Run `npm run wasm && node --import ./tools/testStyles.mjs --test client/src/game/dungeonTrips.test.ts client/src/game/footTrips.test.ts`. It should fail with TypeErrors: `trips.enterSea` is not a function, and `ways[0]` has no room.
3. Implement. `game.ts` stays at 600 lines or fewer, and `foot.ts` keeps its new lines in `footTrips.ts` where it can.
4. Run `npm test`, then `cargo xtask check`. Then run `npm run dev` offline: land at Kraken's Grotto, press E at its cave mouth, play the dungeon to its Boss (its own name on the bar), and leave by the portal before its door. That check is offline.
5. Commit: "The page enters Elite Dungeons from their node, every Elite and Abyss dungeon as its company's run, and a sea island's by its name".

**Bible.**
- `Game.md` "A dungeon": an Elite Dungeon's entrance, the week's run it opens at Elite or Abyss, a run joined where the company is, and a sea island's way in and out.
- `Dungeons.md` "In the Game": the same.
- Add `client/src/game/dungeonTrips.ts#dungeonTrips` to `Activities.md` `code:`.

---

## Task 14: Abyss on the screen: revives left, and a fallen company taken to its entrance

**Files**
- `client/src/combat/cues.ts` `EVENT`: `wiped: 14`.
- `client/src/game/footPlace.ts` `Held`: `revives: number; wiped: boolean`.
- `client/src/game/footTrips.ts`: `heardRun`. `footTrips.test.ts` is appended.
- `client/src/game/foot.ts`: `heard.snapshot` calls `heardRun(held, snapshot, fight?.player ?? null)`. Two getters are added: `get revives(): number` and `takeWipe(): boolean`.
- `client/src/game/flow.ts`: the `wiped` happening. `flow.test.ts` is appended.
- `client/src/game/dungeonTrips.ts`: `fell()`. `dungeonTrips.test.ts` is appended.
- `client/src/game/hudLaw.ts` `placeWords(place, room?, revives = -1)`. `hudLaw.test.ts` is appended.
- `client/src/game/game.ts`:
  - `footFrame` gains `if (here.takeWipe()) trips.fell();` after Phase 1's `shut` line.
  - The `hud.place` line passes `here.revives`.

**Interfaces**
```ts
/** Takes an Abyss run's word from a snapshot: its revives left, and whether it told this player their company fell. */
export function heardRun(held: { revives: number; wiped: boolean }, snapshot: { readonly revives: number; readonly events: readonly FightEvent[] }, own: number | null): void;
// flow.ts
| { readonly kind: 'wiped'; readonly node: string; readonly name: string }
// dungeonTrips: fell(): leave()'s way out, the veil saying the company fell
```

**Steps**
1. Write the failing tests:
```ts
// footTrips.test.ts
test('an Abyss run’s revives are heard from each snapshot, and its wipe once it names this player', () => {
  const held = { revives: -1, wiped: false };
  heardRun(held, { revives: 5, events: [] }, 7);
  assert.deepEqual(held, { revives: 5, wiped: false });
  heardRun(held, { revives: 5, events: [{ kind: EVENT.wiped, defender: 8 } as FightEvent] }, 7);
  assert.equal(held.wiped, false, 'another player’s word');
  heardRun(held, { revives: 5, events: [{ kind: EVENT.wiped, defender: 7 } as FightEvent] }, 7);
  assert.equal(held.wiped, true);
});
// flow.test.ts
test('a company that falls in an Abyss run is taken out to its entrance, the veil saying so', () => {
  const words = 'Your company fell. Leaving The Halls of the Saltgrass Downs';
  const out = { mode: 'loading', words, then: { mode: 'foot', node: 'saltgrass-downs', menu: false } };
  const happening = { kind: 'wiped', node: 'saltgrass-downs', name: 'The Halls of the Saltgrass Downs' } as const;
  assert.deepEqual(next({ mode: 'foot', node: 'saltgrass-downs--dungeon-1', menu: true }, happening), out, 'even with the menu open');
  assert.deepEqual(next({ mode: 'sea', menu: false }, happening), { mode: 'sea', menu: false });
});
// hudLaw.test.ts, beside the dungeon's place words
assert.equal(placeWords(dungeon, 'the Ossuary', 3), `${placeWords(dungeon, 'the Ossuary')} · 3 revives left`);
assert.ok(placeWords(dungeon, null, 1).endsWith(' · 1 revive left'));
assert.ok(placeWords(dungeon, null, 0).endsWith(' · No revives left'));
assert.equal(placeWords(dungeon, null, -1), placeWords(dungeon, null), 'none counted outside Abyss');
// dungeonTrips.test.ts
test('a company that falls is taken out by the way it came in, the veil saying it fell', async () => {
  const { trips, happenings, ways, settled } = recorded({ foot: standing(patrol, 'abyss') });
  trips.enter(1, 'The Halls of the Saltgrass Downs');
  await settled();
  trips.fell();
  await settled();
  assert.deepEqual(happenings.map((happening) => happening.kind), ['enter', 'wiped']);
  assert.deepEqual(ways[1]?.slice(0, 2), ['onto', 'saltgrass-downs']);
});
```
2. Run `node --import ./tools/testStyles.mjs --test client/src/game/footTrips.test.ts client/src/game/flow.test.ts client/src/game/hudLaw.test.ts client/src/game/dungeonTrips.test.ts`. It should fail: `heardRun` is not exported, `trips.fell` is not a function, and `next` leaves the flow as it was.
3. Implement. `takeWipe()` answers `held.wiped` and clears it, so the wipe is taken once.
4. Run `npm test` and `cargo xtask check`. Then, against `npm run server`, enter an Abyss patrol dungeon run alone and let a band fell the player. The place line should go from "5 revives left" to the wipe's veil, "Your company fell. Leaving …", and the player should stand before the entrance. That check is offline.
5. Commit: "Abyss on the screen: the revives left, and a fallen company taken out to its entrance".

**Bible.**
- `Game.md` "A dungeon": the place line's revives, and the wipe's way out.
- `Activities.md` line 13 becomes: "Its core and its dungeons are built (steps 1 and 2); the screen, companies of four and the quests are not."
- At the session's end, rewrite `bible/Hand-off.md` and message the Sea islands session that the room, the route and the trip are pushed (COORD.md).

---

## Task 15, once #92 is on the stack: the Abyss boon's reputation

Only when #92's `Character::earn_reputation(xp)` (`crates/gear/src/factions.rs`) is in the branch. `boon_xp` passes its extra quarter to `earn_reputation` as #92's kills do, per COORD.md.

The test is appended to `activity_tests.rs`: with the boon held, a kill's reputation is a quarter more than without it, using #92's names. Update `Activities.md` "What it pays, once". If #92 is not merged when this phase ships, the PR says the boon's reputation waits on it.

---

## What I could not determine, and how I chose

1. **"Its cache, raised by the tier".** I read it as a Captain's kill at the run's level: XP 2,000 and Aurem 120 at level 5, scaled by (5 + level) ÷ 10 and by the tier's reward (1, 1.5, 2). With it comes a sure Vestige in a boss's colours at the run's level, gated as every drop is. It lies beside the cache's own Vestige, so a first clear lays two.
2. **Burn's "take twice".** A player wearing the burning Art takes twice from foes, and that Art's spells deal twice. Foes cast no Art.
3. **Which run an Elite Dungeon's entrance opens.** It goes by the difficulty its node was reached at: at Elite or Abyss, the week's dungeon of that tier when this node is it; otherwise the Elite Dungeon at Normal. Phase 3's card may offer the choice instead.
4. **Styles and Bosses.** The 18 styles were picked to fit each name. The 18 Bosses' names and weapons are my picks; each is a Grey Tithe Captain at Boss rank fighting Corvane's three phases. All are the owner's to change.
5. **The week turning or the day turning mid-run.**
   - Modifiers are fixed when the run opens.
   - The day's pay checks today's dungeon when the cache opens.
   - The week's pays only in the week the run was opened for.
   - A record never pays a period behind its own (Review focus 5).
6. **Wipes.** There is no wipe once the cache stands open, since the run is won. A wipe clears drops and starts the room over in place. The page takes everyone to the entrance, and a page that does not finds itself at the start of a fresh run.
7. **A refused join** (another company's run, or the week's level) goes back to the ship by Phase 1's 4003 path, not to the entrance.
8. **Who may join.**
   - While someone is kept in a run, only their company (`companions`) may join.
   - While no one is kept, anyone who has the name may.
   - Players with no token are let in, as in every node room. They are kept out in practice by the unguessable instance.
   - Members enter one run by the places in a fresh Roster.
9. **A company member in a sea island's dungeon** is not joined from the Roster in this plan. That waits for the islands' rooms.
10. **`<continent>` in sea names** is the continent's id (`continent-4`), as `gear::world::ISLANDS` keys it. Confirm it with the Sea islands session.
11. **Sea islands' dungeons** are private runs at Elite and Abyss (`--run-<i>` after the agreed name). They are gated by their tier alone (`Place::Node`, as Phase 1 set it), and pay no day's or week's clear.
12. **An Elite Dungeon's entrance** is drawn as a patrol's is, anywhere in its ring, not placed past the approach's garrison. The approach keeps its own Reeve.
13. **Modifiers are not shown** until Phase 3; only the revives are, on the place line.
14. **The shared Normal patrol dungeon** keeps opening from its node file (`open_dungeon`), and every other dungeon room through `open_run`.
15. **The pinned draws** (day 20,778's nine dungeons and Burn (Shadow), week 2,968's Forsaken Cistern and Saltworm Warrens and their modifiers) were computed by a Python replica of `Dice::roll`, not by a Rust run. If the first Rust run disagrees, check the construction against Task 1's formulas before changing a pin, and say in the PR if any pin changed.
16. **Approach gating.** Elite Dungeon nodes, approach included, are gated by the prologue (`Place::EliteDungeon`), per "After the prologue: … the Elite Dungeons".

## The builder's numbers I picked

- **Modifiers:**
  - Burn ×2, dealt by the Art's spells and taken by its wearers.
  - Brawler ×1.5 on a player's swing; Marksman ×1.5 on a player's shot.
  - Lightswitch ×2 on a foe's swing or telegraphed blow on a player.
  - Ironclad shields half of all foes, against one in five.
  - Trickle makes recharges take ×1.5; Exposure halves heals.
  - Juggler: no Ammo box and no crate.
- **The day's draws:** one of the island's nine dungeons and one modifier of eight, even. Burn's Art is drawn evenly of three.
- **Revives:** 5 a run (the design's).
- **Elite Dungeons:** `ELITE_BLOCKS = (4, 5)`.
- **The week's two:**
  - The Elite pays a Legendary Vestige (item level 20) and 3 Essence of each stock.
  - The Abyss pays Legendary 4 : Atheric 1, 5 Essence of each stock, and the boon.
  - The boon is a quarter more of each kill's XP, rounded down.
- **The second Vestige** lies 1.4 m before the cache.
- **Room names:**
  - Runs end `--run-<8 of a-z0-9>`, drawn as 8 random bytes mod 36.
  - Node ids may be at most 27 characters (`LONGEST_ENDING = "--abyss--dungeon-2--run-00000000"`).
  - The longest names are 59 and 61 characters.
- **Lifetimes:** an emptied run's room lingers `RUN_LINGER_MS = 60_000`, then is forgotten.
- **Wire and reasons:**
  - The draws' seed is `0x4143_5449_5649_5459`, with `Purpose::Draw = 12` and kinds 0 to 3.
  - Boss types are 19 to 36; `EventKind::Wiped = 14`; `Snapshot.revives` is a byte, -1 for none.
  - Reasons: "This dungeon opens at level 24." / "… 28.", and "This run is another company's.".
  - Words: "Elite Dungeon", "Elite Dungeon of the week", "Abyss Dungeon of the week", "N revives left", "No revives left" and "Your company fell. Leaving …".

### Critical Files for Implementation
- /home/user/overlook-source/.claude/worktrees/activities/crates/gear/src/activities.rs (new: places, draws, modifiers)
- /home/user/overlook-source/.claude/worktrees/activities/crates/room/src/dungeon_room.rs (laid_dungeon, the Boss at the end, keep_cache's pay)
- /home/user/overlook-source/.claude/worktrees/activities/crates/room/src/run.rs (new: the Run, its hooks; with run_room.rs and abyss.rs)
- /home/user/overlook-source/.claude/worktrees/activities/server/roomNames.ts and server/worker.ts (run names, runAsk, linger, company)
- /home/user/overlook-source/.claude/worktrees/activities/client/src/game/dungeonTrips.ts (Elite, run, company and sea trips)

Not checked: I built and ran nothing, since this was read-only. The draw pins come from a Python replica of `Dice::roll`, and the Atheric share's range (150 to 250 in 1,000) is statistical, not run. Risk: Phase 1 is still landing. Its `gate.rs`, `Place::Node` for `dungeon_of` and `Keeper.lost(player, why)` are as read on disk, and the builder should recheck them before Task 3.