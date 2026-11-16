---
type: decision
date: 2026-11-16
status: in force
---
# Servers on Cloudflare

> "Are we able to use cloudflare or no?"

> Told that the server could run on Cloudflare's Durable Objects or Containers, or stay on a dedicated-core VPS with
> Cloudflare in front of it, and asked which: "Switch to cloudflare"

> Asked "Are containers better?", and told that Durable Objects suit the rooms now, cheaper and quicker to start,
> while Containers suit a room that needs more than one gives, to be measured again with mission instances: "got it.
> we can continue then"

## What it settles

- The game servers ([[Server-Authoritative Multiplayer]]) run on Cloudflare, not on dedicated-core VPS.
  [[Servers on Dedicated-Core VPS]] is replaced.
- The rooms run on Durable Objects, one for each shared space ([[Server]]). Containers, running the native server,
  are measured again when mission instances with enemies are built.
- Each deploy still waits for the owner's yes ([[Ask Before Deploying]]).
