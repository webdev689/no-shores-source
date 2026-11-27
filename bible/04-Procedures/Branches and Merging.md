---
type: procedure
---
# Branches and Merging

- **`main` always passes** `cargo xtask check`. Nothing merges red.
- **One branch, one change.** Name it for the change (`sea/wave-height`, `vault/port-notes`). A Claude session works
  on the branch its session names.
- **Days, not weeks.** A branch that cannot merge within a few days is too big: split it, or merge what is done
  behind a switch that is off.
- **Merge `main` into the branch** to catch up. Never rewrite a branch once pushed: its pull request and other
  sessions read it.
- **On a merge, diff every number registry both sides touched**: the asks (`crates/protocol/src/*_wire.rs`), the
  refusals (`crates/gear/src/refusal.rs`), the foe types (`crates/foes/src/roster.rs`), any enum with explicit
  numbers and their TypeScript copies. Two sides that took the same number merge with no conflict; the later side
  renumbers. `cargo xtask repo` refuses a FlatBuffers table whose fields moved against `origin/main`.
- **Before taking a new wire number**, run `bash tools/claude-toolkit/numbers-in-flight.sh`: the asks, refusals and
  foe types each open pull request adds over `main`. Take one none of them holds.
- **Merge a pull request with a merge commit** once the owner says yes ([[Ask Before Deploying]]), so `main` reads as
  one merge per change, and delete the branch ([[Only the Garrison's Own Kills Share Its Clear, and a Failed Trip Goes Back to the Beach]]).
- **No integration branches.** Two changes that depend on each other go in order, the first merged before the second.
- **No branches of generated output.** Renders and bakes live outside git ([[Generated Files Stay Out of Git]]).
