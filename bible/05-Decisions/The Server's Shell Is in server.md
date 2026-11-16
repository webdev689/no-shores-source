---
type: decision
date: 2026-11-16
status: in force
---
# The Server's Shell Is in server

> Asked which folder holds the Cloudflare Worker that hosts the rooms, its TypeScript shell, Cloudflare's settings
> and its TypeScript settings, with the room's logic staying Rust in `crates/`: "server/ (Recommended)"

## What it settles

- `server/` is a top-level folder beside `client/`. It holds the [[Server]]'s Cloudflare shell, its settings and its
  TypeScript settings ([[Code Map]]).
- The server's rules and logic stay Rust, in `crates/` ([[TypeScript and Rust]]).
