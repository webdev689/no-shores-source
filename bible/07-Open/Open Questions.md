---
type: index
---
# Open Questions

Decisions waiting on the owner. Each says what it decides and what Claude recommends, if anything; none is in force
until the owner decides it and it moves to [[Decisions]].

| Question | Why it matters | Recommendation |
|---|---|---|
| Does a client predict its own movement while the server answers? | Responsiveness under [[Server-Authoritative Multiplayer]] | Predict with the same Rust rules compiled to WebAssembly, so prediction can never disagree with the server; decide when multiplayer starts |
| How do the TypeScript client and the Rust server share the wire format? | Both sides must read every message the same way | One schema, with the TypeScript and Rust types generated from it; decide with the first message |
| Which platforms ship first: browser, desktop, or both? | Shapes builds and testing | The owner's call |
| Where the servers run, and which database | Hosting, cost and persistence | Decide when the first server crate is written |
| Network transport | Latency and browser support | WebSocket first; WebTransport where browsers support it |
| Where generated files live (forge renders, world bakes) | [[Generated Files Stay Out of Git]] needs a home | An object store addressed by content hash, decided with the first generated file |
| The licence notice | The repo is private and proprietary | `LICENSE` reads "All rights reserved" under Lattymoy; confirm the holder's name |
| Who reviews code besides Claude | Review holds most rules | The owner's call |
