---
type: system
status: live
code:
  - server/accounts/names.ts#refusalOf
  - server/accounts/names.ts#blocked
  - server/accounts/names.ts#reserved
  - server/accounts/names.ts#skeleton
  - server/accounts/blockedWords.ts#BLOCKED
  - server/accounts/guilds.ts#found
  - server/accounts/migrations/20261118181357_name_skeletons.sql
---
# Names

Every name and line a player sets for others to read follows guidelines, and the accounts check it
([[Names Follow Guidelines, Checked by the Accounts]]). One judge in the [[Accounts]]' Worker reads each before it is
kept: usernames, guild names, guild tags and guild mottos. Claude's calls for it are in that decision.

## What a name may be

- **A username**: 3 to 20 letters, digits or underscores, starting with a letter.
- **A guild name**: 3 to 24 characters: letters and digits, starting with a letter, with single spaces, dashes or
  apostrophes between them.
- **A guild tag**: 2 to 4 letters or digits.
- **A motto**: one line of 80 characters at most, with no control characters or marks that turn the text's direction.

None of them may hold a slur, an obscenity or a sexual term. A username, guild name or tag may not claim to speak for
the game. A new username or guild name may not look like one already kept.

## How it is checked

- **Blocked words.** A list of 79 roots, written for No Shores, kept in ROT13 so the repo never shows them. The text
  is read as a reader takes it: lower case, accents dropped, and 0, 1, 3, 4, 5, 7, @, $ read as o, i, e, a, s, t, a,
  s. A "!" is an i only before a letter. A run of one letter counts once, unless the root spells it twice.
- **Where a root counts.** A root of four letters or more counts inside a word. It also counts across words that
  spell it whole, or that begin it in pieces of one or two letters, as when its letters are spaced, dotted or dashed
  apart. It never counts from inside one word into the next, so "Push it" passes. A shorter root counts only as whole
  words, so Cassandra and Sussex pass.
- **Reserved names.** Admin, administrator, moderator, mod, staff, owner, No Shores, Overlook, Vestige, official,
  system, sysop, support, GM, game master, dev, developer, server, guest, null and undefined, and some plurals. Each
  is refused as the whole name, or as its first or last one or two words ("Overlook Staff", "Admin_Ray",
  "NoShores_Ray"; [[The Game Is Named No Shores]]). A capital after a small letter starts a word ("AdminRay"), and
  look-alike letters count ("Adm1n").
- **Look-alikes.** A name's skeleton is how it looks: lower case, 0 as o, 1, l and | as i, 5 as s, rn as m, vv as w,
  with no spaces, dashes, apostrophes, underscores or dots. Each account keeps its username's skeleton
  (`name_skeleton`), and each guild its name's (`name_key`), and no two share one.

| Refused | The player is told |
|---|---|
| A blocked or reserved username or guild name | That name is not allowed. Choose another. |
| A blocked or reserved tag | That tag is not allowed. Choose another. |
| A motto with a blocked word | That motto is not allowed. |
| A username like another's | That name is too like another player's. |
| A guild name like another's | That name is too like another guild's. |
| The same name, however typed | That username is taken. That name or tag is taken. |

A refusal never says which word it found.

## When one gets through

Players report a name from the Roster with the reason "An offensive name". The report is kept in the `reports` table
with the reason `name`. The owner reads and acts on them with Wrangler, signed in to Cloudflare (`npx wrangler login`),
from a folder with no Wrangler settings, such as the repo's root.

The reports of names, newest first, with each player's guild:

```sh
npx wrangler d1 execute overlook-accounts --remote --command "SELECT reports.created_at, reported.id, reported.username, guilds.id AS guild_id, guilds.name AS guild, guilds.tag, guilds.motto, reporter.username AS reporter FROM reports JOIN accounts AS reported ON reported.id = reports.reported_id JOIN accounts AS reporter ON reporter.id = reports.reporter_id LEFT JOIN guild_members ON guild_members.account_id = reported.id LEFT JOIN guilds ON guilds.id = guild_members.guild_id WHERE reports.reason = 'name' ORDER BY reports.created_at DESC LIMIT 50"
```

To rename an account, put its `id` in place of `ID`. Its name becomes `Renamed_` and the start of its id, and its
key and skeleton are set with it. The player signs in with the new name and the same password, or with Discord.

```sh
npx wrangler d1 execute overlook-accounts --remote --command "UPDATE accounts SET username = 'Renamed_' || substr(id, 1, 8), username_key = 'renamed_' || substr(id, 1, 8), name_skeleton = replace(replace(replace(replace(replace(replace(replace('renamed_' || substr(id, 1, 8), '0', 'o'), '1', 'i'), 'l', 'i'), '5', 's'), 'rn', 'm'), 'vv', 'w'), '_', '') WHERE id = 'ID'"
```

To rename a guild, and clear its tag and motto, put its `guild_id` in place of `ID`. Its name becomes `Renamed ` and
the start of its id, and its tag the id's first four characters.

```sh
npx wrangler d1 execute overlook-accounts --remote --command "UPDATE guilds SET name = 'Renamed ' || substr(id, 1, 8), name_key = replace(replace(replace(replace(replace(replace(replace('renamed ' || substr(id, 1, 8), '0', 'o'), '1', 'i'), 'l', 'i'), '5', 's'), 'rn', 'm'), 'vv', 'w'), ' ', ''), tag = upper(substr(id, 1, 4)), tag_key = substr(id, 1, 4), motto = '' WHERE id = 'ID'"
```

To clear only a guild's motto: `UPDATE guilds SET motto = '' WHERE id = 'ID'`. If a rename is refused as not unique,
run it again with `substr(id, 25, 8)` and `substr(id, 25, 4)` in place of each `substr(id, 1, 8)` and
`substr(id, 1, 4)`.

## Limits

- A determined player can spell past the list, as with letters from another alphabet. Reports catch what gets
  through.
- A few ordinary words hold a blocked root and are refused, such as Scunthorpe, shiitake and "the pen is". Their
  players choose another.
- A player cannot rename themselves. A renamed account keeps its new name until the owner renames it again.
- Usernames kept before the look-alike check that look alike keep their names. Only the oldest of them holds the
  skeleton.
- A reserved word in the middle of a name passes ("Ray Admin Bob").
