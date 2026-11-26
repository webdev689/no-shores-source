---
type: system
status: planned
code:
  - server/bot/worker.ts#handle
  - server/bot/worker.ts#tick
  - server/bot/interactions.ts#interactionRoute
  - server/bot/crypto.ts#discordSigned
  - server/bot/auth.ts#startLogin
  - server/bot/auth.ts#finishLogin
  - server/bot/auth.ts#exchange
  - server/bot/panel.ts#panelRoute
  - server/bot/panel.ts#levelIn
  - server/bot/panelMessages.ts#testMessage
  - server/bot/media.ts#mediaRoute
  - server/bot/scrub.ts#scrubPicture
  - server/bot/rest.ts#createRest
  - server/bot/store.ts#readConfig
  - server/bot/store.ts#writeConfig
  - server/bot/store.ts#forgetLeftServers
  - server/bot/gateway.ts#BotGateway
  - server/bot/gatewayCore.ts#GatewayCore
  - server/bot/gatewayLaw.ts#BOT_INTENTS
  - server/bot/dispatch.ts#createDispatcher
  - server/bot/cache.ts#createCache
  - server/bot/registry.ts#SERVER_MODULES
  - server/bot/registry.ts#moduleHandlers
  - server/bot/modules/module.ts#ServerModule
  - server/bot/slots.ts#slotsFor
  - server/bot/kit.ts#BotContext
  - server/bot/commands.ts#PANEL_COMMAND
  - server/bot/commands.ts#writeCommands
  - tools/botCommands.ts
  - .github/workflows/bot.yml
  - .github/deploy-ready.sh
  - server/bot/law/access.ts#levelOf
  - server/bot/law/access.ts#roleRefusal
  - server/bot/law/settings.ts#validate
  - server/bot/law/settings.ts#salvage
  - server/bot/law/modules.ts#BOT_MODULES
  - server/bot/law/message.ts#messagePayload
  - server/bot/law/messageJson.ts#messageFromJson
  - server/bot/migrations/20261124120000_core.sql
  - server/bot/migrations/20261124120100_messages.sql
  - server/bot/wrangler.jsonc
  - server/bot/modules/moderation.ts#moderationModule
  - server/bot/modules/moderationCases.ts#moderate
  - server/bot/modules/logs.ts#logsModule
  - server/bot/modules/automod.ts#syncRules
  - server/bot/modules/automod.ts#breaks
  - server/bot/modules/antiraid.ts#antiraidModule
  - server/bot/migrations/20261124130000_safety.sql
  - server/bot/modules/welcome.ts#welcomeModule
  - server/bot/modules/card.ts#cardUrl
  - server/bot/modules/card.ts#cardRoute
  - server/bot/modules/cardDrawing.ts#drawCard
  - server/bot/modules/cardLetters.ts#letterRows
  - server/bot/modules/png.ts#decodePng
  - server/bot/modules/png.ts#encodePng
  - server/bot/modules/levels.ts#levelsModule
  - server/bot/modules/levels.ts#publicBoard
  - server/bot/modules/roleMenus.ts#roleMenusModule
  - server/bot/modules/tags.ts#tagsModule
  - server/bot/modules/announce.ts#announceModule
  - server/bot/migrations/20261124130100_community.sql
  - server/bot/modules/giveaways.ts#giveawaysModule
  - server/bot/modules/polls.ts#pollsModule
  - server/bot/modules/polls.ts#suggestModule
  - server/bot/modules/starboard.ts#starboardModule
  - server/bot/modules/tickets.ts#ticketsModule
  - server/bot/modules/birthdays.ts#birthdaysModule
  - server/bot/modules/tempVoice.ts#tempVoiceModule
  - server/bot/modules/invites.ts#invitesModule
  - server/bot/modules/stats.ts#statsModule
  - server/bot/modules/socials.ts#socialsWith
  - server/bot/migrations/20261124130200_engagement.sql
  - server/bot/migrations/20261125100000_clock_indexes.sql
  - server/bot/migrations/20261125110000_bot_ban_asks.sql
  - server/bot/migrations/20261125130000_feeds.sql
  - server/bot/migrations/20261125150000_panel_guilds.sql
  - server/bot/modules/game.ts#gameModule
  - server/bot/modules/gameHouses.ts#houseRoleKeeping
  - server/bot/modules/gameDevelopers.ts#isDeveloper
  - server/bot/main.ts#Members
  - server/bot/law/gameShape.ts#GAME_SHAPE
  - server/accounts/linked.ts#linkedCharacter
  - server/accounts/linked.ts#linkedPledges
  - server/bot/modules/layout.ts#layoutModule
  - server/bot/law/layoutShape.ts#LAYOUT_SHAPE
  - server/bot/layout/build.ts#build
  - server/bot/layout/build.ts#planRows
  - server/bot/layout/parts.ts#look
  - server/bot/layout/parts.ts#walkChannels
  - server/bot/layout/noShores.ts#CHANNELS
  - server/bot/layout/noShores.ts#BOT_PERMISSIONS
  - server/bot/layout/moduleSettings.ts#modulePlans
  - server/bot/layout/messages.ts#guideMessage
  - server/bot/migrations/20261125170000_layout_parts.sql
