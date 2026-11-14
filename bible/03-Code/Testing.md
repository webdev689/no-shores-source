---
type: reference
---
# Testing

Tests say what the code does ([[Tests Check Behaviour]]). They run in `cargo xtask check`, and the whole run stays
fast enough to run before every push.

## Where tests live

- **Unit tests** sit with the code: a `mod tests` at the foot of the file, or a sibling `<name>_tests.rs` included
  with `#[path]` when the cases are long.
- **Integration tests** for a crate's public behaviour go in its `tests/` folder.
- **Agreement tests** for the rules crate run the same inputs natively and as WebAssembly and compare the bits
  ([[Agree to the Bit]]). They arrive with the rules crate.

## What a good test looks like

- Named for the behaviour: `a_ship_in_irons_loses_way`, not `test_3`.
- Made-up inputs a reader can follow, built in the test.
- One behaviour per test; the assertion says what was expected.
- Checks results through public functions, not private state.

## What we do not do

- Pin line numbers, line text or file layout.
- Keep records tied to where code sits (DFO's mutant records and cites).
- Snapshot large outputs that change with every tuning pass. Tuning numbers live in data, and a test checks the
  property that matters (a ship stays afloat), not the number.
- Keep a test whose behaviour is gone.
