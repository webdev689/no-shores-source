---
type: system
status: live
code:
  - content/guilds/outposts.json
  - client/src/game/guild/outpostLaw.ts#placeRefusal
  - client/src/game/guild/outpostLaw.ts#riseRefusal
  - client/src/game/guild/outpostLaw.ts#decorRefusal
  - client/src/game/guild/outpostLaw.ts#boonsOf
  - client/src/game/guild/outpostPlaces.ts#plotBoxes
  - client/src/game/guild/outpostPlan.ts#planNode
  - client/src/game/guild/outpostsView.ts#outpostsNode
  - client/src/game/guild/treasuryView.ts#treasuryNode
  - server/accounts/treasury.ts#move
  - server/accounts/outposts.ts#outpostAsk
  - server/accounts/outpostStores.ts#deliver
  - server/accounts/outpostStores.ts#outpostsRead
  - server/accounts/outpostStores.ts#outpostFor
  - server/accounts/migrations/20261123210955_outposts.sql
  - crates/gear/src/guild.rs#Boons
---
# Outposts

A guild's outpost is its own plot of land on an island, where its founder and admins place structures that earn for
it and its members ([[Guilds Gain Banners, Levels, Bounties and Outposts]], [[Guilds and Outposts as Claude Shapes
Them]]). Each island has one outpost site, and each guild that raises an outpost there plays it in a room of its own,
`node-<site>--guild-<key>`, apart from every other guild's ([[Guilds]], [[Server]]).

## How it works

- **The law is shared.** `content/guilds/outposts.json` holds every number: the plot (16 cells of 4 m a side), the
  cost to raise one, the levels that allow a second and third outpost and each tier, the structures with their cells,
  their opening level and each tier's Aurem and materials, and the decoration with how far each piece reaches. One
  law (`outpostLaw.ts`) judges every change on the page and in the accounts, so the two never disagree: a structure on
  the plot, off every other and off decoration, turned a quarter at a time; a tier the guild's level and its hall
  allow; decoration on a quarter metre, turned in fifteen-degree steps, off every structure, within what the hall
  holds.
- **Where things stand.** `outpostPlaces.ts` reckons each structure's module (its kind at its tier, a scaffold while it
  is built, the standard of its guild's staff), the middle of its cells on the plot's level ground, and the boxes its
  module's parts make, once for the page's drawing, the page's own body and the room's blocks. A module missing from
  the manifest stands as its cells' box, so a structure always walls.
- **The treasury.** A guild's Aurem, put in by members and earned by its outposts, spent only on outposts and never
  paid out (`treasury.ts`). Every move is a ledger line with the balance after, made in one write with whatever it
  pays for: the line goes in only while the balance stays between nothing and 1,000,000, and each write after it holds
  only while that line is this ask's, so an ask made twice moves once.
- **Raising.** The founder or an admin standing in their guild's room at a site raises an outpost for 5,000 Aurem: its
  hall stands in the middle of the plot and its standard before it. A guild holds one outpost from level 1, two from
  level 4 and three from level 7, one a site.
- **Building.** A structure placed costs its tier's Aurem at once and stands as a scaffold; members deliver its
  materials at the outpost, each delivery taking only what it still needs, and it stands the moment the last arrives.
  Raising a tier does the same. Taking one down gives half its Aurem back; the hall stands while the outpost does.
  The founder may abandon an outpost from anywhere, for half of all spent on it.
- **What it earns.** A Counting House's strongbox fills each whole hour by its tier and holds two days; a member there
  empties it into the treasury. An Island Camp gathers the island's own resource and a Dockyard Timber, Canvas and
  Iron into the outpost's stores each whole day, three days at most; a member there takes up to 20 of each a day.
  Neither is written until it is read or emptied.
- **Boons.** The War Table, Captain's Lodge and Assay House give every member, wherever they play, 5, 10 or 15% more
  XP, reputation or Aurem from kills and clears: the highest tier of each standing at any of the guild's outposts. The
  accounts tell the rooms with the player's guild (`boonsOf`); the room gives them to the character each tick, never
  kept (`gear::guild::Boons`), and the central payout adds them.
- **The Guild tab.** The Outposts page shows each outpost by its site: its plan from above, each structure a block in
  its colour (a blueprint while built), its strongbox and stores, and what it gives. Standing there a member delivers,
  takes and empties; a founder or admin builds on the plan (the footprint's ghost green where the law lets it stand,
  red with the law's words where not), raises tiers, takes down, sounds the War Horn and abandons. A change to a plot
  tells the room, and says so on the window. The Treasury page reads the ledger in words and lets a member at an
  outpost put Aurem in ([[Interface]]).
- **Reading an outpost.** `GET /v1/outposts` gives a member their guild's outposts, its treasury and ledger, and the
  site they stand at; `GET /v1/outposts/<room>` gives anyone signed in the plot and banner a room stands, so a
  member's company draws it too ([[Accounts]]).

## Limits

- No upkeep: each guild has its own ground, so none is hoarded.
- Materials delivered to a structure taken down are spent.
