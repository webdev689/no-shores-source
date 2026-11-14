---
type: reference
code:
  - crates/xtask/src/checks/layout.rs#TOP_LEVEL
  - crates/xtask/src/checks/layers.rs#LAYERS
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
| `crates/` | Every Rust crate, one folder each, named after its crate |
| `crates/xtask` | The repository's own checks: `cargo xtask check` ([[Checks]]) |
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

## The Rust crates

Crates appear when the work reaches them. At multiplayer ([[Server-Authoritative Multiplayer]]):

- **The rules**: what the world and its people may do. No graphics, network, files or clock, so the server and any
  predicting client compute the same bits ([[Agree to the Bit]]).
- **The server**: the authority. It depends on the rules and its own platform crates, never on the client.

When the second crate arrives, the layout check gains a table of which crate may depend on which.
