---
type: system
status: planned
code:
  - site/vite.config.ts
  - site/src/siteMap.ts#SITE_PAGES
  - site/src/siteMap.ts#OUTSIDE
  - site/src/siteMap.ts#SITE_ORIGIN
  - site/src/words.ts#WORDS
  - site/src/page.ts#makePage
  - site/src/sitePlugin.ts#sitePlugin
  - site/src/sitePlugin.ts#CONTENT_POLICY
  - site/src/sitePlugin.ts#PANEL_POLICY
  - site/panel/index.html
  - site/src/panel/panelMain.ts#startPanel
  - site/src/panel/panelApi.ts#BOT_ORIGIN
  - site/src/panel/panelApi.ts#createPanelApi
  - site/src/panel/form.ts#bindForm
  - site/src/panel/composer.ts#bindMessage
  - site/src/panel/preview.ts#previewNode
  - site/src/art/pictures.ts#PICTURES
  - site/src/art/scenes.ts#SCENES
  - site/src/art/sheet.ts#pngOf
  - site/src/art/logo.ts#iconSheet
  - site/src/site.css
---
# Website

The game's website at `noshores.online`: Home, The World, The Game and the Discord bot's panel, made after DFO
Online's ([[The Website Is at noshores.online, After DFO's]], [[Pick - Website]]).

## How it works

- **Pages.** Home (`/`), The World (`/world/`), The Game (`/game/`) and the Discord bot (`/panel/`), one folder each under `site/` with its
  `index.html`. The site map lists them; a new page is one entry there, its folder and its words. `npm run site`
  serves them on port 5174; `npm run site:build` builds them into `target/site/`, and `cargo xtask check` builds them
  too ([[Checks]]).
- **Words by name.** A page never spells a sentence. It names its words (`data-t="world.title"`, or
  `data-t-alt` for a picture's alt text) and the build fills them in from one table. The premise is the owner's
  ([[No Shores]]), split into passages and never reworded; Home and The World say it. Every other line comes from a
  decision: The Game's from [[Overlook Is a Shared World After Destiny 1]], [[The Sea Is a Patrol Zone, and the Ship Is Gear]],
  [[Ships Have Their Own Power, Modules and Crew Who Fight Beside You]], [[Arts Are Overlook's Subclasses]],
  [[Three Factions Keep the Arts, After Destiny 1]] and [[Gear and Power Follow Destiny 1 Vanilla]].
- **Links by name.** A link names a page or an outside place (`data-to="play"`). The outside places are named once:
  Play, the game at its current address, and the Discord, empty until the owner has an invite. A place with no
  address yet has its links left out of the page, so no Discord button shows.
- **The frame.** Every page gets the same bar (the logo, The World, The Game, Play), a skip link, and a foot (the
  pages by name, the Discord bot's among them, the Discord once it has an address, and "© Vestige Studios", [[Copyright Held by Vestige Studios]]).
- **Pictures drawn by code.** Every picture is drawn at build time in Node, each from a fixed seed, so it is the same
  at every build, and written as a small paletted PNG into the build, never into git
  ([[Generated Files Stay Out of Git]]). The scenes, in a palette of night sea blues and greys, lantern gold and the
  Lattice's red and purple crystal: Overlook by night on Saltmere's rock with ships at anchor (Home's scene, its
  lanterns on a layer of their own that flickers), the Pale Expanse with a burned port, the Grey Tithe's grey sails
  closing on a lone ship, Thule's flagship by a captain's broken ship, the captain sinking toward a faint light, the
  ruined port overtaken by crystal, waking on Saltmere's shore, a ship under sail, the three Arts' flames and gear
  under a lantern, a ship's bell on the quay. The logo is drawn cell for cell from the game's own picture of it,
  shown at whole-number scale; the tab's icon is its first letter.
- **Nothing from another site.** The face is Pixelify Sans, bundled from its package ([[Pixelify Sans Is Overlook's Font]]);
  the copyright sign alone takes the device's own sans, since Pixelify draws it as a speck. A built page carries a
  content policy that lets it load only its own styles, fonts and pictures, and runs no script. The panel's page is
  the one exception, below.
- **Look.** Night colours with lantern-gold accents, framed pictures and cards. It fits from 360 px wide to a wide
  desktop without scrolling sideways; the lanterns stop flickering for a player who asks for reduced motion.

## The Discord bot's panel

`/panel/` is where a server's managers set up the [[Discord Bot]]
([[DFO's Discord Bot Comes Over, Its Panel on the Website]]). The page is framed like the others, under a ship's bell on Overlook's quay, and its one script
(`site/src/panel/`) draws everything inside it from the bot's answers.

- **Sign-in.** "Sign in with Discord" goes to the bot's `/v1/auth/discord`, asking to come back to this page. Discord
  sends the person back through the bot with a one-use ticket in the address's hash. Only the tab that pressed Sign in
  trades it (a mark in that tab's own storage, ten minutes long), so a ticket in a link someone else sent signs no one
  in. The session token is kept in the browser and sent as a bearer header; a sign-out the bot did not hear is told
  again at the next load.
- **Pages by hash.** `#` lists the person's servers; `#g=<id>` a server's connection, audit log, pictures and its
  modules by group; `&m=<module>` a module's settings, acts and tables; `&audit` and `&pictures`; `#lb=<id>` a public
  leaderboard. An answer that comes back after the person moved on draws nothing. Leaving a page with changes not
  saved asks first.
- **Forms from the law.** Each module's form is drawn from its shape in `server/bot/law/`, imported, never copied, so
  the page and the bot hold a setting to the same rules; the bot's refusals land beside their fields.
- **The composer.** A message setting is a composer: words, up to ten embeds, link buttons, placeholders, mentions,
  server emoji and live times put where the person was typing, starting templates, Discord's JSON in and out, undo
  and redo, pictures uploaded to the bot, and a test sent through the bot. Beside it a live preview is built by the
  message law the bot posts with, so what is drawn is what is sent.
- **Its address.** The bot is the Worker `noshores-bot` on the account's workers.dev
  (`https://noshores-bot.mackcothran.workers.dev`). A page served from this machine talks to `npm run bot` on port
  8789 instead, or to the address the storage key `noshores.bot.origin` names.
- **Its policy.** The panel's page alone runs a script: its own (`script-src 'self'`), which may talk to the bot's
  address and nothing else, and it shows pictures from any https address (avatars, the bot's uploads, a message's
  pictures). It sends no referrer. Every other page keeps the stricter policy. A page served while editing carries no
  policy, so the panel there can reach the local bot.

The tests hold the rules: every word a page names exists and every word is said; the premise matches the owner's
note; links go only to pages or named places; each picture is the same at every build and under 64 KB; nothing loads
from another site; each page is under 96 KB; no page has a timer, clock, countdown, staff link, account area or
languages menu; each page's policy is its own, and only the panel's runs a script. The panel's tests draw it in a
small stand-in document (`domForTests.ts`) against a faked bot.

## Limits

- Not hosted yet: where it is served waits on the owner ([[Open Questions]]).
- The Discord buttons stay hidden until the owner has an invite.
- The panel works only once the bot is deployed with `PANEL_URL` and `PANEL_ORIGINS` naming this site ([[Discord Bot]]).
- A built page previewed on this machine keeps the live policy, so it cannot reach `npm run bot`; use `npm run site`.
- English only.
