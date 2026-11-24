---
type: system
status: live
code:
  - client/src/game/guild/bannerLaw.ts#bannerRefusal
  - client/src/game/guild/bannerLaw.ts#bannerOfName
  - client/src/game/guild/bannerArt.ts#clothPixels
  - client/src/game/guild/bannerArt.ts#standardPixels
  - client/src/game/guild/guildSigns.ts#signRows
  - client/src/game/guild/guildLaw.ts#levelOf
  - client/src/game/guild/guildLaw.ts#bountiesOf
  - client/src/game/guild/guildPage.ts#GuildPage
  - client/src/game/guild/guildHome.ts#homeNode
  - client/src/game/guild/bannerEditor.ts#BannerEditor
  - client/src/game/guild/guildDetails.ts#foundNode
  - server/accounts/guildFace.ts#faceAsk
  - server/accounts/guildFace.ts#guildPage
  - server/accounts/guilds.ts#guildRead
  - server/accounts/migrations/20261123201032_guild_banners.sql
  - content/guilds/banners.json
  - content/guilds/guilds.json
  - crates/room/src/plates.rs#tag_player
  - crates/gear/src/guild.rs#bounties_of
  - crates/gear/src/guild.rs#GuildWeek
  - crates/room/src/guild_book.rs#Guilds
  - crates/room/src/guild_room.rs#claim_guild
  - crates/room/src/sea_guilds.rs#guild_sunk
  - crates/room-wasm/src/guild_door.rs#room_guild
  - server/accounts/guildWeeks.ts#creditGuild
  - server/accounts/guildWeeks.ts#guildTold
  - server/accounts/migrations/20261123205159_guild_weeks.sql
  - server/keeping.ts#GUILD_EVERY_MS
  - client/src/game/guild/guildWeek.ts#bountiesNode
---
# Guilds

A guild is a group of up to a hundred players under one name, tag and banner, after Destiny 2's clans
([[Guilds Gain Banners, Levels, Bounties and Outposts]], [[Guilds and Outposts as Claude Shapes Them]]). Its founder and
admins run it; its tag is worn after every member's name, over their head and in every list. Founding, invites and
ranks are the Roster's as well ([[Accounts]], "The Roster").

## How it works

- **Kept by the accounts.** A guild's row holds its name, tag, motto, description, banner and XP
  (`server/accounts/migrations/`). Its founder and admins set the banner and the description (`guildFace.ts`); each
  write holds only while the asker still has that rank, read inside the write, so one demoted a moment before cannot.
  The description is judged as a motto is, up to 300 characters ([[Names]]).
- **The banner.** A cloth of one cut (Swallowtail, Square, Point, Tattered, Three Tails) and one of twenty colours; a
  device across it in a second colour (thirteen, from Halves and Cross to Waves and Checks); a sign in its own colour
  on a ground of its own shape and colour; and the staff it hangs from, Driftwood at level 1 to Gilded at level 10. The
  lists are `content/guilds/banners.json`. One law judges a banner on the page and in the accounts (`bannerLaw.ts`):
  every part from its list, the device unlike the cloth, the sign unlike what it sits on, and a staff the guild's
  level has opened. A guild founded without one hangs the banner its name draws, the same on every machine.
- **Drawn cell by cell** (`bannerArt.ts`), as the emblems are: the cloth 32 cells wide and 64 long, cut at its foot,
  its head a row of loops the crossbar runs through, soft folds down it, the sign's dark edge round it; the standard
  is the cloth on its staff, its pole running on to a stone foot. The signs are the emblems' 24 and eight drawn for
  guilds (`guildSigns.ts`).
- **The tag over a head.** The accounts give a claimed character its guild's tag beside its username, and the room
  puts it on the player's plate (`Room::tag_player`), sent once each time it changes. A guild founded, joined or left
  sends the page's token again, as a username taken does, and the room reads the plate again; a guild the keeper is
  told has changed (a member removed, or one who left from another tab) reads it again too. The plate reads
  `Ada [SALT]`, the tag a shade fainter ([[Interface]], "Players").
- **Levels.** A guild's level comes from its XP: ten levels, from 15,000 for level 2 to 800,000 for level 10
  (`content/guilds/guilds.json`, `guildLaw.ts`). A level reached is never lost.
- **The week.** Each week (from Tuesday 09:00 UTC, the game's one clock) draws four guild bounties of twelve, the same
  for every guild: the rules (`gear::guild::bounties_of`) and the page (`bountiesOf`) shuffle the list by the same
  32-bit xorshift seeded by the week, held to the same table by a test on each side. Each asks for felling, gathering, sinking or clearing, as
  the day's bounties count them ([[Activities]]); some count a feat only with another member of the guild in the same
  room.
- **What a member gives.** A character keeps its part in its guild's week (`GuildWeek`: the XP given, its counts
  toward the four bounties, its claims). A room told the player's guild (`Guilds`, on land and at sea) gives the
  guild a tenth of the XP they gain, at most 5,000 a week (a tenth of the week's whole gain less what was given, so
  small gains count), measured from a mark it keeps: XP of a character given back
  in place of the starting one, or a jump past any one tick's pay, is measured afresh, never given. A player in no
  guild gives nothing.
