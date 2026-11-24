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
---
# Discord Bot

The No Shores Discord's own bot: moderation, community and engagement modules, set up from a page of the [[Website]]
([[DFO's Discord Bot Comes Over, Its Panel on the Website]], [[Pick - Discord Bot]]). This note is its core, which the
modules are built on.

## How it works

One Cloudflare Worker, `noshores-bot`, with its own D1 (`BOT_DB`), an R2 bucket for pictures (`BOT_MEDIA`) and one
Durable Object holding Discord's Gateway. `npm run bot` runs it here on port 8789, for the website's panel on 5174.

| Part | What it does |
|---|---|
| The law (`law/`) | Platform-neutral TypeScript both the bot and the panel run. Each module's settings, tables and acts are declared once (`modules.ts`); the settings law checks a save against them and reads an old save under today's shape, keeping all it can. The access law turns a member's Discord permissions into a panel level: none, viewer, moderator, manager, owner. The message law builds what Discord is sent from a saved message, holding Discord's limits. |
| Interactions | Every slash command and press arrives signed; a bad or stale signature is refused. `/panel` answers privately with a link to the panel. Anything else goes to the module that owns it (its command, or `bot:<module>:...` on what it drew), only where that module is on. |
| Sign-in | Discord's OAuth2 with PKCE and `identify` alone. The sign-in comes back to the panel as a one-use ticket in the address's fragment, traded for a session token sent as a bearer header; only hashes are kept. |
| The panel's API | A person's level in a server comes from Discord each minute: their roles, the server's, the owners `BOT_OWNERS` names, and the role grants in the core settings. A save is checked against its module's shape and revision, and every role, channel, emoji and mention of everyone it adds is held to what the saver could do in Discord. Saves, acts, tests and uploads go to the audit log. |
| The Gateway | One connection, its heartbeat on the object's alarm so an evicted object resumes its stored session. Each event keeps the snapshot of the server the panel draws its pickers from, and the cache of what Discord does not resend, then reaches each module where it is on. |
| REST | The one door to Discord with the bot's token: rate limits held per bucket and globally, never a thrown error or a token in a log line. |
| Pictures | PNG, JPEG, GIF and WebP only, known by their bytes, their metadata taken out, each server held to 100 files and 200 MB. |
| The clock | Each minute it makes sure of the Gateway and runs each module's minute; once an hour it sweeps old sign-ins, sessions and audit rows. |

A module is one file in `modules/` exporting a `ServerModule`, named in `registry.ts`, with its shape in
`law/modules.ts`. It may answer commands and presses, hear Gateway events, run each minute, answer the panel's
tables and acts, keep Discord in step when it is saved, fill placeholders of its own, and serve public routes. Its
tables come with a migration named by its UTC time.

## Moderation modules

**Moderation** warns, times out, kicks, bans, unbans and notes, from a slash command, the panel or another module.
Every act goes through one path (`moderate`): Discord's own permission of whoever asks, role order on the target, the
bot's own permission before a member is told of a kick or a ban, then Discord, a numbered case in `mod_cases`, the
member's direct message and the case log. A warning can set off the step its count names. The clock lifts temporary
bans, and tries one the bot may not lift again an hour later. Purge, slow mode, lock and unlock act on the channel.

**Logs** posts edits and deletions with the words the Gateway's cache kept, joins with the account's age, leaves with
the roles held, role and nickname changes, voice moves, and channels, roles and bans made or deleted.

**Auto-mod** keeps Discord's own AutoMod rules for blocked words, word lists, mentions and spam in step on each save,
its own named `No Shores: ...`, and leaves rules made by hand alone. It checks each message from a member without
Manage Messages for invites, links, capitals, emoji, floods and repeats, deletes one that breaks a filter, and warns or
times out through moderation.

**Raid guard** counts joins in the Gateway object's memory. Enough inside the window starts raid mode, kept in
`raid_mode` so a restart does not end it: joiners are reported, timed out or kicked, and the verification level is
raised and given back when the clock ends it. Very new accounts can be dealt with at any time.

## Limits

- Not deployed: the Discord application's keys and the deploy wait on the owner ([[Open Questions]]). Every var in
  `wrangler.jsonc` may be empty, and the part that needs one says it is not set up.
- Only the moderation modules have their code: the others' settings are declared and the panel can save them, but
  nothing acts on them yet.
- A message's placeholders are the member's and the server's; a game character waits on the accounts' link.
- A Worker isolate trusts a module's settings for 30 seconds after reading them, and the Gateway until the panel
  saves.
