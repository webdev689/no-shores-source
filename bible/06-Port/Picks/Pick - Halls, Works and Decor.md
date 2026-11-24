---
type: pick
area: Network and Platform
verdict: Cut
effort: L
status: proposed
dfo_paths:
  - src/net/hallLaw.js
  - src/net/fortLaw.js
  - src/net/decorLaw.js
  - src/systems/decor/decorPlacer.js
  - server-account/src/halls.js
  - server-account/src/decorBatch.js
  - server-account/src/castles.js
dfo_commit: 81a8c647 (main, before the Discord bot's revert)
---
# Pick - Halls, Works and Decor

DFO's guild halls, its seats' fortification works built in tiers from silver and delivered materials, its castles as
a guild's private instance, and its decor: a law for where a piece may stand, a placer on a grid, prices by size and
half back, and caps by room. The owner asked for outposts and "see what can be adapted from DFO"
([[Guilds Gain Banners, Levels, Bounties and Outposts]]); the rows this note covers wait for the owner to mark them
approved in the [[Pick List]].

## What comes over, as a specification only

- Works of three tiers, each built from a guild's coin and materials its members deliver, each tier's effect a plain
  function of the tier.
- A guild's own ground as an instance of its own, admitting its members.
- A treasury kept on a ledger, every paid ask carrying an id so a retried one pays once.
- Decor's piece law: a grid on the ground, turns in fixed steps, a price by size, half back, a cap by the hall.
- DFO's lessons: never let the page set a price or a boundary; bound height and area from the first day; keep each
  piece's place against a fixed origin.

## What stays behind

- Map ids, building keys, RMB blocks, Daggerfall's towns and furniture, witnessing by the clients, the client-held
  gold, seats, regions, sieges, upkeep and votes.
- No DFO code or data; every model is our own Blender module ([[Modules]], [[Own Work]]).

## Our version

- Outposts at a site on each island, one room for each guild, as [[Guilds and Outposts as Claude Shapes Them]] lays
  out.
- System note: [[Outposts]].
