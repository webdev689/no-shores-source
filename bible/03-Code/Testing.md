---
type: reference
---
# Testing

Tests say what the code does ([[Tests Check Behaviour]]). They run in `cargo xtask check`, which CI runs on every pull
request's head, in three parts at once; before a push, the tests of what changed and `cargo xtask repo` run
([[CI Is the Check Before a Merge]], [[Main Deploys What Its Pull Request Passed, and the Check Runs in Three Parts]]). But the asset pipelines' tests run in their own workflows, as their tools change:
`tools/flora`'s, `tools/islands`', `tools/dungeon`'s, `tools/modules`', `tools/freesound`'s and the Lattice's
(`tools/test_forge_lattice.py`, whose `MergeFoe` cases CI runs too). `tools/item-pictures/test_pixels.py`
([[Item Pictures]]) and `tools/freesound/test_root.py` run in no workflow. The build tools' own tests beside them
(`tools/*.test.mjs`) run with the TypeScript tests.

## Where tests live

- **TypeScript tests** sit beside the code as `<name>.test.ts` and use Node's own runner (`node:test`,
  `node:assert/strict`). Node runs them directly, with no build step.
- **Rust unit tests** sit with the code: a `mod tests` at the foot of the file, or a sibling `<name>_tests.rs`
  included with `#[path]` when the cases are long.
- **Integration tests** for a crate's public behaviour go in its `tests/` folder.
- **Agreement tests** run the same inputs natively and as WebAssembly and compare the bits ([[Agree to the Bit]]).
  `crates/land/tests/agree.rs` and `client/src/rules/landRules.test.ts` hold the same fingerprints of the land, and
  `crates/movement/tests/agree.rs` and `client/src/rules/movementRules.test.ts` the same fingerprint of a run.
  `crates/combat/tests/agree.rs` and `client/src/rules/combatRules.test.ts` hold the same fingerprint of a fight; the
  room door's `garrison_door_tests.rs` and `server/garrison.test.ts` one of a node's garrison fought, and its
  `climb_door_tests.rs` and `server/climb.test.ts` one of a foe climbing after a player.
  Each fingerprint both languages hold is pinned once, in `content/fingerprints.txt` (a name, then its value), which
  the Rust tests read with their `pinned` and the TypeScript tests with `server/pinnedForTests.ts`; the `pins` check
  refuses a copy. A pin moves only once switching the change off for one run restores the old value, so the change
  is shown to be its only cause; then the server's test, through the WebAssembly rebuilt, shows the build carries it.
  Where the page keeps its own copy of a rule's number, a Rust test writes the rule's (the rooms' numbers into
  `target/protocol/room-numbers.json`, the asks' into `asks.json`) and the page's test reads that, never the Rust.
  `crates/protocol/src/protocol_tests.rs` writes a welcome and a snapshot into `target/protocol/`, and
  `client/src/network/messages.test.ts` reads them back to the bit; `server/roomDoor.test.ts` hands the room, in
  WebAssembly, the bytes the browser's own code writes, and reads its snapshots back with the browser's.
- **Tests on the real world's data** read it as the page does: `client/src/city/ruinBudget.test.ts` opens the six
  ruined cities' continents in the land's WebAssembly (`npm run -s wasm` first) and holds each city's crystal to the
  city's budgets.
- **What the page's and server's tests read is built, not committed**: the messages, the WebAssembly and the files
  `cargo test -p protocol` writes. `npm run -s fixtures` refreshes all three: run it after any change under `crates/`
  or to a `.fbs`, and after every merge, or a test fails on the stale copy (a server test's "entry is not a function").
  The type check is `npm run -s types`, which covers the server's, the site's and the desktop app's; a bare
  `tsc -p tsconfig.json` covers only the client.
- **GPU code** is checked in a browser with WebGPU; the pure parts around it (sizes, layouts, maths) are unit-tested.
- **The desktop app** is packed for Linux and started on the game's own build by `desktop.yml` whenever it changes,
  until its log says the game's adapter came up ([[Desktop App]]).

## What a good test looks like

- Named for the behaviour: `a_ship_in_irons_loses_way`, not `test_3`.
- Made-up inputs a reader can follow, built in the test.
- One behaviour per test; the assertion says what was expected.
- Wire inputs built from their layout: an intent by `intentOf` (`server/intentForTests.ts`) or `INTENT_FLOATS`,
  never as a list of numbers, so a number added to the layout reaches every test at once.
- A property run that checks something is conserved (totals, rows) also asserts that the run did something: a run
  that did nothing conserves everything.
- Checks results through public functions, not private state.
- Covers every place the behaviour runs: when a feature is switched on in more places, its tests widen to all of them
  in the same change.

## Measuring

- A test bounded by wall-clock time measures the machine too. Run `cargo xtask check` on an idle machine, with no
  picture driver, profiler or bake beside it, and rerun a timing failure idle before reading it as a regression.
- To compare an older commit's speed with the current one, build it in a worktree, into that worktree's own
  `target/`. Never point two checkouts at one `CARGO_TARGET_DIR`: each overwrites the other's binaries, and
  `cargo xtask check` refuses one outside the checkout. An instruction count from callgrind does not move with the
  machine's load.

## What we do not do

- Pin line numbers, line text or file layout.
- Keep records tied to where code sits (DFO's mutant records and cites).
- Snapshot large outputs that change with every tuning pass. Tuning numbers live in data, and a test checks the
  property that matters (a ship stays afloat), not the number.
- Keep a test whose behaviour is gone.
