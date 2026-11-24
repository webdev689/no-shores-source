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
  - server/outpostHost.ts#OutpostHost
  - server/keeping.ts#forGuild
  - server/roomNames.ts#nodeRoom
  - client/src/game/guild/delveRoom.ts#delveRoom
  - client/src/game/guild/delveRoom.ts#delveLaid
  - server/delveHost.ts#delveAsk
  - crates/room/src/outpost.rs
  - crates/room/src/outpost_boss.rs
  - crates/room-wasm/src/outpost_door.rs
  - server/accounts/migrations/20261123230738_outpost_errands.sql
  - tools/modules/catalogue.py#OUTPOST
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
  pays for: that write goes first and changes only while the asker keeps their rank, what it changes is as it was
  read, and the balance stays between nothing and 1,000,000; the line and the balance follow only if it changed. A
  refund or an emptied strongbox is what the row it changes held. A page may name its ask (`rid`, up to 64 of
  `a-z0-9-`), so an ask sent twice moves once and is answered the same. A move of nothing writes no line, and a
  guild's ledger keeps its newest 200 lines. Its words name what moved: `build <kind>` for one standing at once,
  `begin <kind>` for a scaffold, `take down <kind or piece>`.
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
  Neither is written until it is read or emptied, or a structure that fills them stands, rises or is taken down: then
  both are settled to that moment at the rates before it, so a new rate counts only from then. A strongbox the
  treasury cannot hold whole gives what fits and keeps the rest.
- **Boons.** The War Table, Captain's Lodge and Assay House give every member, wherever they play, 5, 10 or 15% more
  XP, reputation or Aurem from kills and clears (reputation from chests and the Abyss boon too): the highest tier of
  each standing at any of the guild's outposts. The accounts tell the rooms with the player's guild (`boonsOf`); the
  room gives them to the character each tick, never kept (`gear::guild::Boons`), and the central payout adds them.
- **The Guild tab.** The Outposts page shows each outpost by its site: its plan from above, each structure a block in
  its colour (a blueprint while built), its strongbox and stores, and what it gives. Standing there a member delivers,
  takes and empties; a founder or admin builds on the plan (the footprint's ghost green where the law lets it stand,
  red with the law's words where not), raises tiers, takes down, sounds the War Horn and abandons. A change to a plot
  tells the room, and says so on the window. The Treasury page reads the ledger in words and lets a member at an
  outpost put Aurem in ([[Interface]]).
- **The room.** Each guild plays its outpost at a site in a room of its own, `node-<site>--guild-<key>`, the key its
  whole id; the bare site is nobody's ([[Server]], "An outpost's room"). Its members come in, and anyone in a company
  with a member there. The host stands the plot's boxes as the room's blocks (`outpostHost.ts`), and stands them anew
  when a member changes the plot or a delivery raises a structure; the snapshot counts each plot stood, so the page
  reads it again. Putting Aurem in, delivering, taking from the stores and sounding the horn are asked of the room,
  which takes what is given at once, saves the character so taken, and asks the accounts as an errand under an id of
  its own: asked again, the accounts answer as they did, so nothing is done or given back twice. A player has one
  such ask with the accounts at a time.
- **The guild boss.** The War Horn, sounded once a week by the founder or an admin (the accounts answer its tier, 0
  when it sounded this week, -1 for one who may not sound it, -2 when none stands at a tier), calls a High Assessor and four
  Majors to the muster ground beyond the plot, at the level of the highest member there, at Normal, Elite or Abyss by
  the horn's tier. Felled, each player who struck it is paid as a world boss's clear pays, and each member among them
  who was in the guild before the week turned takes a guild package once that week, as from the guild dungeon.
- **The guild dungeon.** A Delve Gate opens a dungeon behind it, at Normal with the gate at tier 1, Elite at tier 2
  and Abyss at tier 3; a company may choose a lower tier than its gate's. It is a run of its own for each company of
  the guild's members (and anyone in a company with one), `node-<site>--guild-<key>--run-<instance>`, the tier after
  the key at Elite or Abyss ([[Server]], "An outpost's room"). Each week it is laid afresh as a sea island's dungeon in
  the site's continent, its seed and its style (caverns, a crypt or mines) drawn from the guild's key and the week,
  the same all week for every company of that guild (`delveRoom.ts`). Its clear pays as a sea island's dungeon's at
  its tier, and each member who clears it takes a guild package at their first clear that week, beside the horn's.
  It is entered from the guild's outpost alone, and leaving it, or its clear's way out, comes back before the gate.
- **The models.** Each structure at each tier, the standard on each staff, and a scaffold for each footprint are
  modules built in Blender ([[Modules]], "The outposts' structures"); unturned, each faces south.
- **Reading an outpost.** `GET /v1/outposts` gives a member their guild's outposts, its treasury and ledger, the
  site they stand at, and what they took from the stores today (`taken`); `GET /v1/outposts/<room>` gives anyone
  signed in the plot and banner a room stands, so a member's company draws it too ([[Accounts]]). A player stands at
  an outpost only while its room holds their character. Outpost asks and plot reads are 600 an hour an account.

## Limits

- No upkeep: each guild has its own ground, so none is hoarded.
- Materials delivered to a structure taken down are spent.
