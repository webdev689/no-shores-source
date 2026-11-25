---
type: pick
area: Platform
verdict: Cut
effort: L
status: approved
dfo_paths:
  - server-bot/src/
  - server-bot/migrations/
  - server-bot/wrangler.toml
  - src/bot/
  - src/panel/
  - panel/index.html
  - .github/workflows/bot-deploy.yml
  - test/server/bot*.test.js
  - test/bot/
  - test/panel/
dfo_commit: 11cec6ed (branch ccr-ed24355a-76go4h, never merged)
---
# Pick - Discord Bot

DFO's own Discord bot: one Cloudflare Worker with its own D1 database, a Durable Object holding Discord's Gateway,
nineteen modules declared once and shared with the panel that sets them, and the panel itself, a page of the website
where a server's managers sign in with Discord ([[DFO's Discord Bot Comes Over, Its Panel on the Website]]).

## What comes over

- The Worker, typed strictly: its router, Discord REST and Gateway, the store, the sign-in and the panel's API.
- Every module: moderation, logs, auto-mod, anti-raid, welcome, levels, role menus, tags, announcements, giveaways,
  polls, starboard, tickets, suggestions, birthdays, temporary voice, invites, stats and socials.
- The settings law both ends run: each module's settings declared once, checked by the bot and drawn by the panel.
- The message law and composer: messages with embeds and buttons, written and tested from the panel.
- The panel, as a page of the website ([[The Website Is at noshores.online, After DFO's]]).
- The behaviour DFO's tests checked, as our own tests.

## What stays behind

- The game's `/mod` commands, which DFO's bot forwarded to DFO's account service.
- DFO's own link flow (`botLink.js`): our accounts already link a Discord account themselves ([[Accounts]]).
- DFO's drawing kit for welcome cards (`server-account/src/journalArt.js`): the card is drawn by our own code.
- DFO's names, its account and its addresses in `wrangler.toml`, and `tools/siteRepo.mjs`, which copied the panel into
  a separate repository: our website is in this one.

## Our version

[[Discord Bot]].
