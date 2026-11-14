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
- **Vite 8** serves and builds the client from `client/` into `dist/`.
- **ESLint 10** with `typescript-eslint`: spelled-out names, no `any`, type-only imports marked.
- **Prettier**, 120 columns, the same settings as DFO Online, so ported code keeps its layout.

## Rust (the server, the rules, the tooling)

- **Rust 1.97.0**, pinned in `rust-toolchain.toml` with `rustfmt`, `clippy` and the `wasm32-unknown-unknown` target.
- **Edition 2024**, one workspace. Every crate takes the workspace's lints. Unsafe code is forbidden; clippy warnings
  are errors.
- **Build profiles**: debug builds optimise dependencies fully and our own crates lightly, so they run at a usable
  speed and still rebuild quickly.

## The toolkit

The co-dev's Claude Code toolkit lives in `tools/claude-toolkit/` ([[The Co-Dev's Toolkit, Whole]]). Each session
starts with `bash tools/claude-toolkit/install-all.sh`, which installs its plugins, MCP servers and hooks and ends
with a check of every tool. How to use each tool and worker: [[Toolkit]]. Its working folders, `graphify-out/` and
`.serena/`, are ignored by git.

## Python

Only for tooling that runs inside Blender (the sprite forge), held to the same size and comment checks.

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Install the TypeScript tools (once, and when `package-lock.json` changes) |
| `cargo xtask check` | Everything CI runs, both languages |
| `cargo xtask repo` | Only the repo checks, in about a second |
| `npm run dev` | The client in a browser, reloading as you edit |
| `npm test`, `cargo test` | One side's tests |
