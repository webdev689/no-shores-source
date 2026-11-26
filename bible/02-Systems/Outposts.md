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
  - client/src/game/guild/delveRoom.ts#delveBase
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
it and its members ([[Guilds Gain Banners, Levels, Bounties and Outposts]],
[[Guilds and Outposts as Claude Shapes Them]]). Each island has one outpost site, and each guild that raises an
outpost there plays it in a room of its own, `node-<site>--guild-<key>`, apart from every other guild's ([[Guilds]],
[[Server]]).

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
- **Building.** A structure placed costs its tier's Aurem at once; one that asks no materials (the standard) stands
  then, and the rest stand as a scaffold while members deliver their materials at the outpost, each delivery taking
  only what it still needs, standing the moment the last arrives. Raising a tier does the same. A character carries
  at most 200 of each material. Taking one down gives half its Aurem back; the hall stands while the outpost does.
  The founder may abandon an outpost from anywhere, for half of all spent on it. A treasury too full for the half
  takes what fits, the rest lost, and the answer says how much came back.
- **Decorating.** A piece of decoration costs 50 Aurem a metre of its reach (the half-diagonal of its model, so it
  stays within its reach however it turns), 25 at least and 500 at most, and taking it up gives half back. The hall
  holds 40, 80 or 150 pieces by its tier (`decorPrice`, `decorCap`). A piece being placed in the world is let go with
  Escape or the pad's B, which then does nothing else ([[Interface]]).
- **What it earns.** A Counting House's strongbox fills each whole hour by its tier and holds two days; a member there
  empties it into the treasury. An Island Camp gathers the island's own resource and a Dockyard Timber, Canvas and
  Iron into the outpost's stores each whole day, three days at most; a member there takes up to 20 of each a game
  day (from 09:00 UTC), counted across all the guild's outposts. Each outpost keeps its own strongbox and stores. The
  strongbox is written when emptied, the stores when taken from, and both when a structure that fills them stands,
  rises or is taken down: then both are settled to that moment at the rates before it, the part of an hour or a day
  since the last whole one paid pro rata, so a new rate, or a store just beginning to fill, counts only from then. A
  strongbox the treasury cannot hold whole gives what fits and keeps the rest.
- **Boons.** The War Table, Captain's Lodge and Assay House give every member, wherever they play, 5, 10 or 15% more
  XP, reputation or Aurem from kills and clears (reputation from chests and the Abyss boon too): the highest tier of
  each standing at any of the guild's outposts, counted once however many stand. A member's contribution to the
  guild's week is a tenth of all the XP they gain, a boon's share with the rest ([[Guilds]]). The accounts tell the
  rooms with the player's guild (`boonsOf`); the room gives them to the character each tick, never kept
  (`gear::guild::Boons`), and the central payout adds them.
- **The Guild tab.** The Outposts page shows each outpost by its site: its plan from above, each structure a block in
  its colour with its tier and a bar on its front (a blueprint while built, banded while a tier rises), the decoration
  as small marks and a key beneath; its strongbox and stores, and what it gives. It opens on the outpost the player
  stands at. Standing there a member delivers (greyed for a material they carry none of), takes and empties; a
  founder or admin builds on the plan (the footprint's ghost green where the law and the treasury let it stand, red
  with the law's or the accounts' words where not), raises tiers, takes down (the hold saying how much comes
  back) and sounds the War Horn, or reads that it has sounded this week; the founder alone abandons. A structure's own panel holds its own
  presses: a Counting House its strongbox, a Camp or Dockyard the stores, the War Horn its sounding. A change to a plot
  tells the outpost's room, when the player stands in it, and says so on the window. The plan is one stop for Tab, its
  arrows moving a cursor. The Treasury page reads the ledger in the world's words (placed, took up) under its column
  heads, and lets a member at an outpost put Aurem in, saying why when the treasury cannot hold it ([[Interface]]).
