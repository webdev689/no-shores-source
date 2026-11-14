---
type: decision
date: 2026-11-14
status: in force
---
# Server-Authoritative Multiplayer

> "When we tackle multiplayer the plan is pure server authoritive with maximum performance."

## What it settles

- The server decides every outcome. A client sends what its player does and shows what the server says happened.
- The server and the game's rules are Rust ([[TypeScript and Rust]]), built for performance.
- Whether a client predicts its own movement while it waits, using the same Rust rules compiled to WebAssembly, is
  open until multiplayer work starts ([[Open Questions]]).
