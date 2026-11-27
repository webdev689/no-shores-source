---
type: system
status: live
code:
  - server/accounts/accounts.ts#handle
  - server/accounts/characters.ts#characters
  - server/accounts/companies.ts#companionsOf
  - server/accounts/discord.ts#callback
  - server/accounts/discord.ts#taken
  - server/accounts/developers.ts#isDeveloper
  - server/accounts/secrets.ts#hashPassword
  - server/accounts/worker.ts#CharacterKeeper
  - server/accounts/worker.ts#LinkedCharacters
  - server/accounts/linked.ts#linkedCharacter
  - server/accounts/linked.ts#linkedPledges
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
  - server/accounts/chat.ts#ChatHall
  - server/accounts/chatDeps.ts#hallDeps
  - server/keeping.ts#Keeper
  - server/accounts/finding.ts#Finder
  - server/accounts/playlists.ts#playlistBand
  - server/accounts/finder.ts#CompanyFinder
  - server/accounts/migrations/20261120181039_found_runs.sql
  - server/accounts/migrations/20261121120000_character_rooms.sql
  - client/src/network/accounts.ts#AccountLink
  - server/accounts/binds.ts#bindsAsk
  - server/accounts/migrations/20261121180000_binds.sql
  - client/src/game/bindsKept.ts#keepBinds
  - crates/gear/src/character_json.rs#from_json
  - crates/gear/src/last.rs#Last
  - crates/room/src/left.rs#stand_where_left
  - server/accounts/lastPlace.ts#lastPlace
  - server/accounts/slots.ts#slotsAsk
  - server/accounts/migrations/20261126003000_character_slots.sql
  - client/src/game/relog.ts#resume
  - client/src/game/relog.ts#keepPlace
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
  take, and otherwise becomes a new account. A ticket given that is used, run out or no ticket answers 400 and starts
  nothing, and a page holding a session whose ticket did not come (the ticket limit, the accounts out of reach) does not
  go to Discord but says why, so a sign-in never makes a new account whose session takes the guest's place. The state
  sent to Discord is used once and must match a cookie set as the player left; the code is used once and taken only with
  the nonce of the tab that began it; each lapses after ten minutes. So no one can finish another's sign-in, hand a
  player their own session, or link a player's Discord to their own account. A session's token never travels in an
  address. The Discord app must list `https://overlook-accounts.mackcothran.workers.dev/v1/discord/callback` as a
  redirect. Without the app's keys, Discord sign-in says it is not set up. The app is the [[Discord Bot]]'s too, one
  application for both: the accounts read `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`, and the bot's keys and its
  own redirect are in its note ("One Discord application").
- **What the Discord bot reads.** The bot reaches the accounts' `LinkedCharacters` through its service binding, never
  a web address: given a Discord user id, the linked account's username, its character's level as its room kept it
  to show (`shown.level`) and the faction it is pledged to, or null when that Discord account is linked to none
  (`linked.ts`). Given up to 1000 Discord ids in one ask (`pledges`), the name of the faction each linked one is
  pledged to, or null for none; an id linked to no account is left out, and more than 1000 answer nothing. Nothing
  else: no account id, no email, no gear.
- **Who is a developer** ([[Developers Launch Activities From a Test Room, in Max Gear]]): an account linked to a
  Discord account that holds a developer's role, as the bot answers through the accounts' binding to its `Members`
  ([[Discord Bot]], "The game module"). The rooms ask through `CharacterKeeper.developer`, with a session's token: its
  account and username for a developer's, null otherwise. No Discord, or a bot that does not answer, is no developer.
