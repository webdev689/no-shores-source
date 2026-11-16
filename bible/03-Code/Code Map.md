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
| `client/editor/`, `client/src/editor/` | The [[World Editor]]: its page, and the layer that paints the continents and shapes the land, in 2D, in 3D and close up |
| `client/testground/`, `client/src/testground/` | The [[Test Ground]]: its page, and the layer that plays and dresses the forge's figures on open ground, with a course to climb |
| `client/src/forge/` | The forge layer: reads the [[Sprite Forge]]'s published strips and composes a figure's frames from them |
| `client/src/firstperson/` | The first-person layer: the weapons, held things and hands in view, swung, fired, dyed and drawn over the scene ([[First Person]]) |
| `client/src/water/` | The water layer: the [[Water]]'s surface, breakers, ripples and underwater view, drawn over any land a layer hands it, and a walker's wading, swimming and diving |
| `client/src/network/` | The network layer: the browser's side of the [[Server]]: its messages, made from the same schema, the connection to a room, and the prediction it corrects |
| `client/src/rules/` | The rules layer: the Rust rules, the [[Land]] and [[Movement]], loaded as WebAssembly, for any page that needs them |
| `server/` | The [[Server]]'s Cloudflare shell ([[The Server's Shell Is in server]]): the Worker and its Durable Object, which keep each room in WebAssembly, Cloudflare's settings (`wrangler.jsonc`) and the shell's TypeScript settings |
| `crates/` | Every Rust crate, one folder each, named after its crate |
| `crates/world` | The world's structure: the layout of continents and isles, its rules and exact geometry ([[World Map]]) |
| `crates/world-wasm` | The world rules for the browser: a door crate, text in and text out |
| `crates/land` | The [[Land]]: relief, erosion and water from the painted coasts, the owner's edits and places, and the ground anywhere to the metre |
| `crates/land-wasm` | The land for the browser: a door crate, heights handed over as bytes |
| `crates/movement` | [[Movement]]: how a body walks, runs, jumps, climbs, hangs, mantles and vaults, one tick at a time |
| `crates/movement-wasm` | Movement for the browser: a door crate, a body stepped one tick at a time |
| `crates/protocol` | The [[Server]]'s messages: the schema, `messages.fbs`, the Rust `flatc` makes from it, and the server's side of reading and writing them. A door crate |
| `crates/room-wasm` | The room for its Cloudflare host: a door crate, bytes in and bytes out |
| `crates/room` | The [[Server]]'s core: one shared space, its players' inputs in order, their bodies stepped tick by tick |
| `crates/xtask` | The repository's own checks: `cargo xtask check` ([[Checks]]) |
| `content/` | Authored game data, read by the tools, the server and the client: `content/world/layout.json`, each landmass's edits in `content/world/land/`, `content/forge/renders.json`, which names the forge's published renders, and `content/testground/course.json`, the Test Ground's course, which the server's rooms stand on too |
| `tools/claude-toolkit/` | The co-dev's Claude Code toolkit, kept as shipped ([[Toolkit]]) |
| `tools/forge/` | DFO's [[Sprite Forge]], kept as shipped in DFO's own layout ([[DFO's Sprite Forge Comes Over Exactly]]) |
| `tools/forge_publish.py` | Publishes the forge's renders and tables to R2, and pulls them back |
| `tools/forge_dyes.mjs` | Reads Daggerfall's palette once into the forge's dye table |
| `tools/install-flatc.sh`, `tools/schema.mjs` | Install the pinned `flatc`, and make the messages' code with it into `generated/` ([[Toolchain]]) |
| `bible/` | This vault |
| `.github/workflows/` | CI (`ci.yml`), which runs `cargo xtask check` and on `main` then calls `pages.yml` to publish the client to GitHub Pages |

## The client's layers

Every folder directly under `client/src` is a layer, declared in `LAYERS` with what it may import, when its first
file arrives. Files directly in `client/src` may import any layer. They are also groundwork any layer may import,
such as `gpu.ts`, except the entry point `main.ts`. Client code never imports
Node's modules (tests may) and never uses WebGL. As the code arrives, the layers follow one direction:

- **The engine** (GPU, drawing, sound, input, assets) knows nothing of the game.
- **The interface** draws on the engine and reads game state; it does not change it.
- **The network** speaks to the server and knows nothing of drawing.
- **The entry point** wires them together. It wires; it does not implement ([[Small Files]]).

Declared so far: `rules` and `forge` (each imports nothing), `network` and `water` (each imports `rules`), `editor`
(imports `rules` and `water`), `testground` (imports `rules`, `network`, `forge`, `firstperson`, and the editor's
camera and panel helpers) and `firstperson` (imports `forge`). The code `flatc` makes, in `generated/`, is groundwork
any layer may import.

## The Rust crates

Crates appear when the work reaches them. Each is declared in the crates check's table, which says which other crates
and outside crates it may use (`CRATES`, [[Checks]]):

- **The rules**: what the world and its people may do. No graphics, network, files or clock, so the server and any
  predicting client compute the same bits ([[Agree to the Bit]]). They are `world`, which may use only `serde` and
  `serde_json`; `land`, which may use `world`, `serde` and `serde_json`; and `movement`, which may use only `libm`.
- **The server**, at multiplayer ([[Server-Authoritative Multiplayer]]): the authority. It depends on the rules and its
  own platform crates, never on the client. Its core is `room`, which may use only `movement`; its messages are
  `protocol`, which may use `movement`, `room` and `flatbuffers`; and `room-wasm` puts them behind a WebAssembly door
  for the Cloudflare shell in `server/`.
- **Door crates** hand memory across a boundary and are the only crates that may hold unsafe code. They are
  `world-wasm`, `land-wasm` and `movement-wasm`, which put the world rules, the land and movement behind WebAssembly
  doors for the browser; `room-wasm`, which puts the room behind one for its Cloudflare host; and `protocol`, whose
  code from `flatc` reads a message's bytes in place.
