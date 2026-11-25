---
type: decision
date: 2026-11-24
status: in force
---
# The Panel's Sign-in Asks for a Person's Servers

> Asked whether the panel's Discord sign-in should also ask for a person's servers (the `guilds` scope), so each
> person sees only the servers they share with the bot, offered as Claude's recommendation since that is how most
> Discord dashboards work: "Best decision"

## What it settles

- The bot's panel signs a person in with Discord's `identify` and `guilds` scopes: who they are and which servers they
  are in ([[Discord Bot]]).
- A person's list in the panel holds only the servers they share with the bot. Where Discord does not say which
  servers they are in, the panel weighs the bot's first servers by name instead.
- The bot keeps no Discord token: the list is read once at sign-in, with the person's name.
