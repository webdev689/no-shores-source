---
type: reference
---
# Testing

Tests say what the code does ([[Tests Check Behaviour]]). They run in `cargo xtask check`, and the whole run stays
fast enough to run before every push.

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
  WebAssembly, the bytes the browser's own code writes, and reads its snapshots back with the browser's.
- **GPU code** is checked in a browser with WebGPU; the pure parts around it (sizes, layouts, maths) are unit-tested.

## What a good test looks like

- Named for the behaviour: `a_ship_in_irons_loses_way`, not `test_3`.
- Made-up inputs a reader can follow, built in the test.
- One behaviour per test; the assertion says what was expected.
- Checks results through public functions, not private state.
- Covers every place the behaviour runs: when a feature is switched on in more places, its tests widen to all of them
  in the same change.

## Measuring

- A test bounded by wall-clock time measures the machine too. Run `cargo xtask check` on an idle machine, with no
  picture driver, profiler or bake beside it, and rerun a timing failure idle before reading it as a regression.
- To compare an older commit's speed with the current one, build it in a worktree. Two trees sharing a target folder
  write their binaries to one path, so copy each out under its own name right after its build, and check with `cmp`
  that they differ. An instruction count from callgrind does not move with the machine's load.

## What we do not do

- Pin line numbers, line text or file layout.
- Keep records tied to where code sits (DFO's mutant records and cites).
- Snapshot large outputs that change with every tuning pass. Tuning numbers live in data, and a test checks the
  property that matters (a ship stays afloat), not the number.
- Keep a test whose behaviour is gone.
