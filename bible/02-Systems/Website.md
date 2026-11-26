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
  - site/src/art/sheet.ts#halo
  - site/src/art/light.ts#LIGHTS
  - site/src/art/ships.ts#ship
  - site/src/art/places.ts#town
  - site/src/art/heroScene.ts#heroLayers
  - site/src/art/logo.ts#iconSheet
  - site/src/art/logo.ts#serverIconSheet
  - site/src/site.css
  - site/wrangler.jsonc
  - .github/workflows/site.yml
  - site/www/worker.ts#toBareDomain
  - site/worker.ts#download
  - site/_headers
---
# Website

The game's website at `noshores.online`: Home, The World, The Game, Download and the Discord bot's panel, made after
DFO Online's ([[The Website Is at noshores.online, After DFO's]], [[Pick - Website]]).

## How it works

- **Pages.** Home (`/`), The World (`/world/`), The Game (`/game/`), Download (`/app/`) and the Discord bot
  (`/panel/`), one folder each under `site/` with its `index.html`. The site map lists them; a new page is one entry
  there, its folder and its words. `npm run site` serves them on port 5174; `npm run site:build` builds them into
  `target/site/`, and `cargo xtask check` builds them too ([[Checks]]).
- **Words by name.** A page never spells a sentence. It names its words (`data-t="world.title"`, or
  `data-t-alt` for a picture's alt text) and the build fills them in from one table. The premise is the owner's
  ([[No Shores]]), split into passages and never reworded; Home and The World say it. Every other line tells a
  newcomer plainly what they will do, and says only what a recorded decision says or what the game has built; each
  group of words names its notes in `words.ts`. The phrasing is Claude's, for the owner to change. The lore is shown,
  not explained ([[The Game Shows the Mystery and Explains Almost None of It]]): the site names the Grey Tithe and
  hints at the ruined ports, and says nothing of what the crystal is.
- **Links by name.** A link names a page or an outside place (`data-to="play"`). The outside places are named once:
  Play, the game at `noshores.online/play/`, and the Discord, the No Shores server's invite. A place with no address
  has its links left out of the page, and a section that needs it (`data-needs`) left out whole; the tests check both
  against a stand-in list of places.
- **The frame.** Every page gets the same bar (the logo, The World, The Game, Download, the Discord, Play), a skip link,
  and a foot in columns: the logo, the line "A pirate sandbox in a shared world." (Claude's, from the owner's own words
  for the game in [[No Shores]]) and "© Vestige Studios" ([[Copyright Held by Vestige Studios]]); the pages by name, the
  Discord bot's among them; then Play and the Discord. A tab reads "The World | No Shores"; Home's, its own line. Each
  page's head carries the tags a shared link unfolds into on Discord and elsewhere: its title and description, its
  address, and the share picture, Home's scene twice its size with the logo over its sky.
- **Pictures drawn by code.** Every picture is drawn at build time in Node, each from a fixed seed, so it is the same
  at every build, and written as a small paletted PNG into the build, never into git
  ([[Generated Files Stay Out of Git]]). They are drawn the way DFO's are: skies dithered band into band through an
  8 by 8 pattern, land in ranges that pale with distance, light in rings round a moon, a lantern or a fire, and every
  scene in one light of its own (`light.ts`): Overlook's night, fire at dusk, the Tithe's mist, the crystal's purple,
  the first grey of morning. Ships (`ships.ts`) have a sprung hull with its wale and gunports, a stern castle, sails
  that belly, jibs, a spanker and their rigging, a wake and a double on the water, the small parts dropping away on a
  far ship; places (`places.ts`) are rock that rises to a hill, a town stepping up it in terraces with a switchback
  road to a beacon, a quay with lanterns, ruins and faceted crystal. The scenes: Overlook by night (Home's, 640 by
  300, its town to the right so the words stand over sky, its windows, lanterns and beacon on a layer of their own
  that flickers), the Pale Expanse with a burned port, the Grey Tithe's grey sails closing out of the mist on a lone
  ship, Thule's flagship over a captain's broken, burning ship at a red dusk, the captain sinking toward a faint
  light, a ruined port overtaken by crystal, Saltmere's shore at first light, a ship under full sail, the three Arts'
  flames in braziers on the quay, gear under a lantern, a ship's bell on the quay; and of play itself
  (`gameScenes.ts`): the keepers at their counters in the arcades of Overlook's court, a duel by firelight with the fighters' edges lit by the
  brazier between them, and a dungeon's gate in a hillside. Every scene fills its frame; only the lights layer and the
  logo have clear cells. The logo is drawn cell for cell from
  the game's own picture of it, shown at whole-number scale; the tab's icon is its first letter. The Discord server's
  icon (`server-icon`) is that letter on a night with the moon's halo behind it, 112 pixels drawn nine times over,
  the letter kept clear of the round crop Discord gives every server icon; the bot's layout sets it.
- **Home, after DFO's.** The scene with the logo, the premise's first line, a line saying what the game is, Play and
  the Discord, and what it runs on; "What is No Shores?"; five numbered rows of what a player does, each a picture
  beside a few lines and its facts as tags (Overlook, a ship of your own, steel and the Arts, gear, dungeons, events
  and guilds), in turn left and right; a band of numbers, each from the premise or a decision (nine continents, three
  port cities remain, three Arts, six dungeon styles); the story's opening in the owner's words; three steps to start
  playing; a call to the Discord; and the premise's last lines with Play.
- **Download** offers the [[Desktop App]]'s installers for Windows, Mac (Apple silicon and Intel), Linux's AppImage and
  Ubuntu and Debian, each by its name that never moves (`siteMap.ts` `DOWNLOADS`), what opening an unsigned one asks
  on each system, and Play in the browser ([[The Website Offers the Desktop App's Downloads]]). Home's hero offers it
  beside Play.
- **The Game** tells what there is to do, a section each with its picture: Overlook, the sea, combat, the Arts and the
  factions, gear, things to do, and how you play (in the browser, on keyboard and mouse or a pad, as a guest or with
  an account).
- **The World** is the premise as written, under headings of its places, with "Even history itself cannot be
  trusted." set apart between them.
- **Nothing from another site.** The face is Pixelify Sans, bundled from its package ([[Pixelify Sans Is Overlook's Font]]);
  the copyright sign alone takes the device's own sans, since Pixelify draws it as a speck. A built page carries a
  content policy that lets it load only its own styles, fonts and pictures, and runs no script. The panel's page is
  the one exception, below.
- **Look.** Night colours with lantern-gold accents, framed pictures and cards. It fits from 360 px wide to a wide
  desktop without scrolling sideways; the lanterns stop flickering for a player who asks for reduced motion.

## Where it is served

The Worker `noshores-site` serves the site and the game at `noshores.online`
([[noshores.online Is Served From Cloudflare, and the Game Is Played There]]): static files, with a script for the
desktop app's downloads alone (below), the site's pages at
the root and the game's client, built with its base at `/play/`, under `/play/`. An address with no file gets the
site's own "Page not found" (`site/lost/`, served as `404.html`) with a 404; files the builds name by a hash of their
bytes are kept by the browser for a year (`site/_headers`). `www.noshores.online` is a Worker of its own,
`noshores-www` (`site/www/`), that sends every address to the same one on the bare domain, so the game's saves and the
panel's sign-in live at one origin. A merge into `main` deploys it
(`site.yml`) on the page's terms: once the same commit has passed the check and the rooms have deployed or had nothing
to, so no game is served on a protocol no room speaks. Run by hand from the Actions tab it deploys again, but only a
commit whose own CI check passed. Before it deploys, every CORS rule of the game's R2 bucket
(`overlook-forge`) that lets the published page read it is widened to the domain's two origins, and the accounts send
a Discord sign-in back to the game there. Each deploy also writes `play/patch-notes.json` from the merged pull
requests' "Patch notes" sections, which the [[Desktop App]]'s launcher shows (`site/patchNotes.ts`). The game is still
published on GitHub Pages as well
([[The World Editor Is on GitHub Pages]]).

The [[Desktop App]]'s downloads are the one address a script answers (`site/worker.ts`, run for `/download/` alone):
its installers and update feeds, read from R2 under `desktop/`, and the names that never move (`/download/windows`,
`mac-arm64`, `mac-x64`, `linux-appimage`, `linux-deb`) sent to the newest of each, which the Download page offers.

## The Discord bot's panel

`/panel/` is where a server's managers set up the [[Discord Bot]]
([[DFO's Discord Bot Comes Over, Its Panel on the Website]]). The page is framed like the others, under a ship's bell
on Overlook's quay, and its one script (`site/src/panel/`) draws everything inside it from the bot's answers.

- **Sign-in.** "Sign in with Discord" goes to the bot's `/v1/auth/discord`, asking to come back to this page. Discord
  sends the person back through the bot with a one-use ticket in the address's hash. Only the tab that pressed Sign in
  trades it (a mark in that tab's own storage, ten minutes long), so a ticket in a link someone else sent signs no one
  in; a browser that blocks that storage cannot sign in, and is told so. The session token is kept in the tab's own
  storage, never the storage the site's pages share with the game under `/play/`, so each tab signs in for itself; it
  is sent as a bearer header, and a sign-out the bot did not hear is told again at the next load.
- **Pages by hash.** `#` lists the person's servers; `#g=<id>` a server's connection, audit log, pictures and its
  modules by group; `&m=<module>` a module's settings, acts and tables; `&audit` and `&pictures`; `#lb=<id>` a public
  leaderboard, once the levels module serves it. An answer that comes back after the person moved on draws nothing.
  Leaving a page with changes not saved asks first.
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

- A deploy serves the site only while `noshores.online` is an active zone of the Cloudflare account; otherwise it says
  so and serves nothing. The Cloudflare token needs Zone: Read and Workers Routes: Edit on that zone, beside the
  Workers R2 Storage: Edit it publishes with, which the bucket's rules need too.
- A browser keeps a game's sign-in and saves by its address, so a guest who played on GitHub Pages starts afresh at
  `noshores.online`; an account linked to Discord signs in on either.
- The panel works only once the bot is deployed with `PANEL_URL` and `PANEL_ORIGINS` naming this site ([[Discord Bot]]).
- A built page previewed on this machine keeps the live policy, so it cannot reach `npm run bot`; use `npm run site`.
- English only.
