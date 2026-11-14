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
- A client predicts its own actions with the same Rust rules, and the server corrects it
  ([[Clients Predict With the Shared Rules]]).
- Where it runs and what it stores: [[Servers on Dedicated-Core VPS]], [[PostgreSQL]]. How it talks:
  [[WebSocket, Then WebTransport]], [[One Schema for Every Message]].