- **Slowing guesses and floods.** Each limit is kept by address, an IPv6 address by its /64. One address may make 10
  guests an hour (an IPv6 address by its /48 for guests) and every address together 500
  ([[The Audit's Leftovers Are Fixed as Claude Suggested]]), and one
  address register 10 times an hour, try 20 sign-ins in ten minutes, and start Discord 20 times in ten minutes;
  one username may be tried 10 times in ten minutes from one address and 100 times from everywhere; one account may
  take 10 Discord tickets in ten minutes. Guessing is held down before a lockout is: a flood of guesses from many
  networks can hold a name's sign-ins for the rest of its ten minutes, while a session already held and Discord still
  sign its owner in. A name no account could hold is refused before it is kept, and a request's body is read only up
  to 2 KB, however it is sent. States, tickets and codes past their time are let go.
- **Sessions lapse, and guests go unused.** A session of an account with a username or Discord lapses once it has
  gone unseen 30 days (each sight, or a room's claim, keeps it a month more); the page then says so and plays on as a
  guest until its player signs in again. A guest's session never lapses, its token the only way back to it, but a
  guest made, seen and saved by nothing for 30 days is deleted with all it holds, its character too, ten at a time as
  each new guest is made (`accounts.ts`, "POST /v1/guest"); a page whose guest went makes a new one. An
  account with a way back in may sign out everywhere, which ends every session it has; a room already holding its
  character keeps it until that player leaves.
- **Any page may ask.** The API answers any origin: a session travels only as a bearer token, never a cookie, so no
  page acts as a player without holding their token. A write that fails is logged and answered like any other: 409
  when another ask changed the same rows first, 500 otherwise. Discord sends players back only to pages under those
  listed in the Worker's `PAGES`, by origin and path: the game at `https://noshores.online/play/` (and `www.`), the copy
  still published at `https://lattymoy.github.io/no-shores-source/`, and under `npm run accounts` the dev server's.
- **Where a session goes.** The page sends its session only to the deployed accounts and rooms, or to accounts and
  rooms on the player's own machine; a link naming any others plays without one. The deployed accounts' session is
  kept apart from any other's. A room reads the session's token as it connects, so a sign-in made after the page
  opened (at the story's helm) is the one the rooms use; the helm's account step tells the page the account changed
  as it ends, so the menu's mark and banner and the company HUD ask again and show that account.
- **An ask is given up.** An ask the accounts leave unanswered for 10 s is given up, and answered as the accounts out
  of reach, so nothing waiting on them (the helm's account step) is held.

## The character, kept

- **Four characters, one in play** ([[Each Account Keeps Four Characters, Chosen on a Screen After Destiny 1's]];
  Claude's calls in [[Character Slots and the Test Room as Claude Builds Them]]). The one in play is the `characters`
  row, its `slot` 0 to 3 and its `look` (the figure the page chose, as JSON) beside its body, so the Roster, the bot,
  Find a Company, the guild's weeks, the outposts and the chat read it as the account's character. The other three
  wait in `benched`, one row a slot, each with its body, look, room and the room before, as it was when another was
  chosen; a slot with no row is empty. The vault and Aurem are the account's, in `vaults` (`gear::shared` as JSON), and
  never move as a character is switched or deleted. Each table's rows go with their account, so a guest swept goes
  whole.
- **The vault joined in a room.** A claim answers the account's vault beside the character (`vault`, null before a
  room first kept one apart). The room joins it into the character it gives the player, so the page and every rule
  see one whole character, and each save and the last release send the two parted again (`keptApart`): the accounts
  write the character and the vault in one batch, the vault only while that holder still holds the character, so a
  room that lost it writes neither. A release with no body (turned away) writes neither. A character kept before the
  vault was the account's still holds its own vault and Aurem; the first save after parts them into the account's
  row, once, so nothing is lost or doubled; switched away from or deleted before that, the accounts part them first,
  as the rules would. A switch also counts the guild's week from the chosen character's own record on, so a switch
  back gives the guild nothing twice, and the benched characters' errands keep their answers as the one in play's.
  A vault the room cannot read leaves the character untouched, new or kept, so no save writes an empty vault over it.
  Either side deployed first loses nothing: a room meeting accounts older than the vault (a claim with no `vault` at
  all) lets the character go untouched and plays it unkept, and the accounts save the body of a room older than the
  vault alone (a save with no vault), its vault still in it.
- **One room at a time.** A node's room ([[Server]]) holds each signed-in player's character: the gear crate's
  `Character` as JSON ([[Gear]]). A browser, once welcomed, sends its session's token as its one text message; the room
  claims the character with it through the rooms' service binding (`CharacterKeeper`, which only the rooms can reach)
  and gives it to the player, trimming their fight by it. One account is one player in a room: a second socket of theirs
  signed in (a rejoin before the room saw the first close, or a second tab) sends the first away as played elsewhere
  before it is given the character, so a run keeps the first one's body for it, and the rules refuse to note one account
  for two players (`Room::own`; at sea `Sea::own`, so a second tab moves nothing floating or owed to the first). While
  the accounts hold what this room last saved of the first, and gave no errand's answer onto it since, the room's own
  body of it is the newest, and the second takes that on, saved anew under its hold; first the first one's chests are
  opened and what lies for them is posted to their mail, as at a leave. A rejoin's old socket is one the page let go of
  already, so it plays on; a second tab's page stops there and joins no more, so two tabs never take the character back
  and forth.
- **Saved as it changes.** The room saves a character two seconds after its gear changes, and every twenty seconds
  besides; each save holds the character for the room another minute. Leaving, the player's character is saved last
  and let go; a release the accounts do not answer is asked again, then the last save is made on its own and the
  hold left to lapse.
- **Moving between rooms.** A claim waits up to three seconds for the room the player left to let go, then takes the
  character anyway, and a hold its room stopped saving lapses after a minute. A room that loses a character to
  another learns it from its next save and lets the player go, saying their character joined another room (4001),
  and that page joins no more ([[Server]], "Joining again"). Each claim keeps the room that claims it (`room`, from
  its holder's name) and answers the room that held it before (`came_from`, null before any did;
  [[The Server Is the Authority Over Everything]]) and the account's username (null for a guest) and its guild's tag
  (null in none), which the room puts on the player's plate, and a look answers the room that last held it; a room that
  lets a character go untouched (its gate shut, or it never gave it) was never where it was, so the room before is its
  last again. The rooms judge where a character comes from by these alone ([[Server]], "Where a character comes from").
- **Gated.** Before giving a character, the room asks its gate ([[Activities]]). It judges the character with the
  story the player already holds in the room carried forward, since the page may tell the room the prologue is done
  before the accounts answer; the story only moves forward. One the gate shuts, or a new one where the prologue is
  needed, is let go untouched, and the player is sent away with the reason. At sea and on a sea island the gate is
  the seas' tier alone.
- **A run keeps to its company.** A run's room ([[Activities]]) gives a character to the first to come, then only
  to one it let in before or a companion of someone it let in, for as long as it lives: one of their company's
  members (`companions(account, room)`, longest there first, or the player alone), or one the run was found for with
  them by Find a Company (`found_runs`, which admits them for a day after it was found). A group found is no company,
  and lets its members in together to that one run alone. Any other is let go untouched, and the player sent away saying
  "This run is another company's.".
- **At sea.** The sea room claims and keeps the character too, for its ship's hurts (`ship`: its hull, canvas and men
  in ten-thousandths of whole), where the sea last kept it (`ship_at`, a player who leaves mid-fight kept at the
  port city it would wash up at, as the fight has it), and what floats gathered into it; a deck boarded fights with it,
  and gives it back as the boarder leaves it ([[Naval Combat]], "How a fight ends"). Before the claim is answered the
  sea plays a new character whose ship has the hurts it keeps.
- **Where a player logs back in** ([[A Player Logs Back In Where They Left the Overworld or a Social Space]]). The
  character keeps the last place it left of the overworld and the social spaces (`last`, `gear::last::Last`): the sea,
  written by the sea room as it keeps a ship at sea, or a social space's node with where the player stood, to the
  centimetre, and the way they faced, kept on the character by that room each tick while they stand there on their
  feet, alive (`keep_spots`), so a save made mid-jump or after a fall keeps the last spot they stood at. No other
  room writes it, so one who logs out in a patrol zone, a dungeon or on an island comes back to whichever of
  the two they were in last, but a character on a dive whose last room was a room of its dive's zone, not homeward,
  logs back into that zone, as does a public dive whose last room was the zone it went on from (reloaded on the way
  between; a company's route there is its company's to find, so it comes back as above) ([[Passages]], "A dive").
  `GET /v1/me` answers it beside the account (`place`: `{ "kind": "sea" }`,
  `{ "kind": "social", "node", "at", "facing" }` in metres and radians, `{ "kind": "passage", "room" }` the zone's first
  public room or its company's route's own, or null; `lastPlace.ts`). After the title the page goes there (`relog.ts`):
  aboard, where the sea room puts the ship it kept; into the dive's zone, which takes the dive back as its rejoin
  (`PassageGame.resumeIn`; a zone the page cannot lay or join leaves them at Overlook); or into that social space,
  joining its room with `?relog=1`, and the room stands a player whose character last stood in it where they left it, on
  the floor they stood on (`stand_where_left`; where a body no longer fits there, at a spawn). Only logging back in asks
  it: travelling there, taking a gate or coming back from an activity arrives at the arrival. A link dropped and
  joined again keeps the ask, so one who logged back in stands again at the spot last saved. One who has just played
  the story through, one with none kept, or one whose social space is not open on the landmass arrives at Overlook.
  The sea's tier is Normal, as every voyage's begins. Offline, where no room keeps a character, the page keeps the
  place itself in the browser (`noshores.place`, within a second of each change and as the page hides or goes,
  `keepPlace`), the ship where it lay and the player's spot across, not its height, and resumes from it the same way,
  the player on the ground under the spot. A page reloaded the moment it leaves a room may read the place before that
  room has saved it, and so resumes at the one before.
- **What is not kept.** A character the room cannot read is left as it was, untouched, and the player plays one
  that is not kept, or in a run, which keeps no one unkept, is sent away. A socket with no session, its token none in
  five seconds or no session at all, is sent away from any room that keeps characters ([[Server]], "The host"). The
  Test Ground's room grants gear to try it, so it keeps no characters, nor does a fleet room; nor does a page playing
  alone. A page on a local room server with no `?accounts=` holds no session, so a node's room there sends it away.

## The Roster

The menu's Social tab is Destiny 1's Roster ([[The Roster Follows Destiny 1, With Blocking]], [[Interface]]), kept by
the accounts; Claude's numbers for it are in [[The Roster and Emblems as Claude Shapes Them]]. Each of its asks needs a
username, as a player is found by theirs; a guest is told to add one in Settings. `GET /v1/roster` answers it whole,
`GET /v1/players/<name>` another player's details, and `POST /v1/social/<ask>` does what a row offers.

- **A player as shown**: their name, their guild's tag, the emblem they wear and their level (from what their room kept
  of their character, `shown`), and where they play: the room that holds their character, or, at sea, the room's word
  that they are there and in which water, said every 30 seconds and as soon as the water changes, and kept a minute
  (`presence`). Leaving the sea ends that word at once, and it is kept as when they were last seen. The water is for
  the chat alone ([[Chat]]); the Roster shows the room.
- **Friends**, by username: asked, accepted or declined, and ended by either. One row a pair, whoever asked, held so by
  the database, so an ask that crosses one already made accepts it. Each player's count is their friends and the asks
  they made, at most 100, so strangers' asks cannot fill it. Accepting or ending with a name no one holds answers as
  for one that never asked.
- **The company**: eight at most, as a Breach's run is for ([[Breaches]]; every other run holds four), one its leader;
  a player alone leads their own. A player is invited (the invite stands ten minutes, then is let go), or joins as the
  leader's privacy allows: Public, anyone; Friends Only (each player's first setting), the leader's friends; Invite
  Only, those invited; Closed, no one, though an invite still stands. The Roster shows the leader's privacy, the one
  that applies; a member's own applies once they lead. A full company is refused before the player leaves their own, and
  joining one ends the invites they sent. The leader makes another the leader or removes them, each only while they
  still lead and the other is still in it as it is written, so one who moved on meanwhile is never taken from their new
  company; a leader who leaves hands the lead to the longest there. A member away from the game ten minutes leaves it,
  but never the player asking.
- **The guild**: a name of 3 to 24 characters, letters and digits starting with a letter, with single spaces, dashes
  or apostrophes between them, none too like another's; a tag of 2 to 4 letters or digits, unique however it is
  typed; and a motto of one line, 80 characters at most, with no control characters or marks that turn the text's
  direction. Each is judged as [[Names]] says. Its founder and admins invite players with no guild, who accept or
  decline; the founder makes members admins and back, either removes those below them, and the founder hands the
  founding to an admin, who must first be made one, in one write, so two at once cannot make two founders. Every
  such write holds only while both are still in that guild at the ranks read, so a rank never lands in another guild
  and a guild never loses its founder. An invite unanswered is kept 30 days. A founder leaves only once another founds
  it, or alone, which ends it; a member leaves only at the rank read, so a founding handed to them as they leave keeps
  its founder. A hundred at most. Its banner, description and level, and the Guild tab's own read (`GET /v1/guild`), are
  in [[Guilds]].
- **Blocking** ends a friendship and its ask and the invites either way. What the one blocked asks after is answered
  as sent and never arrives. A block either way between a player and anyone in a company keeps them out of it, by
  joining or by an invite, answered as a company closed to them. The one blocked sees the blocker's details as a
  stranger does, so the block shows nowhere. A blocked player is unblocked from Settings.
- **Muting** ([[A Player May Mute Another]]) hides only a player's chat lines and Whispers, one way: nothing else
  changes, and the one muted is never told. `POST /v1/social/mute` and `unmute` with a name; the Roster lists the
  muted (`muted`), 200 at most, kept in the `mutes` table, each unmuted from Settings.
- **Reporting** keeps a player's name, who reported them and why (cheating, a name, harassment, something else) for
  the owner to read in the database, ten a day a player. [[Names]] says how the owner reads and acts on a name.
- **The room's own**: the Game column lists the players with a name in the same room beside the company, the guests
  only counted. Another player's details show what they wear always, and where they are only to their friends, company
  and guild, and their guild's motto and description. A friend ask still waiting and a guild's invite show no one where
  the player asked is.
- **Limits**: 60 an hour of the asks that reach another player (a friend ask, an invite, founding a guild); 600 an
  hour of one account's outpost asks and its rooms' errands together, and 600 an hour of its plot reads apart.
- **Outposts** ([[Outposts]]): `GET /v1/outposts` gives a member their guild's outposts, its treasury and ledger, the
  site they stand at, what they took from the stores this game day (`taken`, the day turning at 09:00 UTC) and whether
  the War Horn sounded this week (`hornSounded`); `GET /v1/outposts/<room>` gives anyone signed in the plot and banner
  of an outpost raised there, null where none is. `POST /v1/social/outpost/<ask>` raises, places, rises, removes,
  decorates, undecorates, collects and abandons; a removal or abandonment answers `back`, the Aurem the treasury took of
  the half, the rest lost when it is full, and writes its ledger line even when that is nothing (a free standard's
  removal, which cost nothing, writes none). A page's named ask (`rid`) answers again as it did. A room's errands go
  over its binding: a deposit (its id begins with the room's name, so it goes only to that outpost's guild), a delivery,
  a take and the horn, each answered again the same under its id (`outpost_errands`; forgotten a week on once no saved
  character carries the errand, `forgetAnswers`), read before anything that may have changed since; past the limit each
  says so (a deposit `limited`, the rest -3). A take holds within the day's 20 across the guild's outposts inside its
  write.

## Find a Company

Find a Company ([[Activities]]) matches players for an Elite Dungeon at Normal, the Elite Dungeon of the week and
each playlist, never the Abyss Dungeon of the week, whose company forms it.

- **The queue** is a Durable Object of the accounts' Worker, one for each run's base (`CompanyFinder`, `finder.ts`),
  reached at `/v1/find/<base>` by WebSocket: `node-<id>` for an Elite Dungeon at Normal from its door and
  `node-<id>--sea` from the sea, `node-<id>--elite` for the week's from its door and `node-<id>--elite--sea` from the
  Playlist (each `--sea` base's run named `--sea`, gone into from the sea),
  `playlist-elite` and `playlist-abyss` for the playlists, one queue each for the whole game, whichever
  port the Playlist was opened beside, and `node-gullwing-vale--breach-normal` and `--breach-hard` for the Drowned
  Vale, the one zone a Breach's gate stands in (`BREACH_ZONES`). A socket's first message is its session's token; one
  that is no session, or that sends none within five seconds (`TOKEN_WAIT_MS`, as a run's room waits), is closed with
  4003 and "Sign in to find a company.". At most 64 sockets with a token wait in one (a search past them is answered
  503; a Launch is taken past searches, as it is gone at the next look, but past 64 Launches with a token it is answered
  503 too, `launchesFull`), and at most 64 silent ones, the oldest let go as each new one comes, so silent sockets never
  shut out those that sign in; its clock stops once it holds none. It checks a base's shape alone, not that a rule lays
  it: the accounts' Worker does not load the rules, and the room judges the run.
- **Bands.** A seeker is matched by the level their room last kept (`shown.level`, 1 for none yet), in bands of ten:
  1 to 10, 11 to 20 and 21 to 30 (`bandOf`). A playlist's are five levels each from the level it opens at
  (`playlistBand`, `playlists.ts`): the Elite's 10 to 14 up to 30 alone, the Abyss's 20 to 24 up to 30 alone; a
  seeker below it is closed with 4003 and "The Elite Playlist opens at level 10." (or the Abyss's at 20). Its levels
  and the 18 Elite Dungeons are the rules' own, which a test holds to the room module's word (`playlists.test.ts`).
  A seeker whose kept character has not played the prologue (`story.prologue`, none for one never kept) is closed
  with 4003 and the gate's "This place opens after the prologue.", as every run a finder starts opens after it; one
  under the week's Elite Dungeon's level, on its bases, with "This dungeon opens at level 24." (`WEEK_ELITE_OPENS`).
- **Launch** (`?launch` on a playlist's address, `opened(socket, alone)`): the seeker's run is started at the next
  look, alone, its Elite Dungeon drawn and kept for them as a found run is; no other seeker joins it, and it joins no
  group. Only a playlist and a Breach launch: on an Elite Dungeon's base a launch waits as any search does. A Breach
  is only launched ("A Breach is launched by its company from the Playlist."): at its tier's level (24, Hard 28) and,
  at Hard, once the character has won it at Normal (`story.breaches`); its run is named for its zone's gate, and its
  company may come to the gate from anywhere for half an hour after (`LAUNCH_ARRIVES_MS`). A playlist's run
  lets in first one it was found or launched for, or one of their company (`launchedFor`), as it would let them
  in after them: a member back first, the room forgotten while empty, is not shut out.
- **Matching** (`Queue`): within a band, the one waiting longest first, then each next longest still free who blocks
  none of those taken and is blocked by none of them. A run starts with four as soon as there are four, or with as
  many as there are once its first has waited a minute (`FIND_WAIT_MS`). It looks each second while it holds a
  socket.
- **One search an account.** A second search, in another tab, replaces the first, which is closed with 4003 and
  "You are finding a company in another tab."; of two looked up at once, the newer socket stays. While an account's run
  is being started, a second search of theirs is closed with those words, so no account is in two groups. Closing the
  socket leaves the queue.
- **A run found** is named `<base>--run-<instance>`, a playlist's
  `node-<Elite Dungeon>--<elite|abyss>--playlist-<foes' level>--run-<instance>`, its Elite Dungeon drawn by the
  server's own randomness (`playlistRun`) and its foes' level its band's, and kept for those found (`found_runs`: it
  admits them for a day after it was found, and rows older than that are cleared as later runs are found), so its room
  lets them in together, for that run alone; no one's company changes. Each is sent `{"run":"<name>"}` and their socket
  closed. Beyond the level and the prologue the finder judges no gate and keeps no clock: the room is the authority, and
  the page offers Find a Company only where the gate is open.
- **The page's side** (`findCompany`): it opens `AccountLink.finderAt(base)`, the accounts' own address by `ws://`
  or `wss://`, sends the session's token once open, and takes only a run of the base it asked for (for a playlist,
  a playlist's run at its tier). Offline, or with
  no session, it offers none.

## Chat

The chat's one hall is a Durable Object of this Worker too, `ChatHall`, reached at `/v1/chat` by WebSocket ([[Chat]]):
it signs a socket in with its session's token, asking again once a minute; places Local by the room in `presence` and
Region by its water; keeps blocks as the Roster does, and mutes; and holds each account to four sockets and two lines a
second across them, and each address to eight sockets waiting to sign in. Its questions of the database are `hallDeps`.

## Binds

The controls a player binds are kept with their account, so they follow them to any browser
([[Every Control Can Be Rebound, and the Pad Plays as Destiny's]], [[Interface]], "Binding a control"). The `binds`
table holds one row an account: what differs from the game's defaults, as JSON, and when it was saved.

- **`GET /v1/binds`** answers the signed-in player's binds, or null where none are kept; a guest is an account, so a
  guest's are kept too.
- **`PUT /v1/binds`** keeps what is sent as `binds`, in place of what was kept, as the game's own table of controls
  reads it (`readOverrides`, which the Worker imports from the page's code): a known control's keys and its pad
  buttons, each a list of at most three different names the game knows (a key, a mouse button for a control that
  hears one, a pad button, a button held or two together; a stick's ways only where the control is on them). What
  does not read, as a page of another build may send, is left out and the rest kept; a control kept under the name
  `menu` is read as the leave held, its key held now where it was pressed
  ([[The Key Strip Is a Compact Panel, a Held Key Leaves, and Settings Has Tabs]]). A body past 8 KB, or one that is
  no object of controls, is refused and nothing changes. 120 reads and saves together an hour an account.
- **The page** reads them once the account is known and binds them, and reads again when another account signs in
  (that account's, or the defaults where it kept none); each change is sent a moment and a half after the last
  (`keepBinds`). It keeps what still reads; a default that now stands on a key the player kept for another control
  gives that key up, so what the player bound stays theirs, and two kept binds that clash both go back to their own
  (`withOverrides`). A save
  waits on a read that answers, so nothing is kept over binds never read: what the player bound before the read is
  laid over what the account kept, and that is saved. Where the accounts do not answer, the game plays on with what
  it has, the defaults at first, and saves nothing until a read answers.

## The four characters

The character screen reads and changes the four by the session's bearer token, 120 asks an hour an account
(`slots.ts`).

- **`GET /v1/characters`** answers `playing` (the slot in play), `developer` (asked of the bot, "Who is a developer"),
  `aurem` (the account's, or the character in play's while no vault is kept apart yet) and `slots`, four entries by
  slot: null for an empty one, else its `slot`, `shown` (as the Roster reads it, null before a room kept one), `pledge`
  (the faction's number, or null), `look` (or null), `place` (where it logs back in, as `/v1/me`'s), `prologue`
  (whether it played the story through) and `saved` (when it was last saved, in ms). A slot in play with no body and
  no look is empty.
- **`POST /v1/characters/play`** with `{ "slot" }` makes that slot the one in play: the one in play goes to the bench
  (unless empty) and the chosen one comes off it, or a new character for an empty slot, who plays the prologue; one
  batch. It waits while a room holds the one in play, refused 409 "Your character is still in a room. Try again in a
  moment."; the slot already in play answers as `GET`; a slot outside 0 to 3 is refused 400. Answers as `GET`.
- **`POST /v1/characters/delete`** with `{ "slot" }` deletes a benched character, or empties the one in play (its slot
  stays in play; refused 409 while a room holds it). The vault stays the account's. Answers as `GET`.
- **`PUT /v1/characters/look`** with `{ "look" }` keeps the look of the one in play: an object of `body`, `race`,
  `tone` and `hair` as the page writes it, at most 512 characters as JSON; anything else is refused 400. Answers 204.
- **`GET /v1/me`**'s `place` is the character in play's, and `playing` its slot, so the page keeps what it keeps by
  character under the right one however it came in.
- **A switch or a deletion** answers 409 as held when a room claimed the character in play between the accounts'
  read and their write, which then changed nothing.

## Running it here

`npm run accounts` applies the migrations to a local database and runs the accounts on port 8788, beside
`npm run server`; the rooms' binding finds them, and Find a Company runs there too. The game takes `?accounts=http://127.0.0.1:8788` with its
`?room=ws://127.0.0.1:8787`.

## Limits

- There is no changing a password yet.
- A sign-in derives PBKDF2 at 100,000 iterations, about 50 ms of CPU: on Cloudflare's Workers Free plan, whose
  limit is 10 ms, it would fail. Untested live.
