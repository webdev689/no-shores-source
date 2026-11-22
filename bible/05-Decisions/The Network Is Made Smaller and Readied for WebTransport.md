---
type: decision
date: 2026-11-20
status: in force
---
# The Network Is Made Smaller and Readied for WebTransport

> "1. Using protobuf 2. Webtransport"

> Told the plan (the interface drawn by the game first, then work moved off the main thread, WebTransport once
> measured, Protobuf skipped) and asked four questions: "Lets do it. Take some autonomy and complete everything to
> 100%. I want you to research throughly and do this right."

## What it settles

- WebTransport is taken up: the rooms are readied for it, and it comes once the measures call for it.
- Protocol Buffers are not taken up: the plan the owner agreed to skipped them, and the messages stay FlatBuffers.
- The choices are Claude's, made on research, each recorded below as Claude's call for the owner to change.

## Claude's calls

- Messages stay FlatBuffers, as the owner chose ([[Messages Are FlatBuffers]]): Protocol Buffers would shrink what
  crosses by about 2%, as the rooms already deflate every message ([[Platform Research]], "The wire"). What does
  shrink it: each message's bytes measured; other figures' numbers sent small, measured from the room; only what
  changed sent; and each sea fight's view sent to its own player alone.
- No Cloudflare product accepts WebTransport ([[Servers on Cloudflare]]), so the rooms are readied first, on
  Cloudflare: inputs and events that survive a loss, snapshots small enough for one datagram, and their lag and loss
  measured.
- No relay of the game's own on a server outside Cloudflare for now: its host, its cost, its address and keys wait
  until the measures show the WebSocket's stalls hurt play ([[Claude Makes the Four Points' Open Calls]]). Safari and iOS stay on the WebSocket until
  WebKit's open bugs are fixed.
- The game's files stay on `r2.dev`, which is rate-limited and meant for development, until the owner has a domain on
  Cloudflare; then the bucket takes it as its own address ([[Claude Makes the Four Points' Open Calls]]).

[[Server]], [[Platform Research]].
