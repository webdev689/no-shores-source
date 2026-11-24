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
  - site/src/art/pictures.ts#PICTURES
  - site/src/art/scenes.ts#SCENES
  - site/src/art/sheet.ts#pngOf
  - site/src/art/logo.ts#iconSheet
  - site/src/site.css
---
# Website

The game's website at `noshores.online`: Home, The World and The Game, with the Discord bot's panel to come, made
after DFO Online's ([[The Website Is at noshores.online, After DFO's]], [[Pick - Website]]).

## How it works

- **Pages.** Home (`/`), The World (`/world/`) and The Game (`/game/`), one folder each under `site/` with its
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
  pages by name, the Discord once it has an address, and "© Vestige Studios", [[Copyright Held by Vestige Studios]]).
- **Pictures drawn by code.** Every picture is drawn at build time in Node, each from a fixed seed, so it is the same
  at every build, and written as a small paletted PNG into the build, never into git
  ([[Generated Files Stay Out of Git]]). The scenes, in a palette of night sea blues and greys, lantern gold and the
  Lattice's red and purple crystal: Overlook by night on Saltmere's rock with ships at anchor (Home's scene, its
  lanterns on a layer of their own that flickers), the Pale Expanse with a burned port, the Grey Tithe's grey sails
  closing on a lone ship, Thule's flagship by a captain's broken ship, the captain sinking toward a faint light, the
  ruined port overtaken by crystal, waking on Saltmere's shore, a ship under sail, the three Arts' flames and gear
  under a lantern. The logo is drawn cell for cell from the game's own picture of it, shown at whole-number scale;
  the tab's icon is its first letter.
- **Nothing from another site.** The face is Pixelify Sans, bundled from its package ([[Pixelify Sans Is Overlook's Font]]);
  the copyright sign alone takes the device's own sans, since Pixelify draws it as a speck. A built page carries a
  content policy that lets it load only its own styles, fonts and pictures, and runs no script.
- **Look.** Night colours with lantern-gold accents, framed pictures and cards. It fits from 360 px wide to a wide
  desktop without scrolling sideways; the lanterns stop flickering for a player who asks for reduced motion.

The tests hold the rules: every word a page names exists and every word is said; the premise matches the owner's
note; links go only to pages or named places; each picture is the same at every build and under 64 KB; nothing loads
from another site; each page is under 96 KB; no page has a timer, clock, countdown, staff link, account area or
languages menu.

## Limits

- Not hosted yet: where it is served waits on the owner ([[Open Questions]]).
- The Discord bot's panel is not built yet ([[Discord Bot]]); the Discord buttons stay hidden until the owner has an
  invite.
- English only.
