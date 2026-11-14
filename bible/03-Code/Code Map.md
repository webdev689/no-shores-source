---
type: reference
code:
  - crates/xtask/src/checks/layout.rs#TOP_LEVEL
  - crates/xtask/src/checks/layers.rs#LAYERS
  - crates/xtask/src/checks/crates.rs#CRATES
  - client/src/main.ts
---
# Code Map

Where things live. The layout check holds the top level to a fixed list (`TOP_LEVEL`); a new top-level folder is a
decision, made in the same change as its entry here.

| Path | What it holds |
|---|---|
| `client/` | The game in the browser, TypeScript ([[TypeScript and Rust]]). `index.html` and `src/` |
| `client/src/main.ts` | The entry point: fits the canvas, starts the GPU, runs the frame loop |
| `client/src/gpu.ts` | Starts WebGPU, or tells the player why it cannot ([[WebGPU Only]]) |
| `client/editor/`, `client/src/editor/` | The [[World Editor]]: its page, and the layer that paints, traces and measures |
| `client/src/rules/` | The rules layer: the Rust rules, loaded as WebAssembly, for any page that needs them |
| `crates/` | Every Rust crate, one folder each, named after its crate |
| `crates/world` | The world's structure: the layout of continents and isles, its rules and exact geometry ([[World Map]]) |
| `crates/world-wasm` | The world rules for the browser: a door crate, text in and text out |
| `crates/xtask` | The repository's own checks: `cargo xtask check` ([[Checks]]) |
| `content/` | Authored game data, read by the tools, the server and the client: `content/world/layout.json` |
| `tools/claude-toolkit/` | The co-dev's Claude Code toolkit, kept as shipped ([[Toolkit]]) |
| `bible/` | This vault |
| `.github/workflows/` | CI: one workflow that runs `cargo xtask check` |

## The client's layers

Every folder directly under `client/src` is a layer, declared in `LAYERS` with what it may import, when its first
file arrives. Files directly in `client/src` are the entry point and may import any layer. Client code never imports
Node's modules (tests may) and never uses WebGL. As the code arrives, the layers follow one direction:

- **The engine** (GPU, drawing, sound, input, assets) knows nothing of the game.
- **The interface** draws on the engine and reads game state; it does not change it.
- **The network** speaks to the server and knows nothing of drawing.
- **The entry point** wires them together. It wires; it does not implement ([[Small Files]]).

Declared so far: `rules` (imports nothing) and `editor` (imports `rules`).

## The Rust crates

Crates appear when the work reaches them. Each is declared in the crates check's table, which says which other crates
and outside crates it may use (`CRATES`, [[Checks]]):

- **The rules**: what the world and its people may do. No graphics, network, files or clock, so the server and any
  predicting client compute the same bits ([[Agree to the Bit]]). The first is `world`, which may use only `serde` and
  `serde_json`.
- **The server**, at multiplayer ([[Server-Authoritative Multiplayer]]): the authority. It depends on the rules and its
  own platform crates, never on the client.
- **Door crates** hand memory across a boundary and are the only crates that may hold unsafe code. The first is
  `world-wasm`, which puts the world rules behind a WebAssembly door for the browser.
