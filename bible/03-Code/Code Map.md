---
type: reference
code:
  - Cargo.toml
  - crates/xtask/src/checks/layout.rs#TOP_LEVEL
---
# Code Map

Where things live. The layout check holds the top level to this list (`TOP_LEVEL` in the layout check); a new
top-level folder is a decision, made in the same change as its entry here.

| Path | What it holds |
|---|---|
| `crates/` | Every Rust crate, one folder each, named after its crate |
| `crates/xtask` | The repository's own checks: `cargo xtask check` ([[Checks]]) |
| `bible/` | This vault |
| `.github/workflows/` | CI: one workflow that runs `cargo xtask check` |
| `Cargo.toml` | The workspace: shared lints, edition and build profiles |
| `rust-toolchain.toml` | The pinned Rust version and targets ([[Toolchain]]) |

## How crates depend on each other

Crates appear when the work reaches them, each named for what it holds. Their dependencies point one way:

- **The rules** (what the game's world and its people may do) depend on no platform: no graphics, no windows, no
  network, no files, no clock. The server runs them natively and the client runs them as WebAssembly
  ([[Agree to the Bit]]).
- **The engine** (drawing, sound, input, assets) knows nothing of the game.
- **The client** wires the engine, the rules and the network together. It wires; it does not implement
  ([[Small Files]]).
- **The server** depends on the rules and its own platform crates, never on the client or the engine.
- **Labs**, prototypes we try a thing in, live in their own crates and nothing depends on them.

When the second crate arrives, the layout check gains a table of which crate may depend on which.
