---
type: reference
code:
  - crates/xtask/src/toolchain.rs#STEPS
  - crates/xtask/src/checks/mod.rs#run_all
---
# Checks

`cargo xtask check` is the one command that says a change is done. CI runs it on every pull request and every push to
`main`, and on `main` publishes the client to GitHub Pages once it passes. It stops at the first failing step, in the
order a failure is cheapest to read:

1. **format**: rustfmt, then Prettier.
2. **lints**: clippy on every crate and target, then ESLint; warnings are errors. Clippy also refuses clocks and
   every float method the platform may round its own way, such as `sin`, `exp` and `powf` ([[Agree to the Bit]]).
3. **types**: TypeScript, strict, for the client and for the tests.
4. **tests**: `cargo test`, then the world rules, the land and movement built as WebAssembly (`npm run wasm`), then
   `node --test`, whose bridge tests load them.
5. **build**: the client, with Vite.
6. **repo checks**, each a pure function with tests beside it:

| Check | Holds | Rule |
|---|---|---|
| layout | the top level to the known list; every folder under `crates/` is a crate named after its folder | [[Code Map]] |
| size | source files to 600 lines, tests to 800 | [[Small Files]] |
| comments | comments to eight lines, with no dates, issue numbers, ticket tags or `bible/` paths; lines in fenced examples are checked too | [[Comments Say Why]] |
| layers | client imports follow the declared layers; no Node modules in client code; no WebGL. It reads `import` and `export … from` in every form, backtick imports, `new URL(…, import.meta.url)` and `import.meta.glob` | [[Code Map]], [[WebGPU Only]] |
| crates | every crate is declared, takes the workspace's lints, and depends only on the crates its rule allows, read by real package name through renames and per-platform tables; any attribute naming `unsafe_code` outside a door crate is refused | [[Code Map]] |
| assets | no file over 1 MB; media only in `bible/Attachments/` | [[Generated Files Stay Out of Git]] |
| vault | every wikilink resolves; every `code:` path exists and holds its symbol | [[Notes Say How It Works Now]] |

The checks read scripts of every extension: `.ts`, `.mts`, `.cts`, `.tsx`, `.js`, `.mjs` and `.cjs`. A file that is
not UTF-8 is reported, not skipped. Two folders are kept as their authors ship them, so the size, comment and assets
checks skip them: the co-dev's toolkit in `tools/claude-toolkit/` ([[The Co-Dev's Toolkit, Whole]]) and DFO's sprite
forge in `tools/forge/` ([[DFO's Sprite Forge Comes Over Exactly]]).

## Adding a check

A check earns its place by catching something review keeps missing. It needs the owner's agreement, a test on
made-up input, and must hold everywhere the day it lands: if the code does not pass it yet, fix the code in the same
change. No baselines.
