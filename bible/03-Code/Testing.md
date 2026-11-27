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
  `crates/protocol/src/protocol_tests.rs` writes a welcome and a snapshot into `target/protocol/`, and
  `client/src/network/messages.test.ts` reads them back to the bit; `server/roomDoor.test.ts` hands the room, in
  WebAssembly, the bytes the browser's own code writes, and reads its snapshots back with the browser's. It also holds
  the fingerprint of a sea clash, the value `crates/room-wasm/src/door_tests.rs` holds as `SEA_CLASH_HASH`.
  Before a pinned fingerprint or scripted outcome moves, grep its old value across the crates, client and server.
  Find the change that moves it by reverting each change alone, and measure what the pin guards with and without that
  change (Measuring). Put the numbers in the commit and the pull request.
- **Tests on the real world's data** read it as the page does: `client/src/city/ruinBudget.test.ts` opens the six
  ruined cities' continents in the land's WebAssembly (`npm run -s wasm` first) and holds each city's crystal to the
  city's budgets.
- **A client view that must line up with a rules answer** is tested by driving it on the real WebAssembly rules and
  projecting their output. A gated feature is checked live in the player's plainest mode: no account, a fresh
  character.
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
- Made-up inputs a reader can follow, built in the test, with the game's own constants. A stand-in does what the
  platform documents. A precondition is set directly with a helper, not through a lucky seed, and a fixture fails
  loudly past its cap.
- Its expected answer comes from what the player sees or from running the simulation, never from restating the code's
  formula or importing the tolerance under test.
- It covers the input's whole range (an opening's corners, a keyboard that is not US, a rate settled and not only in
  its transient), bounds both sides, and reads explicit state (an action, a flag), never a rounded or packed number
  compared with zero.
- One behaviour per test; the assertion says what was expected.
- Checks results through public functions, not private state.
- Covers every place the behaviour runs: when a feature is switched on in more places, its tests widen to all of them
  in the same change. After tuning through a shared function, each caller's path is pinned.
- Reaches every copy: a check added to a test helper goes to every copy of it (grep for the same loop), or the copies
  fold into the helper, and a walk is checked at every tick. Code moved for a size limit keeps every side effect, with
  a test written from the caller's order of use.

## Measuring

- A long run measures whatever surrounds it. Run `cargo xtask check`, the picture driver and `webgpu-perf` on an
  idle machine, with no cargo build, profiler or bake beside them, and rerun a timing failure idle before reading it
  as a regression. A baseline runs before the first edit or in a worktree of its own, and no edit, merge or checkout
  touches a tree a background run reads. `cargo test --workspace --no-fail-fast` shows every failure, not the first.
- A tuning claim, or a pin moved, sweeps the whole input domain over 10 or more seeds or minutes, measured on the full
  real data.
- Give an `#[ignore]` measurement a reason that says how it runs and what it needs (`npm run bake` first, for the
  roads' loads); `grep -rn '#\[ignore' crates` lists them. Give it one cheap test that is not ignored, building its
  scenario and asserting it happened (the players met, the fight begun, the probe's actor alive by the code's own
  test), so CI breaks when the rules move. A number the bible quotes names its command and is rerun when the code
  under it moves.
- "The same to the bit" for a heavy pure stage (the navmesh bake and the like) cites a diff: an ignored test prints
  `name digest` for every real input, run on the base and after, then `diff`, saying how many compared.
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
