---
type: system
status: live
code:
  - server/accounts/accounts.ts#handle
  - server/accounts/characters.ts#characters
  - server/accounts/discord.ts#callback
  - server/accounts/discord.ts#taken
  - server/accounts/secrets.ts#hashPassword
  - server/accounts/worker.ts#CharacterKeeper
  - server/accounts/migrations/20261117210000_accounts.sql
  - server/accounts/migrations/20261118120000_friends.sql
  - server/accounts/migrations/20261118181357_name_skeletons.sql
  - server/accounts/friends.ts#friendAsk
  - server/accounts/friends.ts#friendsOf
  - server/accounts/migrations/20261118151123_roster.sql
  - server/accounts/roster.ts#rosterOf
  - server/accounts/companies.ts#companyAsk
  - server/accounts/guilds.ts#guildAsk
  - server/accounts/social.ts#socialAsk
  - server/accounts/names.ts#refusalOf
  - server/accounts/people.ts#PERSON
  - server/keeping.ts#Keeper
  - client/src/network/accounts.ts#AccountLink
  - crates/gear/src/character.rs#from_json
---
# Accounts

Who a player is, and the character they keep from one visit to the next
([[Accounts Start as Guests, on Cloudflare D1]]). Every player is an account from their first visit: a guest, who may
add a username and password or sign in with Discord. Their character lives in the accounts' database, and the room
they play in holds it while they are there.

## How it works

- **Their own Worker.** The accounts are a Cloudflare Worker over D1, `overlook-accounts` in `server/accounts/`,
  apart from the rooms, so a deploy of theirs drops no one from a room
  ([[The Accounts Deploy on Each Merge, and the Owner Adds Their Keys]]). Their tables are made by the migrations
  in `server/accounts/migrations/`, applied in order, each once.
- **A guest from the first visit.** A page that holds no session asks for a guest (`POST /v1/guest`) and keeps the
  session's token in the browser. The database keeps only the token's SHA-256, so a copy of it signs no one in.
- **A username and password** may be added to an account that has no username yet (`POST /v1/register`): 3 to 20
  letters, digits or underscores, starting with a letter, one however it is typed, and judged as [[Names]] says: no
  blocked word, nothing that speaks for the game, and nothing too like another player's; a password of 8 to 200
  characters. It is kept as PBKDF2 over SHA-256, 100,000 iterations (the most a Worker derives) with a random salt.
  Signing in with them (`POST /v1/login`) starts a new session for that account, leaving any guest behind. Signing
  out ends the session, and the next visit is a new guest.
- **Discord.** The page keeps a random nonce for its own tab and sends the player to `/v1/discord/start` with it,
  and with a ticket naming its account when it holds a session. Discord sends them back through
  `/v1/discord/callback` to the page with a one-time code in the address's fragment; nothing is signed in or linked
  yet. The page takes the code from `POST /v1/discord/finish`, showing its nonce. A Discord account already linked
  signs in to its account; one not linked links to the ticket's account, which only a session of that account may
  take, and otherwise becomes a new account. The state sent to Discord is used once and must match a cookie set as
  the player left; the code is used once and taken only with the nonce of the tab that began it; each lapses after
  ten minutes. So no one can finish another's sign-in, hand a player their own session, or link a player's Discord
  to their own account. A session's token never travels in an address. The Discord app must list
  `https://overlook-accounts.mackcothran.workers.dev/v1/discord/callback` as a redirect. Without the app's keys,
  Discord sign-in says it is not set up.
- **Slowing guesses and floods.** Each limit is kept by address, an IPv6 address by its /64. One address may make 10
  guests and register 10 times an hour, try 20 sign-ins in ten minutes, and start Discord 20 times in ten minutes;
  one username may be tried 10 times in ten minutes from one address and 100 times from everywhere; one account may
  take 10 Discord tickets in ten minutes. Guessing is held down before a lockout is: a flood of guesses from many
  networks can hold a name's sign-ins for the rest of its ten minutes, while a session already held and Discord still
  sign its owner in. A name no account could hold is refused before it is kept, and a request's body is read only up
  to 2 KB, however it is sent. States, tickets and codes past their time are let go.
- **Sessions lapse, but never a guest's.** A session of an account with a username or Discord lapses once it has
  gone unseen 30 days (each sight, or a room's claim, keeps it a month more); the page then says so and plays on as a
  guest until its player signs in again. A guest's session never lapses: its token is the only way back to it. An
  account with a way back in may sign out everywhere, which ends every session it has; a room already holding its
  character keeps it until that player leaves.
- **Any page may ask.** The API answers any origin: a session travels only as a bearer token, never a cookie, so no
  page acts as a player without holding their token. A write that fails is logged and answered like any other: 409
  when another ask changed the same rows first, 500 otherwise. Discord sends players back only to pages under those listed in
  the Worker's `PAGES`, by origin and path: the published game, `https://lattymoy.github.io/overlook-source/`, and
  under `npm run accounts` the dev server's.
- **Where a session goes.** The page sends its session only to the deployed accounts and rooms, or to accounts and
  rooms on the player's own machine; a link naming any others plays without one. The deployed accounts' session is
  kept apart from any other's.

## The character, kept

- **One room at a time.** A node's room ([[Server]]) holds each signed-in player's character: the gear crate's
  `Character` as JSON ([[Gear]]). A browser, once welcomed, sends its session's token as its one text message; the
  room claims the character with it through the rooms' service binding (`CharacterKeeper`, which only the rooms can
  reach) and gives it to the player, trimming their fight by it.
