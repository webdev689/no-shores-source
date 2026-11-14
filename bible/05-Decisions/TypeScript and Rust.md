---
type: decision
date: 2026-11-14
status: in force
replaces: "[[Rust for Everything]]"
---
# TypeScript and Rust

> "If we did typescript would that mean heavy rewriting?"

> "Lets do typescript and rust."

## What it settles

- **The client is TypeScript**, strict: engine, renderer, interface and tools. DFO Online's JavaScript comes over and
  is typed as it is ported, not rewritten ([[Porting from DFO]]).
- **The server and the game's rules are Rust**, built when the work reaches multiplayer
  ([[Server-Authoritative Multiplayer]]).
- The one command, `cargo xtask check`, runs both toolchains ([[Checks]]).
- The sprite forge stays Python, because it runs inside Blender.
