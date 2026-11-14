---
type: decision
date: 2026-11-14
status: in force
---
# WebSocket, Then WebTransport

> "WebSocket, then WebTransport"

## What it settles

- The client talks to the Rust server over WebSocket first, which every browser supports.
- WebTransport follows where browsers support it, for lower latency and messages that may be dropped when stale.
