---
type: reference
code:
  - crates/xtask/src/toolchain.rs#STEPS
  - crates/xtask/src/checks/mod.rs#run_all
---
# Checks

`cargo xtask check` is the one command that says a change is done. CI runs it on every pull request and every push to
`main`. It stops at the first failing step, in the order a failure is cheapest to read:

1. **format**: rustfmt, then Prettier.
2. **lints**: clippy on every crate and target, then ESLint; warnings are errors.
3. **types**: TypeScript, strict, for the client and for the tests.
4. **tests**: `cargo test`, then `node --test`.
5. **build**: the client, with Vite.
6. **repo checks**, each a pure function with tests beside it:

| Check | Holds | Rule |
|---|---|---|
| layout | the top level to the known list; every folder under `crates/` is a crate named after its folder | [[Code Map]] |
| size | source files to 600 lines, tests to 800 | [[Small Files]] |
| comments | comments to eight lines, with no dates, issue numbers, ticket tags or bible pointers | [[Comments Say Why]] |
| layers | client imports follow the declared layers; no Node modules in client code; no WebGL | [[Code Map]], [[WebGPU Only]] |
| assets | no file over 1 MB; media only in `bible/Attachments/` | [[Generated Files Stay Out of Git]] |
| vault | every wikilink resolves; every `code:` path exists and holds its symbol | [[Notes Say How It Works Now]] |

The co-dev's toolkit in `tools/claude-toolkit/` is kept as its author ships it, so the size and comment checks skip
it ([[The Co-Dev's Toolkit, Whole]]).

## Adding a check

A check earns its place by catching something review keeps missing. It needs the owner's agreement, a test on
made-up input, and must hold everywhere the day it lands: if the code does not pass it yet, fix the code in the same
change. No baselines.
