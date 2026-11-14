---
type: decision
date: 2026-11-14
status: in force
---
# One Schema for Every Message

> "One schema generates both"

## What it settles

- Every network message is defined once, in a schema, and both the TypeScript client's code and the Rust server's
  code are generated from it. The two sides cannot drift apart.
- The encoding is compact binary. Which schema tool (FlatBuffers is the leading candidate) is chosen with the first
  message, and the protocol's version is a hash of the schema ([[Versions Are Not Counters]]).