- **What the guild gets.** As a room saves a member's character, the accounts add what their record gained since it
  was last counted to the guild: its XP to the guild's and its counts to the guild's week (`guildWeeks.ts`), in one
  write that a save counted twice adds nothing to. A count reaching its bounty's target marks the bounty done, and
  the guild gains 2,500 XP for it once. Joining counts the record as it stands, so nothing done before joining goes to
  the guild.
- **Claiming.** The keeper tells each room which of the week's bounties a player's guild has done, and whether they
  joined before the week turned, and the week it read them for, as it keeps them and every 30 s after, at once when
  their guild changes, and at once as the week turns. On the tab a done bounty offers Claim, asked of the room the
  player is in (ask 75): it pays a guild package, as a faction's (a Vestige at their level, Rare or now and then
  Legendary, and 1,000 Aurem), once a week each, to a member who was in the guild before the week turned. A guild
  bounty is claimed ashore. A claim judged by what was read for another week, or in the ten seconds after the week
  turns over a record of the week before (whose last count is saved meanwhile), answers "The guild’s books
  could not be reached. Try again."
- **The Guild tab** (`client/src/game/guild/`), drawn as the owner's picture of Destiny 2's clan screen: the standard
  at the left at whole multiples of its cells; the name and tag, its members, its motto and description; the week
  with when it turns; the level as a diamond on a rule filled toward the next, with the XP, and the player's weekly
  contribution under it, its square filled at the week's most; the week's bounties as a checklist with the guild's
  counts and a Claim on each one done, a "together" bounty's brass explained under them; the roster at the right,
  those playing first, where each plays in words, with page arrows, and the outposts under it; and four named presses
  down the edge (under the roster in a narrow room): Banner, Details, Outposts and Treasury, the last two opening the
  guild's outposts and its treasury ([[Outposts]]). Its parts stand in the Journal's panels under its heads, every
  word at the menu's label step; where the room is short the middle scrolls, a chip saying more lies below. The page
  asks the accounts for the guild (`GET /v1/guild`), the Roster and the outposts on opening an outpost's page, on
  its Outposts and Treasury presses, when the guild changes elsewhere (the Social tab), and again every 15 s while
  any of its pages is seen; a failed read offers Try again, which reads again. At sea a done bounty offers no
  claim, since no room there answers one. Escape steps back to its home from any of its other pages.
- **The banner editor**, after Destiny 2's: the banner on its staff as it will hang; the nine parts, each naming its
  choice; and the chosen part's choices, each drawn as the banner would look with it, at twice its cells where all of
  them fit the room and at their own where not, with Keep, Draw and Back in the head's line. A line under the head
  names the choice under the pointer or the focus; one the law refuses with the rest stands dimmed, still takes the
  focus, and says why there; a staff not yet earned names the level that opens it. "Draw another" draws a banner
  afresh. Only the founder and admins keep one; a member sees the editor without the press.
- **Details**, beside the banner: the founder and admins set the motto and description from what they are (the
  description read whole under its one-line field, with its count) and invite a player by name; a member reads them.
  Anyone may hold to leave.
- **At an outpost site** a member joins their guild's room for it, named by the guild's key that `GET /v1/guild`
  gives, read afresh on arriving; a player in no guild joins the wild site, and one who goes to a companion joins the
  room the companion is in. Founding, joining or leaving a guild there joins the room it now belongs in. The page
  stands the outpost as the accounts keep it, read on arriving, when the player changes it, when the room's snapshot
  says it stood another plot, and every 15 s: each structure and piece of decoration where the plot's reckoning stands
  it, walled for the page's own body as the room walls it (a piece turned off the quarters as it is drawn), and the
  banner's cloth stirring on the standard. E before a structure's front opens the Outposts page on it, named at its
  tier (the War Horn sounded by the founder or an admin), but at a built Delve Gate goes down at the gate's top tier;
  the founder and admins alone take up a piece of decoration, E held through. A
  bare site stands the Banner Standard's oak staff alone at the plot's middle, saying the outpost is raised from the
  Guild tab.
- **In no guild**, the tab founds one: its name, its tag and the banner made for it before it exists, "Found the
  guild" greyed with its reason until both are written, with the invites waiting, each joined or declined.

## An outpost's room

At the guild's outpost (`node-<site>--guild-<key>`, [[Server]]) a member puts Aurem into the treasury, delivers
materials to a structure being built and takes from the stores, and the founder or an admin sounds the War Horn; the
room asks the accounts for each and gives back what they did not take. The horn calls a High Assessor with four Majors to the muster ground, at
the level of the highest member there raised by the horn's tier (1 Normal, 2 Elite, 3 Abyss), one at a time. Felled,
each player who fought it is paid as a world boss's clear pays, and each member among them takes a guild package,
once a week (`GuildWeek.horn`).

## Limits

- A guild's name and tag are kept as founded; a rename is the owner's, by hand ([[Names]]).
- A claim made at sea is not answered: the sea counts and gives, but claims are a land room's.
