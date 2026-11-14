---
type: reference
code:
  - crates/xtask/src/toolchain.rs#STEPS
  - crates/xtask/src/checks/mod.rs#run_all
---
# Checks

`cargo xtask check` is the one command that says a change is done. CI runs it on every pull request and every push to
`main`. It stops at the first failing step, in the order a failure is cheapest to read:

1. **format**: `cargo fmt --all --check`.
2. **lints**: clippy on every crate and target, warnings as errors.
3. **tests**: `cargo test --workspace`.
4. **repo checks**, each a pure function with tests beside it:

| Check | Holds | Rule |
|---|---|---|
| layout | the top level to the known list; every folder under `crates/` is a crate named after its folder | [[Code Map]] |
| size | `.rs` and `.py` files to 600 lines, tests to 800 | [[Small Files]] |
| comments | comments to eight lines, with no dates, issue numbers, ticket tags or bible pointers | [[Comments Say Why]] |
| assets | no file over 1 MB; media only in `bible/Attachments/` | [[Generated Files Stay Out of Git]] |
| vault | every wikilink resolves; every `code:` path exists and holds its symbol | [[Notes Say How It Works Now]] |

## Adding a check

A check earns its place by catching something review keeps missing. It needs the owner's agreement, a test on
made-up input, and must hold everywhere the day it lands: if the code does not pass it yet, fix the code in the same
change. No baselines.
