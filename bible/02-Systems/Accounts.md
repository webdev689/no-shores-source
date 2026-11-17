---
type: system
status: live
code:
  - server/accounts/accounts.ts#handle
  - server/accounts/characters.ts#characters
  - server/accounts/discord.ts#callback
  - server/accounts/secrets.ts#hashPassword
  - server/accounts/worker.ts#CharacterKeeper
  - server/accounts/migrations/0001_accounts.sql
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
  letters, digits or underscores, starting with a letter, one however it is typed; a password of 8 to 200
  characters. It is kept as PBKDF2 over SHA-256, 100,000 iterations (the most a Worker derives) with a random salt.
  Signing in with them (`POST /v1/login`) starts a new session for that account, leaving any guest behind. Signing
  out ends the session, and the next visit is a new guest.
- **Discord.** The page sends the player to `/v1/discord/start`, with a ticket naming its account when it holds a
  session, and Discord sends them back through `/v1/discord/callback` to the page, the outcome in the address's
  fragment. A Discord account already linked signs in to its account; one not linked links to the page's account if
  that has no Discord yet, and otherwise becomes a new account. The state sent to Discord lasts ten minutes, is used
  once, and must match a cookie set as the player left, so a sign-in begun in one browser finishes in no other. The
  Discord app must list `https://overlook-accounts.mackcothran.workers.dev/v1/discord/callback` as a redirect.
  Without the app's keys, Discord sign-in says it is not set up.
- **Slowing guesses and floods.** One address may make 10 guests and register 10 times an hour, and try 20
  sign-ins in ten minutes; one username may be tried 10 times in ten minutes.
- **Any page may ask.** The API answers any origin: a session travels only as a bearer token, never a cookie, so no
  page acts as a player without holding their token. Discord sends players back only to the pages listed in the
  Worker's `PAGES`: the live page and the dev server's.

## The character, kept

- **One room at a time.** A node's room ([[Server]]) holds each signed-in player's character: the gear crate's
  `Character` as JSON ([[Gear]]). A browser, once welcomed, sends its session's token as its one text message; the
  room claims the character with it through the rooms' service binding (`CharacterKeeper`, which only the rooms can
  reach) and gives it to the player, trimming their fight by it.
- **Saved as it changes.** The room saves a character two seconds after its gear changes, and every twenty seconds
  besides; each save holds the character for the room another minute. Leaving, the player's character is saved last
  and let go.
- **Moving between rooms.** A claim waits up to three seconds for the room the player left to let go, then takes the
  character anyway, and a hold its room stopped saving lapses after a minute. A room that loses a character to
  another learns it from its next save and lets the player go, saying their character joined another room.
- **What is not kept.** A character the room cannot read is left as it was, untouched, and the player plays one
  that is not kept. The Test Ground's room grants gear to try it, and the sea holds none, so neither keeps
  characters; nor does a page with no session, playing alone, or on a local room server with no `?accounts=`.

## Running it here

`npm run accounts` applies the migrations to a local database and runs the accounts on port 8788, beside
`npm run server`; the rooms' binding finds them. The game takes `?accounts=http://127.0.0.1:8788` with its
`?room=`.