---
# Discord Bot

The No Shores Discord's own bot: moderation, community and engagement modules, set up from a page of the [[Website]]
([[DFO's Discord Bot Comes Over, Its Panel on the Website]], [[Pick - Discord Bot]]). This note is its core, which the
modules are built on.

## How it works

One Cloudflare Worker, `noshores-bot`, with its own D1 (`BOT_DB`), an R2 bucket for pictures (`BOT_MEDIA`), one
Durable Object holding Discord's Gateway, and a service binding to the [[Accounts]] (`ACCOUNTS`). `npm run bot` runs it here on port 8789, for the website's panel on 5174.

| Part | What it does |
|---|---|
| The law (`law/`) | Platform-neutral TypeScript both the bot and the panel run. Each module's settings, tables and acts are declared once (`modules.ts`); the settings law checks a save against them and reads an old save under today's shape, keeping all it can. The access law turns a member's Discord permissions into a panel level: none, viewer, moderator, manager, owner. The message law builds what Discord is sent from a saved message, holding Discord's limits. |
| Interactions | Every slash command and press arrives signed; a bad or stale signature is refused. `/panel` answers privately with a link to the panel. Anything else goes to the module that owns it (its command, or `bot:<module>:...` on what it drew), only where that module is on. |
| Sign-in | Discord's OAuth2 with PKCE and the `identify` and `guilds` scopes ([[The Panel's Sign-in Asks for a Person's Servers]]): who the person is and the servers they are in, kept with the session, the token itself revoked. The sign-in comes back to the panel as a one-use ticket in the address's fragment, good for two minutes, traded for a session token sent as a bearer header; only hashes are kept. The panel keeps the token in the tab's own storage, never the storage the site's pages share with the game, so each tab signs in for itself; it trades a ticket only in the tab that began that sign-in, and a browser that blocks that storage is told it cannot sign in. |
| The panel's API | A person's level in a server comes from Discord each minute: their roles, the server's, the owners `BOT_OWNERS` names, and the role grants in the core settings. A save carries its settings and the revision it was made on, and is answered stale against any other. Each role setting says what the bot does with the role (`use` in the law): a role it gives is held to what the saver could give in Discord; a role a ticket is opened to needs Manage Roles; a role it mentions needs Mention Everyone, or a role Discord lets anyone mention (asked of Discord); a role only named, to match, exempt or let into the panel, need only be the server's own and not everyone. Every channel and emoji must be the server's, and a mention of everyone needs Mention Everyone. A person's list holds the servers they share with the bot, as Discord named them at sign-in, read in one query; where Discord did not name them, the bot's first 50 by name. Without `DISCORD_BOT_TOKEN` a server answers that it is not set up. Saves, acts, tests and uploads go to the audit log. |
| The Gateway | One connection, its heartbeat on the object's alarm so an evicted object resumes its stored session. Each event keeps the snapshot of the server the panel draws its pickers from, and the cache of what Discord does not resend, then reaches each module where it is on. |
| REST | The one door to Discord with the bot's token: rate limits held per bucket and globally, never a thrown error or a token in a log line. |
| Pictures | PNG, JPEG, GIF and WebP only, known by their bytes, their metadata taken out, each server held to 100 files and 200 MB. Served with a day's cache, so a removed one is not kept alive by the bot, though Discord's own copies may last longer. |
| The clock | Each minute it makes sure of the Gateway and runs each module's minute; once an hour it sweeps old sign-ins, sessions and audit rows, tickets closed more than a month ago, and every server the bot left more than a month ago, its pictures and all its rows (a month, `LEFT_KEEP_S`, [[The Website's Words and the Bot's Month Are Approved]]). |

A module is a `ServerModule` exported from `modules/` (most are one file; a large one, such as moderation or the
welcome card, keeps its parts in files beside it), named in `registry.ts`, with its shape in
`law/modules.ts`. It may answer commands and presses, hear Gateway events, run each minute, answer the panel's
tables and acts, keep Discord in step when it is saved, fill placeholders of its own, and serve public routes. Its
tables come with a migration named by its UTC time.

## Moderation modules

**Moderation** warns, times out, kicks, bans, unbans and notes, from a slash command, the panel or another module.
Every act goes through one path (`moderate`): Discord's own permission of whoever asks, role order on the target, the
bot's own permission before a member is told of a kick or a ban, then Discord, a numbered case in `mod_cases`, the
member's direct message and the case log. A warning can set off the step its count names. The clock lifts temporary
bans, and tries one the bot may not lift again an hour later. A ban or an unban made by hand in Discord ends the
member's ban cases, so the clock never lifts a ban the bot did not set; the bot tells its own apart by the asks it
writes to `bot_ban_asks` before asking Discord. Purge, slow mode, lock and unlock act on the channel.

**Logs** posts edits and deletions with the words the Gateway's cache kept, joins with the account's age, leaves with
the roles held, role and nickname changes, voice moves, and channels, roles and bans made or deleted.

**Auto-mod** keeps Discord's own AutoMod rules for blocked words, word lists, mentions and spam in step on each save,
its own named `No Shores: ...`, and leaves rules made by hand alone. It checks each message, and the new words of each
edit, from a member without Manage Messages for invites, links (judged by the host a browser opens; an allowed site
counts with its subdomains, never as part of another name), capitals, emoji, floods and repeats. It deletes each
message that breaks a filter, and warns or times out through moderation once a breach: for a minute after, more
breaks of that filter are only deleted.

**Raid guard** counts joins in the Gateway object's memory. Enough inside the window starts raid mode, kept in
`raid_mode` so a restart does not end it: joiners are reported (the first five one post each in the alert channel, then one
post for every 25 more), timed out or kicked, and the verification level is
raised and given back when the clock ends it. Very new accounts can be dealt with at any time.

## Community modules

- **Welcome** greets a member who joins, sends a direct message, says goodbye, and gives roles on joining (to bots,
  their own). Roles wait for a set delay, or for Discord's rules screening to be passed, and the clock gives them.
  It fills `{welcome_card}`: a signed address of a card drawn in the Worker, a night sea in the server's colour, a
  double frame in the accent (lantern gold), the member's avatar in a ring and three lines in our own pixel letters.
  The address is signed with `CARD_SIGNING_KEY`, so the bot draws only the cards it handed out.
- **Levels** gives experience for messages (once a cooldown) and for minutes in voice, says a level-up where the
  settings say, gives and takes reward roles, and answers `/rank` and `/leaderboard`. The panel gives, takes and
  resets; a level a gift reaches gives its reward only if the giver could give that role. The website reads the
  public board at `/v1/public/levels/<server>`: names and standing, never a user id.
- **Role menus** post buttons, a list or reactions from which members pick roles: any number, one at a time, or
  kept once given. Publishing again edits the same message, and only the roles a menu offers ever move. A press is
  answered privately once Discord has acted, naming any role it refused. Each menu, like each announcement, has a name
  of its own.
- **Tags** answer a saved message to the prefix in chat or to `/tag`, which offers names as they are typed. A tag can
  be kept to some roles.
- **Announcements** post a message in up to ten channels, now from the panel or on a schedule in UTC (once, hourly,
  daily, weekly), each time once; one more than a quarter hour late is skipped. Set to edit, they change their last
  post in place, posting again only when Discord says it is gone.

## Engagement modules

- **Giveaways**: `/giveaway` or the panel posts a card with an Enter button; a press enters or leaves, and a role
  may be required. The clock ends it, or a manager does; winners are drawn with the secure random source, each entry
  equally likely, and one draw wins when two run at once. A reroll leaves out the last winners where enough entered.
- **Polls and suggestions**: `/poll` posts Discord's own poll (two to ten answers). `/suggest` posts a card with a
  thumbs up and down to vote by, and buttons staff press to take or decline it; the card holds its state.
- **Starboard**: a message with enough of the chosen emoji is shown again on the board, its count kept current, and
  taken down when it falls below. The author's own star counts only where the settings say.
- **Tickets**: a button opens a channel only the member, the staff roles and the bot see, one ticket at a time up to
  the setting. Closing it posts its messages as a file in the transcript channel and deletes the channel; if the
  transcript cannot be read or posted, the ticket stays open and the closer is told why. A ticket whose channel is
  deleted by hand is closed.
  `/ticket add` and `remove` let staff change who is in it. Posting the button again, after its words change, updates
  the bot's own post among the channel's latest 50 messages, and posts afresh only once it is gone.
- **Birthdays**: `/birthday set` keeps a day; at the setting's hour (UTC) the bot posts the message and gives the
  day's role, taken back the next day. 29 February is kept on the 28th in other years.
- **Voice rooms**: joining the hub makes the member a room of their own and moves them in; an empty room is deleted,
  as is one no one could be moved into, or one left empty while the bot was away.
- **Invites**: each join is matched to the one invite whose use count rose by one since the counts were read with the
  module on; a join no single invite explains, or the first after the module is turned on or saved, is credited to no
  one. `/invites` and the panel's table count them.
- **Stat channels**: every ten minutes, a counter's channel is renamed to show members, roles or channels, only when
  the name changed; a text channel's name is compared as Discord folds it, by its letters and numbers.
- **Feeds**: every ten minutes the YouTube channels and https RSS or Atom feeds are read, four at a time for at most
  three minutes; feeds a run does not reach are read first in the next. Each read takes at most 512 KB and 50 items. No
  address on the bot's own machine or a private network is read, and a feed is followed only through redirects to
  https addresses that are neither. The first read marks the place; later reads post up to five new items, their
  titles shown as typed. Each feed keeps its place per channel, so two channels can follow one feed, and an item's
  link is posted only as an http or https address.

## The game module

**No Shores** fills a message's `{character}`, `{character_level}` and `{character_faction}` for a member whose
Discord is linked to an account in the game ([[Accounts]], "Discord"). The bot asks the accounts through its
service binding to their `LinkedCharacters` entrypoint, which no web address reaches: given a Discord user id, it
answers the account's username, the level its room last kept for others to see (`shown.level`, as the Roster reads
it) and the name of the faction it is pledged to, or nothing when that Discord account is linked to none. No account
id, email or gear leaves the accounts. A member not linked, or any member when the binding is missing or the accounts
do not answer, gets the module's words for "not linked" in all three (empty by default). A linked character with no
username, no level kept yet or no pledge shows nothing in that one. Welcome, goodbye, level-up and tag messages offer
the three placeholders; where the module is off they show nothing. For up to 1000 Discord ids in one ask (`pledges`),
the accounts also answer each linked one's faction name, or null for none; an id linked to none is left out.

**House roles** name a role for each house, each house at most once. A linked member who joins gets their house's role
at once. At minute 5 of every ten the bot sweeps each server where the module is on: it lists the members a page of
1000 at a time, asks the accounts' `pledges` once a page, and gives each member their pledged house's role and takes
every other house role the setting names; an unlinked or unpledged member loses them all. Bots, members still pending
screening, and roles the setting does not name are never touched. A sweep makes at most 50 changes a server; a role
Discord refuses, or one deleted since the setting named it, is passed over for the rest of the sweep and logged once. While the binding, its `pledges` or the accounts cannot answer, no role
changes.

**Developer roles** name the roles a developer holds ([[Developers Launch Activities From a Test Room, in Max Gear]]);
the layout names the Founder and the Developer. The accounts ask through their own binding to the bot's `Members`
entrypoint (`main.ts`, which Cloudflare runs: the routes and clock of `worker.ts` and this one question), never a web
address: given a Discord user id, whether it holds one of those roles in the No Shores Discord, a server where the
module is on whose owner is one of the bot's owners (`BOT_OWNERS`); no other server's roles count, and with no owner
named no one is a developer. Discord is asked each time, so a role given or taken counts at once; a member Discord
does not find, or one it does not answer for, is none.

`/link` answers privately how to link: open the game at `https://noshores.online/play/`, then in
Settings open Account and press Sign in or link with Discord. The link itself is the accounts' own.

## The server layout

**Server layout** builds the No Shores server from the panel
([[The Discord Is Claude's to Build, Organised and Unbloated]]; what it builds is in
[[The Discord Server as Claude Builds It]]). It has no settings: its plan, a table, shows what a build would do to
every role, channel, setting, module and message, changing nothing; its build, for the server's owner alone and asked
to confirm, does it.

- **Parts are made once.** Each role and channel the build makes or finds is kept by its key and Discord's id
  (`layout_parts`): one renamed by hand is still the layout's, one deleted by hand is left out of every later build,
  and one already there by the layout's name when the layout first meets it is adopted and left as its maker set it.
  An adopted channel outside its layout category is moved into it, which is all Discord's own #general and voice room
  need; Discord's own two categories, left empty, are removed. Only a part the build makes gets the layout's topic,
  permissions and tags, as it is made.
- **The bot gives only what it holds.** A role's permissions and a channel's are cut to the bot's own; what is cut is
  named in the checklist, with an invite link that grants it (below).
- **The server's settings are set once**: verification, notifications, the media filter, Discord's notices, only the
  owner and the bot pinging everyone, and the icon (`noshores.online/art/server-icon.png`, only where the server has none).
  The rules, updates and safety channels, the description and the welcome screen wait for Community.
- **Modules are set while the layout wrote them last**: a module's settings are saved by the layout (`updated_by` is
  `layout`) only while no one has saved them in the panel since; the Gateway is told at once.
- **Messages go out through their modules**: the welcome guide and the code of conduct through announcements, the ping
  buttons through role menus, the ticket button through tickets, each updated in place by a later build. The first
  news and patch notes wait in the panel's announcements for the owner to send.
- **The checklist** in #staff is what only the owner can do, updated by every build until it reads finished: a fuller
  invite when the bot lacks a permission, turning on Community, turning on rules screening (with the rules to paste),
  moving the bot's role above the roles it gives, and any part Discord refused.

## The deploy

A merge into `main` deploys the bot once the same commit has passed the check, only when what it is built from
changed since its last deploy ([[The Discord Bot Deploys on Each Merge]]): `bot.yml`, after the rooms' workflow, which
deploys the accounts its binding names. It finds or makes the `noshores-bot` database and the `noshores-bot-media`
bucket, applies the migrations, deploys with `BOT_URL` set to its own `workers.dev` address, hands over the keys the
repository has, makes `CARD_SIGNING_KEY` once when the Worker has none, writes the slash commands to the application
(`commands.ts`'s whole list, in place of the one Discord had), and waits for `/health` to name the commit it
stamped on the Worker as `BOT_COMMIT`, so the new code is known to be live.
`deploy-ready.sh` decides whether a deploy is due, for the rooms, the accounts and the bot. Run by hand from the Actions
tab it deploys whether anything changed or not, but only a commit whose own CI check passed; that is how keys added
later reach the Worker.

## One Discord application

The accounts' Discord sign-in and the bot share one Discord application. Its keys are the repository's secrets, which
the deploys hand to each Worker; none is in the repository:

| Repository secret | Reaches |
|---|---|
| `DISCORD_CLIENT_ID`, the application's id | `overlook-accounts`, and `noshores-bot` as its var `DISCORD_APPLICATION_ID` |
| `DISCORD_CLIENT_SECRET` | both Workers |
| `DISCORD_PUBLIC_KEY`, the application's public key | `noshores-bot`, as a var |
| `DISCORD_BOT_TOKEN`, the bot user's token | `noshores-bot` |
| `BOT_OWNERS`, the owners' Discord user ids, comma-separated | `noshores-bot`, as a var |

The application's OAuth2 redirects must list both callbacks:
`https://overlook-accounts.mackcothran.workers.dev/v1/discord/callback` for the game's sign-in, and the bot's own
address followed by `/v1/auth/discord/callback` for the panel's (on `workers.dev`, `noshores-bot`'s address on the
same Cloudflare account). Its interactions endpoint is the bot's address followed by `/v1/discord/interactions`.

The bot is invited with the permissions `BOT_PERMISSIONS` lists (`layout/noShores.ts`): what its modules use, and what
the layout grants the moderators and denies members where only the bot posts, since a bot can grant only what it holds.
The layout's checklist gives the invite link with them when the bot lacks any.

## The panel

The bot is set up from its page on the [[Website]], `noshores.online/panel/` (`site/src/panel/`). A manager signs in
with Discord there, picks a server, turns modules on, sets them through forms drawn from the law, runs their acts,
reads their tables and the audit log, keeps the server's pictures, and writes messages in a composer whose preview is
built by the message law. The page only draws what the panel's API answers; every check is the bot's.

## Limits

- It runs without the Discord application until the owner adds its keys ([[Open Questions]]): every var in
  `wrangler.jsonc` may be empty, and the part that needs one says it is not set up. A key the repository gains reaches
  the Worker at its next deploy.
- A character's level is the one its room last saved, so it trails a level reached mid-session by up to twenty
  seconds; a character no room has kept since it was made shows no level.
- A Worker isolate trusts a module's settings for 30 seconds after reading them, and the Gateway for at most five
  minutes, sooner when the panel's save reaches it; a save whose word to the Gateway is lost waits out the five.
- While the Gateway is down, the roles' permissions in a server's snapshot stay as last seen until the server's next
  GUILD_CREATE or role event.
- A server a person joins after signing in shows in their list once they sign in again.
- A house role trails a switch of house or an unlink by up to ten minutes, longer while a sweep's 50 changes run out.
- A build runs in one request: a part Discord refuses, or a rate limit longer than five seconds, is left for the next
  build, which picks up where it stopped. One build runs in a server at a time: a second is turned away, and the
  claim of a build that died is taken over after ten minutes.
- The layout cannot turn on Community or rules screening (Discord keeps both for the owner, and its rules screening
  has no API); its checklist says how.
