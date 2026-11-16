---
type: decision
date: 2026-11-16
status: in force
---
# Servers on Cloudflare

> "Are we able to use cloudflare or no?"

> Told that the server could run on Cloudflare's Durable Objects or Containers, or stay on a dedicated-core VPS with
> Cloudflare in front of it, and asked which: "Switch to cloudflare"

## What it settles

- The game servers ([[Server-Authoritative Multiplayer]]) run on Cloudflare, not on dedicated-core VPS.
  [[Servers on Dedicated-Core VPS]] is replaced.
- Each deploy still waits for the owner's yes ([[Ask Before Deploying]]).

## Still open

- Which of Cloudflare's: Durable Objects, one for each shared space, which Claude recommended, with a steady tick to
  be tried first; or Containers running the native server.
