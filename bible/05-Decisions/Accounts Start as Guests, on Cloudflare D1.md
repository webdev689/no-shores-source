---
type: decision
date: 2026-11-17
status: in force
---
# Accounts Start as Guests, on Cloudflare D1

> "Well my goal is to let you develop this end to end to 100%. So I want to handle any open questions before I let
> you off"

> Told that a player's gear lives only while they stay in one room, and asked how it should be kept for the loop to
> work end to end in the game: "Accounts + PostgreSQL now (Recommended)"

> Asked how players sign in, once told that DFO's accounts start every player as a guest who may add a username and
> password later, Discord there being only its bot: "#3 but also the option with discord as sign in + link with
> account"

> Asked where the database lives, with Cloudflare D1 offered as DFO's choice in place of PostgreSQL: "Is #3 a bad
> idea?"

> Told D1 suits Overlook (no second provider or key, beside the rooms, proven by DFO, its one cost replacing the
> PostgreSQL decision), and asked whether D1 takes PostgreSQL's place: "Yes"

## What it settles

- **Accounts now**, so a player's gear is theirs across rooms and sessions.
- **Every player starts as a guest**, kept on the server from their first visit, and may add a username and password
  later, as DFO's accounts do.
- **Discord** is a way to sign in as well, and an account may be linked to Discord.
- **Persistent state lives in Cloudflare D1**, not PostgreSQL: accounts, characters and their gear. This replaces
  [[PostgreSQL]].