- **The room.** Each guild plays its outpost at a site in a room of its own, `node-<site>--guild-<key>`, the key its
  whole id; the bare site is nobody's ([[Server]], "An outpost's room"). Its members come in, and anyone in a company
  with a member there; a guest so let in stays until they leave. Only one whose own guild changed away from it (they
  left, or were removed) is sent out of the outpost's own room, unless one of their company who is a member is there;
  its guild dungeon's run sends no one out. The host stands the plot's boxes as the room's blocks (`outpostHost.ts`),
  and stands them anew when what it reads of the plot changed: a member changes the plot, a delivery, and a read
  every 30 s besides; an outpost abandoned stands nothing within that time, its players left on the site's bare
  ground until they go. The snapshot counts each plot stood, so the page reads it again. Putting Aurem in,
  delivering, taking from the stores and sounding the horn are asked of the room, which takes what is given at once,
  saves the character so taken, carrying the errand, and asks the accounts under an id of its own: asked again, the
  accounts answer as they did, so nothing is done or given back twice; it is asked again until they answer. What
  comes back reaches the character once wherever it went meanwhile: the room that next holds it asks again and gives
  it there. An account has one such ask with the accounts at a time, its player joining again included; the Horn's
  answer, never carried, leaves any errand the character carries to its own answer.
- **The guild boss.** The War Horn, sounded once a week by the founder or an admin (the accounts answer its tier, 0
  when it sounded this week, -1 for one who may not sound it, -2 when none stands at a tier, -3 past the account's
  outpost limit), calls a High Assessor and four Majors to the muster ground beyond the plot, at the level of the
  highest member there, at Normal, Elite or Abyss by the horn's tier. Felled, each player who struck it is paid as a
  world boss's clear pays, and each member among them who was in the guild before the week turned takes a guild
  package once that week, as from the guild dungeon; its Vestige goes to the vault, else the mail, when ten are
  carried.
- **The guild dungeon.** A Delve Gate opens a dungeon behind it, at Normal with the gate at tier 1, Elite at tier 2
  and Abyss at tier 3; a company may choose a lower tier than its gate's. It is a run of its own for each company of
  the guild's members (and anyone in a company with one), `node-<site>--guild-<key>--run-<instance>`, the tier after
  the key at Elite or Abyss ([[Server]], "An outpost's room"). Each week it is laid afresh as a sea island's dungeon in
  the site's continent, its seed and its style (caverns, a crypt or mines) drawn from the guild's key and the week,
  the same all week for every company of that guild (`delveRoom.ts`); a run begun before the week turned keeps its own
  week's, which its name carries, for whoever joins it. Its clear pays as a sea island's dungeon's at its tier, and
  each member who clears it takes a guild package at their first clear that week, the week of the clear, beside the
  horn's.
  It is entered from the guild's outpost alone, and leaving it, or its clear's way out, comes back before the gate.
- **The models.** Each structure at each tier, the standard on each staff, and a scaffold for each footprint are
  modules built in Blender ([[Modules]], "The outposts' structures"); unturned, each faces south.
- **Reading an outpost.** `GET /v1/outposts` gives a member their guild's outposts, its treasury and ledger, the
  site they stand at, what they took from the stores this game day (`taken`) and whether the horn sounded this week
  (`hornSounded`); `GET /v1/outposts/<room>` gives anyone signed in the plot and banner a room stands, or null where
  the guild raised none, so a member's company draws it too ([[Accounts]]). A player stands at an outpost only while
  its room holds their character. Outpost asks and the rooms' errands are 600 an hour an account, past which an errand
  is given back as "Too many asks. Wait a while."; plot reads are 600 an hour of their own.

## Limits

- No upkeep: each guild has its own ground, so none is hoarded.
- The guild boss is lost if everyone leaves its room before it falls.
- Materials delivered to a structure taken down are spent.
- An errand the accounts keep failing is asked again for as long as its room lives, and is carried by the character
  until a room that holds it is answered; that player's outpost asks wait on it until then ([[Server]], "An outpost's
  room").
- A member can push older ledger lines out with many small deposits; each line names who moved it.