- **Saved as it changes.** The room saves a character two seconds after its gear changes, and every twenty seconds
  besides; each save holds the character for the room another minute. Leaving, the player's character is saved last
  and let go; a release the accounts do not answer is asked again, then the last save is made on its own and the
  hold left to lapse.
- **Moving between rooms.** A claim waits up to three seconds for the room the player left to let go, then takes the
  character anyway, and a hold its room stopped saving lapses after a minute. A room that loses a character to
  another learns it from its next save and lets the player go, saying their character joined another room.
- **At sea.** The sea room claims and keeps the character too, for its ship's hurts (`ship`: her hull, canvas and men
  in ten-thousandths of whole), where the sea last kept her (`ship_at`, a player who leaves mid-fight kept at the
  port city she would wash up at, as the fight has her), and what floats gathered into it; a deck boarded fights with it, and gives it back
  as the boarder leaves her ([[Naval Combat]], "How a fight ends"). Before the claim is answered the sea plays a new
  character whose ship has the hurts it keeps.
- **What is not kept.** A character the room cannot read is left as it was, untouched, and the player plays one
  that is not kept. The Test Ground's room grants gear to try it, so it keeps no characters, nor does a fleet room;
  nor does a page with no session, playing alone, or on a local room server with no `?accounts=`.

## The Roster

The menu's Social tab is Destiny 1's Roster ([[The Roster Follows Destiny 1, With Blocking]], [[Interface]]), kept by
the accounts; Claude's numbers for it are in [[The Roster and Emblems as Claude Shapes Them]]. Each of its asks needs a
username, as a player is found by theirs; a guest is told to add one in Settings. `GET /v1/roster` answers it whole,
`GET /v1/players/<name>` another player's details, and `POST /v1/social/<ask>` does what a row offers.

- **A player as shown**: their name, their guild's tag, the emblem they wear and their level (from what their room kept
  of their character, `shown`), and where they play: the room that holds their character, or, at sea, the room's word
  that they are there, said every 30 seconds and kept a minute. Leaving the sea ends that word at once, and it is kept
  as when they were last seen.
- **Friends**, by username: asked, accepted or declined, and ended by either. One row a pair, whoever asked, held so by
  the database, so an ask that crosses one already made accepts it. Each player's count is their friends and the asks
  they made, at most 100, so strangers' asks cannot fill it. Accepting or ending with a name no one holds answers as
  for one that never asked.
- **The company**, sized as Destiny's fireteam: three at most, one its leader; a player alone leads their own. A player is
  invited (the invite stands ten minutes, then is let go), or joins as the leader's privacy allows: Public, anyone;
  Friends Only (each player's first setting), the leader's friends; Invite Only, those invited; Closed, no one, though
  an invite still stands. The Roster shows the leader's privacy, the one that applies; a member's own applies once they
  lead. A full company is refused before the player leaves their own, and joining one ends the invites they sent. The
  leader makes another the leader or removes them; a leader who leaves hands the lead to the longest there. A member
  away from the game ten minutes leaves it, but never the player asking.
- **The guild**: a name of 3 to 24 characters, letters and digits starting with a letter, with single spaces, dashes
  or apostrophes between them, none too like another's; a tag of 2 to 4 letters or digits, unique however it is
  typed; and a motto of one line, 80 characters at most, with no control characters or marks that turn the text's
  direction. Each is judged as [[Names]] says. Its founder and admins invite players with no guild, who accept or
  decline; the founder makes members admins and back, either removes those below them, and the founder hands the
  founding to an admin, who must first be made one, in one write, so two at once cannot make two founders. A founder leaves only once another founds it, or alone, which
  ends it. A hundred at most.
- **Blocking** ends a friendship and its ask and the invites either way. What the one blocked asks after is answered
  as sent and never arrives. A block either way between a player and anyone in a company keeps them out of it, by
  joining or by an invite, answered as a company closed to them. The one blocked sees the blocker's details as a
  stranger does, so the block shows nowhere. A blocked player is unblocked from Settings.
- **Reporting** keeps a player's name, who reported them and why (cheating, a name, harassment, something else) for
  the owner to read in the database, ten a day a player. [[Names]] says how the owner reads and acts on a name.
- **The room's own**: the Game column lists the players with a name in the same room beside the company, the guests
  only counted. Another player's details show what they wear always, and where they are only to their friends, company
  and guild. A friend ask still waiting and a guild's invite show no one where the player asked is.
- **Limits**: 60 an hour of the asks that reach another player (a friend ask, an invite, founding a guild).

## Running it here

`npm run accounts` applies the migrations to a local database and runs the accounts on port 8788, beside
`npm run server`; the rooms' binding finds them. The game takes `?accounts=http://127.0.0.1:8788` with its
`?room=ws://127.0.0.1:8787`.

## Limits

- There is no changing a password yet.
- A sign-in derives PBKDF2 at 100,000 iterations, about 50 ms of CPU: on Cloudflare's Workers Free plan, whose
  limit is 10 ms, it would fail. Untested live.
