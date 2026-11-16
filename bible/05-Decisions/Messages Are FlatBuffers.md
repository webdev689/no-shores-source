---
type: decision
date: 2026-11-16
status: in force
---
# Messages Are FlatBuffers

> Asked which schema tool the first network message uses, FlatBuffers, a generator of our own, or Protocol Buffers:
> "flatbuffers is yes"

## What it settles

- The schema every network message is defined in is FlatBuffers' ([[One Schema for Every Message]]). Its compiler,
  `flatc`, generates the Rust and the TypeScript for each message from it.

## Still open

- Where `flatc` comes from: Google's own release, or a build of it.
