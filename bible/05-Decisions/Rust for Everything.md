---
type: decision
date: 2026-11-14
status: in force
---
# Rust for Everything

> "I want the entire thing rust with the backend being GO."

> "Nvm Rust for everything"

## What it settles

- The client, the engine, the game's rules, the server and the repo's own tooling are Rust, in one Cargo workspace.
- The rules are one crate that the server runs natively and the browser runs as WebAssembly, so both compute the
  same results ([[Agree to the Bit]]).
- The one exception is tooling that must run inside another program: the sprite forge runs inside Blender, which
  scripts only in Python.

See [[Toolchain]] and [[Code Map]].
