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
  sends the page's token again, as a username taken does, and the room reads the plate again. The plate reads
  `Ada [SALT]`, the tag a shade fainter ([[Interface]], "Players").
- **Levels.** A guild's level comes from its XP: ten levels, from 15,000 for level 2 to 800,000 for level 10
  (`content/guilds/guilds.json`, `guildLaw.ts`). A level reached is never lost.
- **The Guild tab** (`client/src/game/guild/`), drawn as the owner's picture of Destiny 2's clan screen: the standard
  at the left at whole multiples of its cells; the name and tag, its members, its motto and description; the week
  with when it turns; the level as a diamond on a rule filled toward the next, with the XP; the guild's details; the
  roster at the right, those playing first, with page arrows; and four presses down the edge: Banner, Details,
  Outposts and Treasury. The page asks the accounts for the guild (`GET /v1/guild`) and the Roster, again every 15 s
  while it is seen. Escape steps back to its home from any of its other pages.
- **The banner editor**, after Destiny 2's: the banner on its staff as it will hang; the nine parts, each naming its
  choice; and the chosen part's choices, each drawn as the banner would look with it, at twice its cells. A choice the
  law refuses with the rest stands greyed, saying why; a staff not yet earned names the level that opens it. "Draw
  another" draws a banner afresh. Only the founder and admins keep one; a member sees the editor without the press.
- **Details**: the founder and admins set the motto and description and invite a player by name; a member reads them.
  Anyone may hold to leave.
- **In no guild**, the tab founds one: its name, its tag and the banner made for it before it exists, with the
  invites waiting, each joined or declined.

## Limits

- A guild's name and tag are kept as founded; a rename is the owner's, by hand ([[Names]]).
- The week is drawn and shown; what a guild earns in it comes with the guild bounties.
