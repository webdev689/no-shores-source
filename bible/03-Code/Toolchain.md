---
type: reference
code:
  - package.json
  - tsconfig.json
  - tsconfig.node.json
  - eslint.config.js
  - rust-toolchain.toml
  - Cargo.toml
  - clippy.toml
---
# Toolchain

## TypeScript (the client)

- **TypeScript 6.0**, strict, with only erasable syntax, so Node runs the tests' TypeScript directly with no build
  step. TypeScript 7, the faster native compiler, is not yet supported by the TypeScript lint tooling; we move when it is.
- **Two configurations**: `tsconfig.json` for the client (browser types, no Node types) and `tsconfig.node.json` for
  the tests and the build configuration (with Node's types).
- **Node 22.18 or later** runs the tests (`node --test`).
- **Vite 8** serves and builds the client from `client/` into `dist/`. CI publishes the client to GitHub Pages after
  `cargo xtask check` passes on a merge into `main` ([[The World Editor Is on GitHub Pages]]).
- **ESLint 10** with `typescript-eslint`: spelled-out names, no `any`, type-only imports marked.
- **Prettier**, 120 columns, the same settings as DFO Online, so ported code keeps its layout.

## Rust (the server, the rules, the tooling)

- **Rust 1.97.0**, pinned in `rust-toolchain.toml` with `rustfmt`, `clippy` and the `wasm32-unknown-unknown` target.
- **Edition 2024**, one workspace. Every crate takes the workspace's lints. Unsafe code is denied everywhere except
  the door crates `world-wasm`, `land-wasm`, `movement-wasm` and `room-wasm`, which allow it to hand memory to
  JavaScript, and
  `protocol`, whose code from `flatc` reads a message's bytes in place. Clippy warnings are errors.
- **Build profiles**: debug builds optimise dependencies fully and our own crates lightly, so they run at a usable
  speed and still rebuild quickly.

## FlatBuffers (the messages)

- **`flatc` 25.12.19**, Google's own release ([[Messages Are FlatBuffers]]). `tools/install-flatc.sh` holds the
  version and the checksum of its download, and refuses a download that does not match. It fetches the Linux build
  only.
- **`npm run schema`** makes the Rust and the TypeScript from `crates/protocol/messages.fbs` into
  `generated/messages/` (not in git). On its first run on a machine it installs the pinned `flatc` into
  `target/flatc/`, so nothing is installed by hand, in a cloud session, CI or the Pages build; it refuses any other
  `flatc`. `cargo xtask check`, `dev` and `build` run it first.
- **The runtimes**: the `flatbuffers` crate at exactly 25.12.19, and the `flatbuffers` npm package.

## Cloudflare (the server)

- **`wrangler`**, Cloudflare's tool, with Cloudflare's Workers types for the shell's TypeScript, which
  `server/tsconfig.json` checks. Its usage reports are off (`send_metrics`).
- **`npm run server`** runs the rooms locally on Cloudflare's own runtime, at `ws://127.0.0.1:8787/room/<name>`.
- **`npm run server:bundle`** bundles the Worker as a deploy would, into `target/server/`, without deploying.
  `cargo xtask check` runs it last.
- **`npm run server:deploy`** deploys it, with the owner's yes each time ([[Ask Before Deploying]]). It needs
  `CLOUDFLARE_ACCOUNT_ID` and a Cloudflare token; in a cloud session the token is a network secret the proxy adds, so
  `CLOUDFLARE_API_TOKEN` holds a placeholder.

## The toolkit

The co-dev's Claude Code toolkit lives in `tools/claude-toolkit/` ([[The Co-Dev's Toolkit, Whole]]). Each session
starts with `bash tools/claude-toolkit/install-all.sh`, which installs its plugins, MCP servers and hooks and ends
with a check of every tool. How to use each tool and worker: [[Toolkit]]. Its working folders, `graphify-out/` and
`.serena/`, are ignored by git.

## Python

Only for the [[Sprite Forge]], which runs inside Blender: `pip install bpy==5.2.3` on Python 3.13, with `scipy`,
`cma` and `pillow`. It is kept exactly as DFO ships it, so the size, comment and assets checks skip `tools/forge/`
([[DFO's Sprite Forge Comes Over Exactly]]).

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Install the TypeScript tools (once, and when `package-lock.json` changes) |
| `cargo xtask check` | Everything CI runs, both languages |
| `cargo xtask repo` | Only the repo checks, in about a second |
| `npm run dev` | The client in a browser, reloading as you edit; the [[World Editor]] at `/editor/` |
| `npm run schema` | Makes the messages' Rust and TypeScript into `generated/messages/` (not in git), installing the pinned `flatc` first if it is not there |
| `npm run wasm` | Builds the world rules, the land and movement as WebAssembly into `client/public/` (not in git), and the room for the server; `dev` and `build` run it first |
| `npm run server` | Runs the server's rooms locally, at `ws://127.0.0.1:8787/room/<name>` |
| `npm test`, `cargo test` | One side's tests |
