---
type: decision
date: 2026-11-16
status: in force
---
# Messages Are FlatBuffers

> Asked which schema tool the first network message uses, FlatBuffers, a generator of our own, or Protocol Buffers:
> "flatbuffers is yes"

> Asked where `flatc` comes from, Google's release pinned by its checksum, a build of it from source, or Ubuntu's
> package: "Google's release"

## What it settles

- The schema every network message is defined in is FlatBuffers' ([[One Schema for Every Message]]). Its compiler,
  `flatc`, generates the Rust and the TypeScript for each message from it.
- `flatc` is Google's own release, at one pinned version, refused unless its download matches the checksum kept with
  it.
