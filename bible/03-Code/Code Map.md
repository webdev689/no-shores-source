---
type: reference
code:
  - crates/xtask/src/checks/layout.rs#TOP_LEVEL
  - crates/xtask/src/checks/layers.rs#LAYERS
  - crates/xtask/src/checks/crates.rs#CRATES
  - crates/bake/src/main.rs
  - client/src/main.ts
---
# Code Map

Where things live. The layout check holds the top level to a fixed list (`TOP_LEVEL`); a new top-level folder is a
decision, made in the same change as its entry here.

| Path | What it holds |
|---|---|
| `client/` | The game in the browser, TypeScript ([[TypeScript and Rust]]). `index.html` and `src/` |
| `client/index.html` | The [[Game]]'s page: its one canvas, filling it, and the script that starts the game; everything shown is drawn on the canvas ([[Interface]]) |
| `client/src/main.ts`, `gameWorker.ts` | The entry points: the page hands its canvas to the game's worker and keeps the page's side ([[Game]], "Threads"); the worker puts the page's stand-ins in place, starts the GPU and starts the game layer |
| `client/src/canvasSize.ts` | A canvas's drawing buffer in device pixels, from its size on the page and the screen's pixel ratio, for every page's canvas |
| `client/src/editorPage.ts` | The [[World Editor]]'s entry point: offers the editor a fleet room, through the combat layer, when its address carries `?room=`, and the game's drawing of the captains' plates, then starts it |
| `client/src/game/` | The game layer: the [[Game]]'s flow from arriving to landing, on foot in a node, at sea in the [[Overworld]] (its close views sizing the ship and easing its pace to its true speed, `seaLaw.ts`), the scene every drawer draws into, and the heads-up display |
| `client/src/game/audio/music/` | The [[Music]]: the FM voice bank, the song player, the score format with its layer roles, the scores (the sea's songs and fights, each climate's, Overlook's, the story's, the boss scores and the Drowned Vale's), the recorded instruments played as voices (`sampled.ts`), and the director that plays them as danger nears, with what it hears of the game on foot and at sea |
| `client/src/game/audio/ambience/ambience.ts`, `player.ts`, `graph.ts` | The [[Ambience]] the game calls each frame on foot and at sea, one place sounding, and its nodes: rooms, beds' ways out and calls' chains |
| `client/src/game/audio/ambience/scapes.ts`, `law.ts`, `places.ts`, `recordings.ts` | The eleven ambiences as data, the recording each bed and call plays, and the pure laws: place to ambience, the time of day, breathing and gusts, call gaps, crossfades, and where each call stands |
| `client/src/game/audio/ambience/dsp.ts` | The seeded die and the filters a place's room is cut from |
| `client/src/player/` | The player layer: the [[Player]] as the Test Ground and the game both play it, with DFO's keys and Destiny's pad as the player binds them, the forge's figure and its frames; the fight's buttons and the moves a fight holds a figure to, the foes' dresses and figures, the crosshair, and the [[Arts]]' pictures |
| `client/src/gpu.ts` | Starts WebGPU, or tells the player why it cannot ([[WebGPU Only]]), and tells the desktop app's shell the adapter it got |
| `client/src/desktop.ts` | What the [[Desktop App]]'s shell and the game say to each other, read by both, and the game's side of it: what the shell told, and its asks, which do nothing in a browser |
| `client/src/perfMeter.ts`, `gpuTimer.ts` | What the game's frames cost: the time between them, the script's, each pass's on the GPU, and the `?perf` readout ([[Game]], "Drawing") |
| `client/src/face.ts`, `trueType.ts` | The glyphs Pixelify Sans misreads or lacks, drawn in code on its grid for the interface to draw, and made into a font for the held map's lettering ([[Interface]], "The face") |
| `client/src/frustum.ts` | What a view sees: a view-projection's six planes, and whether a box, a sphere or a set of points reaches inside them, for every drawer that leaves out what is out of view |
| `client/src/shadow.ts` | The sun's shadow map round the eye, which every drawer of the [[Game]]'s scene casts into and reads |
| `client/src/soundSamples.ts` | The recorded sounds the owner picked from Freesound, fetched as they are wanted (long ones a chunk at a time), held within a budget, levelled and played for the [[Interface]]'s cues and the world's, with their credits |
| `client/src/soundMeasure.ts` | How loud a recording is, measured once where it is decoded: its level, its rush and its loudness over each window the game asks |
| `client/src/contentCache.ts` | R2's files and ranges of them, kept in the browser's own storage within 1 GB, since a file named by its hash never changes |
| `client/src/seeded.ts` | A seeded stream of numbers in [0, 1), the same in every engine, which any layer draws from |
| `client/src/nearFade.ts` | How a billboard (a puff of smoke, a sea fight's puff) fades softly to nothing as the eye comes within a couple of metres of it, the same in the shaders |
| `client/src/frameGuard.ts` | A frame's work kept from stopping the frames: what one part throws is reported once and the next frame is still drawn |
| `client/src/gameWorker.ts` | The game in a thread of its own, WebGPU on the canvas the page hands it, with stand-ins for what the page keeps ([[Game]]) |
| `client/src/gpuForTests.ts` | A GPU for tests that draws nothing and counts what is made and not destroyed |
| `client/src/listener.ts` | The page's one audio listener, round which the world's sounds and the ambience place theirs in one frame |
| `client/src/keptNames.ts` | Moves what a browser kept under the game's former name (`overlook.`) to `noshores.`, once, before any page reads it ([[The Game Is Named No Shores]]) |
| `client/src/elementGlow.ts` | The [[Weapon Glow]]'s colours, outline field, shader and bursts, which the figures, the first person and the fight's effects draw with |
| `client/editor/`, `client/src/editor/` | The [[World Editor]]: its page, and the layer that paints the continents and shapes the land, in 2D, in 3D and close up, and sails the Sloop alone or, through what its page offers, in a fleet room |
| `client/src/terrain/` | The terrain layer: the land drawn in rings round the eye on WebGPU, and the land crate's worker, for the [[World Editor]] and the game |
| `client/testground/`, `client/src/testground/` | The [[Test Ground]]: its page, and the layer that plays and dresses the forge's figures on open ground, with a course to climb |
| `client/src/forge/` | The forge layer: reads the [[Sprite Forge]]'s published strips and composes a figure's frames from them |
| `client/src/firstperson/` | The first-person layer: the weapons, held things and hands in view, swung, fired, dyed and drawn over the scene ([[First Person]]) |
| `client/src/sky/` | The sky layer, which imports nothing: the world's clock set right by the rooms, the [[Sky]] and [[Weather]] read from the sky crate through its own WebAssembly, and what the scene draws by them |
| `client/src/water/` | The water layer: the [[Water]]'s surface, breakers, ripples and underwater view, drawn over any land a layer hands it, and a walker's wading, swimming and diving; the sea by weather round the view (`seaWeather.ts`), and every ship's wake, bow wave and spray (`wakes.ts`) |
| `client/src/combat/` | The browser's side of [[Combat]]: the fight's controller in a room (the player's fighter predicted, foes and shots kept), the fight's display as nodes of the interface the game draws, the ground's marks for telegraphed blows and shots, the shots' tracers, the drops lying for the player ([[Gear]], "Drops"), the plates over other players ([[Interface]], "Players"), and [[Blood]]; the [[Arts]]' casting keys, ability bar and every spell's view; and a Sloop's session in a fleet room ([[Naval Combat]]), its orders sent and its ship predicted |
| `client/src/nature/` | The nature layer: each biome's trees, plants and rocks, made in code, scattered over the ground round the eye and drawn on WebGPU ([[Nature]]), and the owner's meadow over the grass ([[Meadow]]). Imports `rules`, `water` and `sky` |
| `client/src/ships/` | The ships layer: each hull's mesh read from R2 by its wire number and drawn at its pose on the water in its side's colours, flying its flag, under its gaff, stay and square sails ([[Sailing]], [[Hulls]]), its line at its waterline read from its mesh for the water (`hullLines.ts`, [[Water]]), and a fight's look: its balls drawn as small spheres and its flotsam as crates, chests and barrels (`markView.ts`), its see-through puffs blended after the water and their light (`puffView.ts`), each event made puffs, harm, sounds and jars of the eye (`fightFeel.ts` with DFO's moments' laws in `fightMoments.ts`, `effects.ts` with its puffs' laws in `puffLaw.ts`, `flotsam.ts`, `fightSounds.ts`, `shake.ts`), the fight's readout from its view (`fightDisplay.ts`), and where the captains' plates stand (`shipBars.ts`), drawn by the game's interface, and the harm kept on each ship and drawn on it: holes in its hull and canvas, sails torn away, masts fallen, colours struck and its going down (`shipHarm.ts`, `harmDrawn.ts`) ([[Naval Combat]], "How it looks") |
| `client/src/network/` | The network layer: the browser's side of the [[Server]]: its messages, made from the same schema, the connection to a room, or to a room run in the game's worker when playing alone, and the prediction it corrects |
| `client/src/rules/` | The rules layer: the Rust rules, the [[Land]] (with its door's sailing and naval fights), [[Movement]] and [[Combat]]'s player tick, loaded as WebAssembly, for any page that needs them, and a fighter's numbers read |
| `client/src/game/footRevive.ts`, `client/src/game/relog.ts` | The page's side of [[Revives]] (E over a fallen ally, their mark, the death screen's words, the notices) and of logging back in where the player left ([[Accounts]], "Where a player logs back in") |
| `client/src/game/isleLaw.ts`, `client/src/game/isles.ts`, `client/src/game/isleVisit.ts`, `client/src/network/islePlans.ts` | The sea's [[Islands]] in the game: each the sea room tells of built through the room module, every voyage bent round them, the offer to go ashore, the way in to an anchorage, and the player ashore on an island's room, E scavenging its wrecks and trying its door |
| `client/src/game/seaWord.ts`, `client/src/network/seaHarbour.ts` | The sea's word to the player as the game tells it: the joins, the board offer and E's asks in a fight, what floats gathered, washing up and Manage's repair, from the sea snapshot's own part and its told codes (`TOLD`) ([[Game]], "At sea") |
| `client/src/game/deckBoarding.ts`, `client/src/game/deckFight.ts`, `client/src/ships/spars.ts` | The fight on a boarded ship's deck: `Foot` on its grid of heights, its deck room reached through the sea's link, every figure, mark and the display laid on its ship as the fight lies it, its minute and its hold's take; its masts and spars as boxes the deck camera keeps a clear line past ([[Naval Combat]], "The fight on a struck deck, on the page") |
| `client/src/game/seaHostiles.ts` | The hostile ships the sea's view marks, the voyage's line on each first sighted and on other waters entered, and the water named for the status line ([[Game]], "At sea") |
| `client/src/rules/watersRules.ts` | The waters' and the friendly traffic's doors for a page, on the room module ([[World Map]]) |
| `client/src/islands/` | The sea's procedural islands drawn: an island's plan read and checked, each kit's module pack read, its ground meshed near and far, its modules instanced by kit and distance, near, middle and far ([[Island Drawing]]) |
| `client/src/heldmap/` | The held map: the parchment raised at the helm, the whole world inked on it, the waters tinted by holder, its words laid out by priority clear of the gauntlets and keyed in one panel, the ruins marked, panned, zoomed and clicked for a destination ([[Held Map]]) |
| `client/src/game/friendlyShips.ts` | The friendly ships round the eye at sea and on foot: asked at world time, eased between answers at the waters' pace, at anchor at a route's end, only as many of each hull as the ships layer can draw, drawn and marked on the compass ([[Game]]) |
| `client/src/game/pageWaters.ts` | The waters opened once a page, off the first frame: the rules, the table and the held map's grid, and what the sea reads of them (the water named, the port cities) ([[Game]], [[Held Map]]) |
| `client/src/game/gameBoot.ts`, `client/src/game/game.ts`, `client/src/game/gameFrame.ts` | The game's three jobs: booting the rooms, modules, scene, world and the place arrived at; the ways into each place and the player's actions; and each frame on foot or at sea ([[Game]]) |
| `client/src/game/travel.ts`, `client/src/game/tripBack.ts` | The travel between places behind the veil, and where a trip that fails takes the player instead: back where they stood, else the hub, told why ([[Game]], "The flow") |
| `client/src/game/seaView.ts` | The view over the ship at sea: its camera turned, dragged and zoomed, brought in close, flown up over an island's side and back with the landings marked there, and down to its helm ([[Game]], "At sea") |
| `client/src/game/helmMap.ts` | The held map at the helm: made when first asked for, raised once the view stands at the helm, its keys, and what it draws over the picture ([[Held Map]]) |
| `client/src/ruinedName.ts` | A ruined city's name as the city crate names it, for the held map and arriving ([[Cities]], "Ruins") |
| `client/src/rules/feelEvents.ts` | What a sea room tells of its fights beside the World Editor's events, and the one mapping that hands each to the fight's feel ([[Naval Combat]]) |
| `server/breach.ts` | A Breach between its two rooms' hosts: the zone holding launched players in their run's company, the run asking its zone whether its gate opened and telling it how far its company has come ([[Breaches]]) |
| `server/seaPorts.ts` | The ports the sea room is opened with, each continent's city read from its land file as the game reads it ([[Server]]) |
| `server/outpostHost.ts`, `server/delveHost.ts` | The host's side of a guild's outpost's room, which stands the guild's plot as blocks and takes its errands to the accounts, and of a guild dungeon's run behind the Delve Gate, laid by the guild's key and the week ([[Outposts]]) |
| `client/src/editor/aimCamera.ts`, `client/src/editor/aimStation.ts`, `client/src/editor/shipClear.ts`, `client/src/ships/aimView.ts`, `client/src/game/seaSight.ts` | The sea fight's aim: the eye eased round the ship and in over its rail to its battery's station aboard, in a gap of its rig, looking off the side at the lay, the lay drawn as screen-wide dashed ribbons fanned by its spread, rings, posts and strike marks in three tones, and the crosshair and aim line ([[Naval Combat]], "The aim, as DFO's") |
| `client/src/overworld/` | The overworld layer: the [[Overworld]]'s camera, pick, sea routes, voyages, marks and bird's-eye view of an island's side, pure, with no page or drawing |
| `client/src/textures/` | The textures layer: the [[Procedural Textures]], every picture the forged world wears and the ground's sets, painted in code |
| `client/src/models/`, `content/forged/` | The models layer, which imports nothing: the [[Forged Models]], DFO's town buildings, props and room kit built from the three measured tables in `content/forged/` |
| `client/src/plus/` | The [[Interface]]'s Enhanced Plus kit, which imports nothing: carved stone and brass, each surface painted by the role it plays; the sea fight's readout's words and model (`seaFight.ts`, drawn by `combat/seaReadout.ts`); DFO's notices as a list (`notices.ts`, drawn by the HUD); a bar's state with its lost strip and falling pieces (`meter.ts`, drawn by `combat/barDraw.ts`); the emblems' pixel art and motifs (`emblemArt.ts`, `emblemMotifs.ts`), which the Roster and a ship's flag draw |
| `client/src/ui/` | The ui layer, which imports `plus`: the [[Interface]] as the GPU draws it, from the face's cells, the kit's frames and bevels, and one instanced draw a frame; the pad's cursor (`padCursor.ts`) and the gauntlet the pointer wears (`gauntlet.ts`) |
| `client/src/thread/` | The thread layer, which imports `ui`: the page and the game's worker joined ([[Game]], "Threads"): the page's stand-ins in the worker, the page's side that hears the player and carries out what the game asks, and the game's sound made on the page's audio |
| `client/src/city/` | The city layer: a city's plan drawn on WebGPU with the forged models and the procedural textures, whole near the eye, as masses and hulls further out, its solids and ground plates at every distance; a ruin's buildings broken (`ruins.ts`) ([[Cities]]) |
| `client/src/layout/` | The layouts in the browser: drawn with the city layer near the eye, the nodes' laid sections, and the ways through gates ([[Layouts]]) |
| `client/src/speech/` | The speech layer, which imports `plus` and `ui`: the voice made in the browser for every line, the dialogue box, barks over heads and emotes ([[Speech]]) |
| `client/src/cinema/` | The cinema layer, which imports `water`, `combat`, `plus` and `ui`: the camera on rails, the screen's fades and bars, the weather pass, birds, fire and smoke, and the storm's sounds ([[Cinema]]) |
| `client/src/game/launcher/` | The [[Desktop App]]'s launcher: its window, the patch notes it reads and marks new, and the servers it asks |
| `client/src/game/prologue/` | The [[Prologue]]: the tap to start, the intro and title, character creation and the story mission's beats, run by its director |
| `client/src/game/npc/` | The keepers' screen every counter of a social space opens, and Shape's: the keeper drawn in their dress with their words and band, the rows of wares each keeper sells, a faction's rows (`factionRows.ts`), the stock's clock ([[Interface]], [[Factions]]) |
| `client/src/game/gearHints.ts` | What the menu's footer says each view's presses and keys do, the bounty board's and the Journal's among them ([[Interface]]) |
| `client/src/game/stationView.ts`, `client/src/game/shipPages.ts` | A station's screen in the menu and its title: a keeper's, the pledged faction's with its muster of officers (`musterAt`), or the Harbourmaster's counter (`harbour/`), and the bounty board's title (its screen is `bountyBoard.ts`); and the ship's tab with the Shipwright's modules ([[Interface]], [[Crew]], [[Ship Power]], [[Activities]]) |
| `client/src/game/harbour/`, `client/src/game/sailedShip.ts` | The Harbourmaster's counter: the shipyard, the paint yard, the register and the Shipwright, what each offers from the gear (`harbourModel.ts`), and its headless pictures (`harbourShots.ts`); and the ship the player sails as their gear says ([[Shipyard]]) |
| `client/src/game/bountyBoard.ts`, `bountyTiles.ts`, `bountyFaces.ts`, `bountyStage.ts` | The bounty board's screen, after Destiny's Bounty Tracker: the rows the gear carries and what each pays (`bountyBoard.ts`), a bounty's tile and floating card, which the Journal's column shows too (`bountyTiles.ts`), the town's writ and each faction's emblem as a tile's face (`bountyFaces.ts`), and the board drawn where a keeper's screen stands its keeper (`bountyStage.ts`) ([[Interface]], [[Activities]]) |
| `client/src/game/appearance/` | The Appearance screen the Character page's button opens: the figure on display and the emblems and dyes to wear; and the horse's picture and the barding tiles the Mount slot shows ([[Interface]], [[Gear]]) |
| `client/src/game/guild/` | The player's guild ([[Guilds]]): the banner law and its art, the guild's signs, levels and week, the Guild tab after Destiny 2's clan screen, the banner editor, the guild's details and founding; the outposts' law, where their structures stand (`outpostPlaces.ts`), the outpost the player stands at and what E does there (`outpostHere.ts`), placing a piece of decoration and the decorating view (`decorPlacing.ts`, `decorateView.ts`), the guild dungeon's room name, seed and style (`delveRoom.ts`), and the Outposts and Treasury pages ([[Outposts]]) |
| `client/src/game/social/` | Other players as one meets them ([[Interface]], "Players", [[Chat]]): holding Use on a player, their menu and Inspect, and the chat's link to the hall, its kept lines and its band |
| `client/src/game/welcome/` | The stranger's welcome to Overlook after the story: her words face to face with the player's keys held (`framing.ts`), and her task asked heard of the room ([[Prologue]]) |
| `server/` | The [[Server]]'s Cloudflare shell ([[The Server's Shell Is in server]]): the Worker and its Durable Object, which keep each room in WebAssembly, Cloudflare's settings (`wrangler.jsonc`) and the shell's TypeScript settings, and the keeper that keeps each player's character with the accounts while they play |
| `server/accounts/` | The [[Accounts]]' own Worker over D1: guests, usernames and passwords, Discord sign-in, sessions, the judge of the [[Names]] players set for others to read, the Roster (friends, companies, guilds, blocks, mutes, reports, where each player is), guilds' treasuries and outposts, the chat's hall and its law, the characters the rooms hold, Find a Company's queues, the linked character the [[Discord Bot]] reads, and the database's migrations |
| `site/` | The [[Website]], built apart from the game by its own Vite config (`site/vite.config.ts`) into `target/site/`: one folder a page, each `index.html` naming its words, links and pictures by key |
| `site/worker.ts` | The site's Worker, run for `/download/` alone: the [[Desktop App]]'s installers and update feeds read from R2, and the names that never move sent to the newest |
| `site/src/siteMap.ts` | The site's pages, the outside places it links to (Play, the Discord) and its own address, each named once; adding a page is one entry here |
| `site/src/words.ts` | Every word the site says, by page and name: the owner's premise passage by passage, and the lines from the decisions |
| `site/src/page.ts`, `sitePlugin.ts` | A page made whole: the bar and the foot laid in, its words, links and pictures filled; and the Vite plugin that does it at serve and at build and writes the pictures into the build |
| `site/src/art/` | The site's pictures, drawn at build time: the sheet and its PNG writer, the scenes' parts, the scenes, and the owner's logo and the tab's icon from the game's own pixel picture |
| `site/src/site.css` | The site's one stylesheet: the night sea, lantern gold, framed pictures and Pixelify Sans, bundled |
| `site/src/panel/` | The Discord bot's panel, the one site page that runs a script: its door to the bot (`panelApi.ts`), its pages by hash (`panelMain.ts`, `records.ts`), forms drawn from the bot's law (`form.ts`, `parts.ts`), the message composer, its tools, templates and live preview, the pictures section, its stylesheet, and a stand-in document for its tests (`domForTests.ts`) |
| `server/bot/` | The [[Discord Bot]]'s own Worker over its own D1: Discord's signed interactions, the panel's Discord sign-in and API, the Durable Object holding Discord's Gateway, the one door to Discord's REST, uploaded pictures with their metadata taken out, the registry that routes events, commands, presses, tables, acts and the clock to modules, and the database's migrations |
| `server/bot/law/` | The bot's law, platform-neutral so the website's panel imports it too: access levels from Discord permissions, the settings law, every module's declared settings, tables and acts, and the message law that builds what Discord is sent |
| `server/bot/modules/` | The bot's modules, most one file each, a large one's parts beside it, and what a module is (`module.ts`) |
| `server/bot/layout/` | The No Shores server's layout as data (roles, channels, settings, modules, messages) and the plan and build that make it (`build.ts`, `parts.ts`) |
| `desktop/` | The [[Desktop App]]: its own package (Electron, its packing tools and the updater), the shell's TypeScript settings, and electron-builder's settings in `package.json`. Builds into `desktop/out/` (not in git) |
| `desktop/src/` | The shell: its wiring (`main.ts`), the game's window and its keys, crashes and unreachable address (`gameWindow.ts`, `crashes.ts`), the fences and the game's address (`fences.ts`, `gameAddress.ts`), the bridge and its preload (`bridge.ts`, `preload.cts`), the graphics backends, their switches and the watch over a launch (`graphics.ts`, `switches.ts`, `graphicsWatch.ts`), the kept settings (`config.ts`), the window's place, the menu, and the updates (`updates.ts`, `updater.ts`) |
| `desktop/release/` | A release's tools: its version from its commit's time, the check that it is whole, its upload order and Linux's two feeds made one, and the icon drawn by the site's code |
| `crates/` | Every Rust crate, one folder each, named after its crate |
| `crates/world` | The world's structure: the layout of continents and isles, its rules and exact geometry ([[World Map]]) |
| `crates/world/src/waters.rs`, `traffic.rs`, `traffic_routes.rs`, `ports.rs` | The sea's nine waters, their holders, names and borders; the three port cities; and the friendly traffic's routes and ships ([[World Map]], "Waters" and "Traffic") |
| `crates/world/src/weather.rs` | The weather over the whole world from world time and place: the wind, the sea state and the shelter of the open water upwind and of a roadstead ([[World Map]], "Weather and travel"; [[Water]]) |
| `crates/world-wasm` | The world rules for the browser: a door crate, text in and text out |
| `crates/land` | The [[Land]]: relief, erosion and water from the painted coasts, the owner's edits and places, and the ground anywhere to the metre |
| `crates/land-wasm` | The land for the browser: a door crate, heights handed over as bytes |
| `crates/movement` | [[Movement]]: how a body walks, runs, jumps, climbs, hangs, mantles and vaults, one tick at a time |
| `crates/movement-wasm` | Movement for the browser: a door crate, a body stepped one tick at a time |
| `crates/layout` | The [[Layouts]] of patrol areas and instances: areas, paths, carved land, RMB villages, set pieces, great works, walk-in rooms, sites and sections |
| `crates/reach` | [[Reach]]: a node's section of the land, the warning past its edge, death beyond it and the respawn |
| `crates/dungeon` | [[Dungeons]]: the patrol areas' dungeons, laid by DFO's Forge from a seed, rooms and corridors on a grid of 3.2 m cells |
| `crates/isle` | [[Islands]]: a sea island from its seed and climate, the same on the server and in every browser: its shape, its fine ground, its places and its dressing of the Blender modules content/islands/kits.json names |
| `crates/navmesh` | The [[Navmesh]]: where a foe can walk, baked from a course's blocks over open ground or any terrain, the links where the movement rules climb a block's side or drop off its edge, the paths across both, and the firing spots shooters fight from |
| `crates/combat` | [[Combat]]: how fighters swing, guard, parry and dodge, their stamina and poise, the soft lock, foes' telegraphed blows, shots in flight, and the statuses a fighter is given |
| `crates/foes` | [[Enemies]] and [[Foes]]: factions, roles, the roster and ranks, a deck's crews (`crews.rs`), and the brain each foe fights with: awareness and noises, turns at a target, the ring and flanking, cover, the combat director, telegraphed blows and phases, and answers to blows |
| `crates/sky` | The world's clock, its sun, moon and stars, and its weather: one field over the whole map from world time and place, with its wind, lightning and the ground's wetness ([[Sky]], [[Weather]]) |
| `crates/sailing` | [[Sailing]]: how a ship sails, its helm, its sails against the wind, its pose on the swell and where it grounds, one tick at a time |
| `crates/gear` | [[Gear]]: items, their rarity, nodes and costs, Prestige and level, Attack and Defense against a foe's level, Vestiges, weapons' elements and foes' shields, emblems and cosmetics, the [[Arts]] a player wears and their levels, the [[Factions]] they pledge to, Shape and his Shapes, what a player holds and shows others, each character's day and week of activities and its story, the Breaches' tiers and what their clears pay (`breach.rs`), what is on, drawn by the day and the week, the bounties and side quests, one engine counting both, and the game's one clock |
| `crates/naval` | [[Naval Combat]]: guns laid and fired, balls in flight, the harm they do, a ship's rigging shot away (`rigging.rs`), the events a fight sends (`fight_events.rs`), and a captain who fights, one tick at a time |
| `crates/protocol` | The [[Server]]'s messages: the schema, `messages.fbs` and the gear's `gear.fbs`, the Rust `flatc` makes from it, and the server's side of reading and writing them (a Breach's in `breach_wire.rs`). A door crate |
| `crates/room-wasm` | The room for its Cloudflare host: a door crate, bytes in and bytes out; a fleet ship's prediction and lay for a browser; and the foes' roster for the browser |
| `crates/room-wasm/src/waters_door.rs` | The waters and the friendly traffic for the browser: the water at a point, the held map's grid as bytes, the ships near a point ([[World Map]]) |
| `crates/room-wasm/src/snapshot_door.rs` | The room's snapshot after its tick, sent to each player as theirs: on land a dungeon's cache and an Abyss run's revives; at sea what floats, a ship's kept hurts, what the sea tells and a boarded deck only to the player they are for ([[Server]]) |
| `crates/room-wasm/src/breach_door.rs` | A Breach for its host and its page: a run opened from its ask, its plan as the page draws it, how far its company has come, and the host's words at a gate ([[Breaches]]) |
| `crates/room-wasm/src/sea_door.rs` | The sea by weather for the browser: the swell under the weather at a point, its height over a grid round the view, and its fingerprint ([[Water]]) |
| `crates/room-wasm/src/guild_door.rs`, `outpost_door.rs` | The doors the host tells a room of a player's guild through (its bounties done, whether they joined before the week, what its outposts give), and a guild's outpost's room runs its errands through ([[Guilds]], [[Outposts]]) |
| `crates/room/src/sea_weather.rs` | The weather a room's fight is fought in, taken where and when it began, and the fight's waters made from the coasts ([[Sailing]]) |
| `crates/room` | The [[Server]]'s core: one shared space, its players' inputs in order, their bodies stepped tick by tick on its ground and judged against its section, its foes thinking and stepping by the same rules, and a node's garrison, its groups walking their beats ([[Enemies]]); the sea, its ships sailing their courses at DFO's paces or the world's own time; a fleet, its ships sailed by their helms and fighting at true scale; and a Breach's run and its gate (`breach/`, its plan's tables written from its content by `build.rs`, [[Breaches]]) |
| `crates/room/src/battle.rs`, `flotsam.rs`, `harbour.rs`, `deck_fight.rs`, `sea_ports.rs`, `sea_decks.rs` | How the sea's fights end: a fight of many players and the ships that join it, what floats and who gathers it, the port cities ships wash up at and are repaired by, a struck captain's deck as a room on land, the kept hurts and the leaving rules ([[Naval Combat]], "How a fight ends") |
| `crates/room/src/revive.rs`, `respawns.rs`, `checkpoints.rs` | [[Revives]]: a fallen player revived by an ally's held Use or respawned by their own ask, where they stand again (near the fall in a patrol zone, an activity's checkpoint), and the darkness zones |
| `crates/room/src/sighting.rs`, `chart.rs` | The sea's hostile ships by its waters: how often a roll sends one by the water's band, who, at which rank and level, how far it is sighted from and where it comes; and the chart they read, the coasts, the nine waters and the friendly lanes ([[Naval Combat]], "At sea") |
| `crates/room/src/measure_tests.rs`, `fight_measure_tests.rs` | The sea measured by hand, in release: players voyaging through each kind of water, and a plain player's fights with a captain of each rank and level, standing off or closing ([[Naval Combat]]) |
| `crates/room/src/outpost.rs`, `outpost_boss.rs` | A guild's outpost's room, holding its members' asks as errands for the accounts, and the War Horn's guild boss at the muster ground ([[Outposts]]) |
| `crates/room/src/guild_book.rs`, `guild_room.rs`, `sea_guilds.rs` | What a room knows of each player's guild, and a land room's and the sea's part in it: a tenth of the XP they gain to their guild, and their counts toward the week's guild bounties ([[Guilds]]) |
| `crates/city` | [[Cities]]: a city's plan from its site, the same on the server and in every browser: its footprint, ways in, districts and terraces, its cells filled with Daggerfall's RMB blocks, its wall and harbour, its landmark and its social space; a ruin's broken landmark, breaches, rubble and wrecks (`ruins`) |
| `crates/bake` | The bake (`npm run bake`): each node's section, window of the ground and boxes, cut at build time for its room ([[Server]]) |
| `crates/xtask` | The repository's own checks: `cargo xtask check` ([[Checks]]) |
| `generated/` | What the tools make, never in git ([[Generated Files Stay Out of Git]]): `generated/messages/`, the messages' code `flatc` makes, and `generated/nodes/`, the bake's file for each node and their index, which the server's rooms read |
| `content/` | Authored game data, read by the tools, the server and the client: `content/world/layout.json`, each landmass's edits in `content/world/land/`, `content/world/open.json`, the patrol areas and missions open to players ([[World Map]]), `content/forge/renders.json`, which names the forge's published renders, `content/ships/ships.json`, which names each ship's published mesh and holds its waterline, guns and hit boxes, `content/testground/course.json`, the Test Ground's course, which the server's rooms stand on too, and `content/gear/`, the [[Gear]]'s traits, named items, islands' resources, rolled items' names, emblems, cosmetics and factions, built into the gear rules (the page reads the emblems, cosmetics and factions too), `content/arts/arts.json`, the [[Arts]]' spells and fragments with their numbers and the Arts' levels (`levels`: the bars, the rises' prices, power and lasting), built into the gear rules and read by the page, `content/world/social.json`, which social spaces open and the townsfolk's lanes, read by the city crate and the page, and `content/audio/`, the cues searched on Freesound and `sounds.json`, the published sounds the game plays and credits, and `content/story/`, the cast's voices and each mission's scenes, held to [[Dialogue]] by the dialogue check |
| `content/` (the rest) | `content/dungeon/`, the dungeon styles' kits, landmarks and published packs ([[Dungeon Modules]]) and each Breach's plan (`breach-drowned-vale.json`, [[Breaches]]); `content/forged/`, the forged models' measures and the props' parts ([[Forged Models]]); `content/islands/`, the island modules' kits and packs ([[Island Modules]]); `content/lore/lore.json`, the Compendium's books ([[Lore]]); `content/modules/modules.json`, the handcrafted modules' manifest ([[Modules]]); `content/nature/flora.json`, each biome's published flora ([[Flora]]); `content/prologue/wreck.json`, the wreck's level ([[Prologue]]); `content/guilds/`, the guilds' levels, banners and outposts' structures and decoration ([[Guilds]], [[Outposts]]); and `content/quests/quests.json`, the roads' and side quests' tasks ([[Quests]]) |
| `content/world/rmb/` | Daggerfall's RMB town blocks as data, for laying out towns: placements, ground tiles and flat counts ([[RMB Blocks]]) |
| `tools/claude-toolkit/` | The co-dev's Claude Code toolkit, kept as shipped ([[Toolkit]]) |
| `.claude/settings.json` | The repository's Claude Code settings: a hook that says, as a session starts, when the toolkit is not installed in its container ([[Toolkit]]) |
| `tools/forge/` | DFO's [[Sprite Forge]], kept as shipped in DFO's own layout ([[DFO's Sprite Forge Comes Over Exactly]]) |
| `tools/forge_publish.py` | Publishes the forge's renders and tables to R2, and pulls them back |
| `tools/flora/` | Grows each biome's trees, shrubs and grass in Blender and bakes them into its picture layers, published to R2 by the `flora` workflow ([[Flora]]) |
| `tools/modules/` | Scripts the hub's and the zones' handcrafted modules in Blender, their pieces and adornments, and the outposts' structures, standards and scaffolds (`outpost_*.py`), baked and published by the `modules` workflow ([[Modules]]) |
| `tools/wreck/` | Builds, lights, dresses and exports the prologue's wreck in Blender, published by the `wreck` workflow ([[Prologue]]) |
| `tools/item-pictures/` | Bakes the item pictures from Blender models into the client, and draws the officers' posts by hand ([[Item Pictures]]) |
| `tools/islands/` | Builds the sea islands' modules in Blender from `content/islands/kits.json`, checks, packs and publishes them ([[Island Modules]]) |
| `tools/r2.py` | R2 access for the publishers: objects named by their hash, uploaded once and checked when fetched; with `R2_STAGE`, a build stages its uploads in a folder that `r2.py upload` sends from a job that holds the token ([[Toolchain]]) |
| `tools/ships/shape_ship.py` | Shapes the owner's Sloop, its parts painted already: its size, and the gap and steps down from its quarterdeck ([[Sailing]]) |
| `tools/ships/paint_ship.py` | Sorts a ship's faces into its parts and lays their UVs in metres, for the procedural painter's pictures ([[Sailing]]) |
| `tools/ships/deck.py` | Measures a ship's deck from its published mesh, a grid of heights with walls where a body cannot walk, and the spot behind its wheel ([[Sailing]], "Its deck") |
| `tools/ships/export_ship.py` | Exports a ship's `.blend` to the game's mesh, with its waterline, guns, the boxes a ball can strike, its sails' corners and its deck, and publishes the model and mesh to R2 ([[Sailing]], [[Naval Combat]]) |
| `tools/ships/build_ship.py`, `ship_hull.py`, `ship_rig.py`, `ship_fittings.py`, `ship_details.py`, `ship_mesh.py` | Build a new hull's model in the Sloop's style from its numbers: its shell, rig, fittings, finer work and rigging, the Sloop's guns, and its companionway into the cabin ([[Hulls]]) |
| `tools/ships/build_cabin.py`, `cabin_props.py` | Build the one cabin every ship opens into, and furnish it along its walls and stern ([[Hulls]]) |
| `tools/ships/ship_pictures.ts` | Writes the pictures a ship's parts wear, from the procedural painter, for `paint_ship.py` to pack into its model |
| `tools/dungeon/` | The [[Dungeon Modules]]: Blender scripts that build each dungeon style's kit and landmarks (`styles/`), the kit they build with (`kit/`, `shapes.py`, `details.py`), the envelopes a piece keeps, the pack writer, the contact sheets and the publisher; the `dungeon` crate's `build.rs` reads the landmarks from `content/dungeon/landmarks.json` |
| `tools/forge_dyes.mjs` | Reads Daggerfall's palette once into the forge's dye table |
| `tools/freesound/` | Finds candidate sounds on Freesound's public pages for the cues in `content/audio/freesound.json`, on GitHub's machines (the `freesound` workflow), and publishes the owner's picks to R2 with their credits ([[Sounds Come From Freesound, Judged on a Test Sheet]]): the workflow runs on each push that changes the cue list, `tools/freesound/` or itself, cuts long picks and stages the picks for R2 in a job that holds no key, keeping the game's `sounds.json` in its download for a commit to take in, and uploads them in a second job that holds the repository's `CLOUDFLARE_TOKEN` |
| `tools/install-flatc.sh`, `tools/schema.mjs` | Install the pinned `flatc`, and make the messages' code with it into `generated/` ([[Toolchain]]) |
| `tools/numbered.json` | The content whose entries cross the wire by their place in its lists, which the protocol's version hashes |
| `tools/shaders.mjs`, `tools/shaderCalls.mjs` | Writes out every shader the client compiles, for the check to validate, each read from the call that compiles it ([[Checks]]) |
| `tools/uiShot.mjs` | Pictures of the interface the game draws, headless, through the real renderer ([[Interface]]) |
| `tools/wireSizes.mjs` | Measures what the rooms send a player, raw and deflated as the WebSocket sends it |
| `tools/lattice/` | The [[Lattice]] drawn whole in Blender: each foe's body and moves, the death wave, its props, the growth and the armoury, rendered by the `lattice` workflow's jobs and laid into the forge's tables (`tools/test_forge_lattice.py` checks how) |
| `tools/logo/` | Writes the owner's No Shores logo into the client as a pixel picture ([[Cinema]]) |
| `tools/meadow/` | Writes the owner's meadow sprites into the client as pixel pictures ([[Meadow]]) |
| `tools/forgedParts.mjs` | Writes the boxes each forged prop's drawn shape fills into `content/forged/parts.json` ([[Forged Models]]) |
| `bible/` | This vault |
| `.github/workflows/` | CI (`ci.yml`), which runs `cargo xtask check` and on `main` then calls `rooms.yml` to deploy the accounts and the rooms when their code changed, then `pages.yml` and `site.yml` to publish the client to GitHub Pages and the site, once the rooms deployed or had nothing to, while that commit is still `main`'s head, and `bot.yml` to deploy the Discord bot; actions are pinned by commit |

## The client's layers

Every folder directly under `client/src` is a layer, declared in `LAYERS` with what it may import, when its first
file arrives. Files directly in `client/src` may import any layer. They are also groundwork any layer may import,
such as `gpu.ts`, except the entry points `main.ts`, `gameWorker.ts` and `editorPage.ts`, which nothing imports but
another entry point, as the page names the game's worker. Client code never imports
Node's modules (tests may) and never uses WebGL. As the code arrives, the layers follow one direction:

- **The engine** (GPU, drawing, sound, input, assets) knows nothing of the game.
- **The interface** draws on the engine and reads game state; it does not change it.
- **The network** speaks to the server and knows nothing of drawing.
- **The entry points** wire them together. They wire; they do not implement ([[Small Files]]).

Declared so far: `rules`, `sky`, `forge`, `textures`, `models`, `overworld` and `plus` (each imports nothing),
`network` and `water` (each imports `rules` and `sky`), `terrain` and `nature` (each imports `rules`, `water` and
`sky`), `ships` (imports `rules`, the water's sun and samples, `textures`, `plus` and `sky`), `editor` (imports
`rules`, `water`, `terrain`, `ships`, `islands`, `city`, `layout`, `sky` and `ui`, which draws its panel and the names
over its views), `combat` (imports `rules`, `network`, `plus`, `player`, the editor's camera, `sky` and `ui`, whose
nodes its display builds), `player` (imports `rules`, `network`, `forge`, `firstperson` and the editor's camera),
`testground` (imports what `player` does, `player` itself, `combat`, the editor's panel helpers and `ui`, which draws
the fight's display there), `firstperson` (imports `forge`), `city` (imports `models`, `textures`, `rules`, `water`
and `sky`), `layout` (imports `city`), `heldmap` (imports `forge`, `overworld`, `plus`, the first person's picture
drawer and `ui`), `ui` (imports `plus`), `thread` (imports `ui`), `islands` (imports `rules`, `water`, `textures`,
`models` and `sky`), `speech` (imports `plus` and `ui`), `cinema` (imports `water`, `combat`, `plus` and `ui`) and
`game` (imports the layers it wires, `combat`, `cinema` and `speech` among them;
[[The Bars and the Fight Wear the Plus Kit]]). The code `flatc` makes, in `generated/`, is groundwork any layer may
import.

## The Rust crates

Crates appear when the work reaches them. Each is declared in the crates check's table, which says which other crates
and outside crates it may use (`CRATES`, [[Checks]]):

- **The rules**: what the world and its people may do. No graphics, network, files or clock, so the server and any
  predicting client compute the same bits ([[Agree to the Bit]]). They are `world`, which may use only `serde` and
  `serde_json`; `land`, which may use `world`, `serde` and `serde_json`; `city`, which may use `land`, `world`,
  `serde`, `serde_json` and `libm`; `layout`, which may use `city`, `land`, `world`, `serde`, `serde_json` and `libm`;
  `movement`, which may use only `libm`; `sky`, which may use `land` and `world`; `sailing`, which may use `land`,
  `sky` and `libm`; `naval`, which may use `sailing` and `libm`; `combat`, which may use `movement` and `libm`;
  `navmesh`, which may use `movement` and `libm`; `foes`, which may use `combat`, `movement` and `libm`; `reach` and
  `dungeon`, which use no other crate; `isle`, which may use `movement`, `serde`, `serde_json` and `libm`; and `gear`,
  which may use `serde`, `serde_json` and `libm`.
- **The server**, at multiplayer ([[Server-Authoritative Multiplayer]]): the authority. It depends on the rules and its
  own platform crates, never on the client. Its core is `room`, which may use `combat`, `dungeon`, `foes`, `gear`,
  `isle`, `land`, `movement`, `naval`, `navmesh`, `reach`, `sailing`, `sky`, `world` and `libm`; its messages are
  `protocol`, which may use `combat`, `gear`, `movement`, `naval`, `room`, `sailing` and `flatbuffers`; and
  `room-wasm` puts them behind a WebAssembly door for the Cloudflare shell in `server/`, and for a browser playing
  alone or predicting its ship in a fleet, reading a node's baked file, an island's word and the layout with
  `combat`, `dungeon`, `foes`, `gear`, `isle`, `land`, `movement`, `naval`, `protocol`, `room`, `sailing`, `sky`,
  `world`, `serde` and `serde_json`.
- **Tools** run at build time, never in a room or a browser. `bake` may use `city`, `dungeon`, `land`, `layout`,
  `world`, `serde` and `serde_json`.
- **Door crates** hand memory across a boundary and are the only crates that may hold unsafe code. They are
  `world-wasm`, `land-wasm` and `movement-wasm`, which put the world rules, the land with its city (`city`) and a
  ship sailing and fighting over it, and movement on a window of the land behind WebAssembly doors for the browser;
  `room-wasm`, which puts the room behind one for its Cloudflare host; and `protocol`, whose code from `flatc` reads
  a message's bytes in place.
