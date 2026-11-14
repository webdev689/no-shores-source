---
type: decision
date: 2026-11-14
status: in force
---
# Clients Predict With the Shared Rules

> "Predict with shared rules"

## What it settles

- A player's own actions respond at once: the client predicts them by running the same Rust rules crate, compiled to
  WebAssembly, that the server runs.
- The server stays the sole authority ([[Server-Authoritative Multiplayer]]) and corrects any drift. Because both run
  one crate, a prediction can only differ from the server where the server knows more ([[Agree to the Bit]]).
