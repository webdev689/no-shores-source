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
| `client/index.html` | The [[Game]]'s page: its canvas, its heads-up display and their look |
| `client/src/main.ts` | The entry point: fits the canvas, starts the GPU and hands both to the game layer |
| `client/src/canvasSize.ts` | A canvas's drawing buffer in device pixels, from its size on the page and the screen's pixel ratio, for every page's canvas |
| `client/src/editorPage.ts` | The [[World Editor]]'s entry point: offers the editor a fleet room, through the combat layer, when its address carries `?room=`, then starts it |
| `client/src/game/` | The game layer: the [[Game]]'s flow from arriving to landing, on foot in a node, at sea in the [[Overworld]] (its close views sizing her and easing her pace to her true speed, `seaLaw.ts`), the scene every drawer draws into, and the heads-up display |
| `client/src/player/` | The player layer: the [[Player]] as the Test Ground and the game both play it, with DFO's controls, the forge's figure and its frames; the fight's buttons and the moves a fight holds a figure to, the foes' dresses and figures, the crosshair, and the [[Arts]]' pictures |
| `client/src/gpu.ts` | Starts WebGPU, or tells the player why it cannot ([[WebGPU Only]]) |
| `client/src/face.css`, `face.ts`, `trueType.ts` | Every page's face: Pixelify Sans at its sizes, with the glyphs it misreads or lacks drawn in code and made into a font in the page ([[Interface]], "The face") |
| `client/src/shadow.ts` | The sun's shadow map round the eye, which every drawer of the [[Game]]'s scene casts into and reads |
| `client/src/soundSamples.ts` | The recorded sounds the owner picked from Freesound, fetched, levelled and played for the [[Interface]]'s cues and the world's, with their credits |
| `client/src/elementGlow.ts` | The [[Weapon Glow]]'s colours, outline field, shader and bursts, which the figures, the first person and the fight's effects draw with |
| `client/editor/`, `client/src/editor/` | The [[World Editor]]: its page, and the layer that paints the continents and shapes the land, in 2D, in 3D and close up, and sails the Sloop alone or, through what its page offers, in a fleet room |
| `client/src/terrain/` | The terrain layer: the land drawn in rings round the eye on WebGPU, and the land crate's worker, for the [[World Editor]] and the game |
| `client/testground/`, `client/src/testground/` | The [[Test Ground]]: its page, and the layer that plays and dresses the forge's figures on open ground, with a course to climb |
| `client/src/forge/` | The forge layer: reads the [[Sprite Forge]]'s published strips and composes a figure's frames from them |
| `client/src/firstperson/` | The first-person layer: the weapons, held things and hands in view, swung, fired, dyed and drawn over the scene ([[First Person]]) |
| `client/src/water/` | The water layer: the [[Water]]'s surface, breakers, ripples and underwater view, drawn over any land a layer hands it, and a walker's wading, swimming and diving; the sea by weather round the view (`seaWeather.ts`), and every ship's wake, bow wave and spray (`wakes.ts`) |
| `client/src/combat/` | The browser's side of [[Combat]]: the fight's controller in a room (the player's fighter predicted, foes and shots kept), the fight's display and its stylesheet, the ground's marks for telegraphed blows and shots, the shots' tracers, the drops lying for the player ([[Gear]], "Drops"), and [[Blood]]; the [[Arts]]' casting keys, ability bar and every spell's view; and a Sloop's session in a fleet room ([[Naval Combat]]), her orders sent and her ship predicted |
| `client/src/nature/` | The nature layer: each biome's trees, plants and rocks, made in code, scattered over the ground round the eye and drawn on WebGPU ([[Nature]]). Imports `rules` and `water` |
| `client/src/ships/` | The ships layer: each hull's mesh read from R2 by her wire number and drawn at her pose on the water in her side's colours, flying her flag, under her gaff, stay and square sails ([[Sailing]], [[Hulls]]), her line at her waterline read from her mesh for the water (`hullLines.ts`, [[Water]]), and a fight's look: its balls and puffs drawn as small spheres and its flotsam as crates, chests and barrels (`markView.ts`), each event made puffs, harm and sounds (`fightFeel.ts`, `effects.ts`, `flotsam.ts`, `fightSounds.ts`), and the harm kept on each ship and drawn on her: holes in her hull and canvas, sails torn away, masts fallen, colours struck and her going down (`shipHarm.ts`, `harmDrawn.ts`) ([[Naval Combat]], "How it looks") |
| `client/src/network/` | The network layer: the browser's side of the [[Server]]: its messages, made from the same schema, the connection to a room or a room in the page, and the prediction it corrects |
| `client/src/rules/` | The rules layer: the Rust rules, the [[Land]] (with its door's sailing and naval fights), [[Movement]] and [[Combat]]'s player tick, loaded as WebAssembly, for any page that needs them, and a fighter's numbers read |
| `client/src/game/seaAfter.ts`, `client/src/network/seaHarbour.ts` | What the sea's fights leave the player as the page tells it: the joins, the board offer and E's asks in a fight, what floats gathered, washing up and Manage's repair, from the sea snapshot's own part ([[Game]], "At sea") |
| `client/src/game/deckBoarding.ts`, `client/src/game/deckFight.ts`, `client/src/ships/spars.ts` | The fight on a boarded ship's deck: `Foot` on her grid of heights, her deck room reached through the sea's link, every figure, mark and the display laid on her ship as the fight lies her, her minute and her hold's take; her masts and spars as boxes the deck camera keeps a clear line past ([[Naval Combat]], "The fight on her deck, on the page") |
| `client/src/game/seaHostiles.ts` | The hostile ships the sea's view marks, the voyage's line on each first sighted and on other waters entered, and the water named for the status line ([[Game]], "At sea") |
| `client/src/rules/watersRules.ts` | The waters' and the friendly traffic's doors for a page, on the room module ([[World Map]]) |
| `client/src/heldmap/` | The held map: the parchment raised at the helm, the world inked on it under fog of war, the waters tinted by holder, its words laid out by priority clear of the gauntlets and keyed in one panel, the ruins marked, panned, zoomed and clicked for a destination ([[Held Map]]) |
| `client/src/game/friendlyShips.ts` | The friendly ships round the eye at sea and on foot: asked at world time, eased between answers at the waters' pace, at anchor at a route's end, only as many of each hull as the ships layer can draw, drawn and marked on the compass ([[Game]]) |
| `client/src/game/pageWaters.ts` | The waters opened once a page, off the first frame: the rules, the table and the held map's grid, and what the sea reads of them (the water named, the port cities) ([[Game]], [[Held Map]]) |
| `client/src/game/gameBoot.ts`, `client/src/game/game.ts`, `client/src/game/gameFrame.ts` | The game's three jobs: booting the rooms, modules, scene, world and the place arrived at; the travel between places and the player's actions; and each frame on foot or at sea ([[Game]]) |
| `client/src/game/seaShots.ts` | The sea's camera and its shots: turned, dragged and zoomed over her, brought in close, flown up over an island's side and back, and down to her helm ([[Game]], "At sea") |
| `client/src/ruinedName.ts` | A ruined city's name as the city crate names it, for the held map and arriving ([[Cities]], "Ruins") |
| `client/src/rules/feelEvents.ts` | What a sea room tells of its fights beside the World Editor's events, and the one mapping that hands each to the fight's feel ([[Naval Combat]]) |
| `server/seaPorts.ts` | The ports the sea room is opened with, each continent's city read from its land file as the page reads it ([[Server]]) |
| `client/src/editor/aimCamera.ts`, `client/src/ships/aimView.ts`, `client/src/game/seaSight.ts` | The sea fight's aim as DFO's: the eye eased out to her battery and short of a ship alongside, the lay drawn as screen-wide dashed ribbons, rings, posts and strike marks in three tones, and the crosshair and aim line ([[Naval Combat]], "The aim, as DFO's") |
| `client/src/overworld/` | The overworld layer: the [[Overworld]]'s camera, pick, sea routes, voyages, marks and bird's-eye view of an island's side, pure, with no page or drawing |
| `client/src/textures/` | The textures layer: the [[Procedural Textures]], every picture the forged world wears and the ground's sets, painted in code |
| `client/src/models/`, `content/forged/` | The models layer, which imports nothing: the [[Forged Models]], DFO's town buildings, props and room kit built from the three measured tables in `content/forged/` |
| `client/src/plus/` | The [[Interface]]'s Enhanced Plus kit, which imports nothing: carved stone and brass, each surface painted by the role it plays |
| `client/src/city/` | The city layer: a city's plan drawn on WebGPU with the forged models and the procedural textures, whole near the eye, as masses and hulls further out, its solids and ground plates at every distance; a ruin's buildings broken (`ruins.ts`) ([[Cities]]) |
| `server/` | The [[Server]]'s Cloudflare shell ([[The Server's Shell Is in server]]): the Worker and its Durable Object, which keep each room in WebAssembly, Cloudflare's settings (`wrangler.jsonc`) and the shell's TypeScript settings, and the keeper that keeps each player's character with the accounts while they play |
| `server/accounts/` | The [[Accounts]]' own Worker over D1: guests, usernames and passwords, Discord sign-in, sessions, the judge of the [[Names]] players set for others to read, the Roster (friends, companies, guilds, blocks, reports, where each player is), the characters the rooms hold, and the database's migrations |
| `crates/` | Every Rust crate, one folder each, named after its crate |
| `crates/world` | The world's structure: the layout of continents and isles, its rules and exact geometry ([[World Map]]) |
| `crates/world/src/waters.rs`, `traffic.rs`, `traffic_routes.rs`, `ports.rs` | The sea's nine waters, their holders, names, borders and seam; the three port cities; and the friendly traffic's routes and ships ([[World Map]], "Waters" and "Traffic") |
| `crates/world/src/weather.rs` | The weather over the whole world from world time and place: the wind, the sea state and the shelter of the open water upwind and of a roadstead ([[World Map]], "Weather and travel"; [[Water]]) |
| `crates/world-wasm` | The world rules for the browser: a door crate, text in and text out |
| `crates/land` | The [[Land]]: relief, erosion and water from the painted coasts, the owner's edits and places, and the ground anywhere to the metre |
| `crates/land-wasm` | The land for the browser: a door crate, heights handed over as bytes |
| `crates/movement` | [[Movement]]: how a body walks, runs, jumps, climbs, hangs, mantles and vaults, one tick at a time |
| `crates/movement-wasm` | Movement for the browser: a door crate, a body stepped one tick at a time |
| `crates/reach` | [[Reach]]: a node's section of the land, the warning past its edge, death beyond it and the respawn |
| `crates/navmesh` | The [[Navmesh]]: where a foe can walk, baked from a course's blocks over open ground or any terrain, the paths across it, and the firing spots shooters fight from |
| `crates/combat` | [[Combat]]: how fighters swing, guard, parry and dodge, their stamina and poise, the soft lock, foes' telegraphed blows, shots in flight, and the statuses a fighter is given |
| `crates/foes` | [[Enemies]] and [[Foes]]: factions, roles, the roster and ranks, a deck's crews (`crews.rs`), and the brain each foe fights with: awareness and noises, turns at a target, the ring and flanking, cover, the combat director, telegraphed blows and phases, and answers to blows |
| `crates/sailing` | [[Sailing]]: how a ship sails, her helm, her sails against the wind, her pose on the swell and where she grounds, one tick at a time |
| `crates/gear` | [[Gear]]: items, their rarity, nodes and costs, Prestige and level, Attack and Defense against a foe's level, Vestiges, weapons' elements and foes' shields, emblems, the [[Arts]] a player wears, and what a player holds and shows others |
| `crates/naval` | [[Naval Combat]]: guns laid and fired, balls in flight, the harm they do, her rigging shot away (`rigging.rs`), the events a fight sends (`fight_events.rs`), and a captain who fights, one tick at a time |
| `crates/protocol` | The [[Server]]'s messages: the schema, `messages.fbs`, the Rust `flatc` makes from it, and the server's side of reading and writing them. A door crate |
| `crates/room-wasm` | The room for its Cloudflare host: a door crate, bytes in and bytes out; a fleet ship's prediction and lay for a browser; and the foes' roster for the browser |
| `crates/room-wasm/src/waters_door.rs` | The waters and the friendly traffic for the browser: the water at a point, the held map's grid as bytes, the ships near a point ([[World Map]]) |
| `crates/room-wasm/src/snapshot_door.rs` | The room's snapshot after its tick, sent to each player as theirs: at sea what floats, a ship's kept hurts, what the sea tells and a boarded deck only to the player they are for ([[Server]]) |
| `crates/room-wasm/src/sea_door.rs` | The sea by weather for the browser: the swell under the weather at a point, its height over a grid round the view, and its fingerprint ([[Water]]) |
| `crates/room/src/sea_weather.rs` | The weather a room's fight is fought in, taken where and when it began, and the fight's waters made from the coasts ([[Sailing]]) |
| `crates/room` | The [[Server]]'s core: one shared space, its players' inputs in order, their bodies stepped tick by tick on its ground and judged against its section; the sea, its ships sailing their courses at DFO's paces or the world's own time; and a fleet, its ships sailed by their helms and fighting at true scale |
| `crates/room/src/battle.rs`, `flotsam.rs`, `harbour.rs`, `deck_fight.rs`, `sea_ports.rs`, `sea_decks.rs` | How the sea's fights end: a fight of many players and the ships that join it, what floats and who gathers it, the port cities ships wash up at and are repaired by, a struck captain's deck as a room on land, and the kept hurts ([[Naval Combat]], "How a fight ends") |
| `crates/room/src/sighting.rs`, `chart.rs` | The sea's hostile ships by its waters: who a roll sends, at which rank and level, how far she is sighted from and where she comes; and the chart they read, the coasts, the nine waters and the friendly lanes ([[Naval Combat]], "At sea") |
| `crates/city` | [[Cities]]: a city's plan from its site, the same on the server and in every browser: its footprint, ways in, districts and terraces, its cells filled with Daggerfall's RMB blocks, its wall and harbour, its landmark and its social space; a ruin's broken landmark, breaches, rubble and wrecks (`ruins`) |
| `crates/bake` | The bake (`npm run bake`): each node's section, window of the ground and boxes, cut at build time for its room ([[Server]]) |
| `crates/xtask` | The repository's own checks: `cargo xtask check` ([[Checks]]) |
| `generated/` | What the tools make, never in git ([[Generated Files Stay Out of Git]]): `generated/messages/`, the messages' code `flatc` makes, and `generated/nodes/`, the bake's file for each node and their index, which the server's rooms read |
| `content/` | Authored game data, read by the tools, the server and the client: `content/world/layout.json`, each landmass's edits in `content/world/land/`, `content/forge/renders.json`, which names the forge's published renders, `content/ships/ships.json`, which names each ship's published mesh and holds her waterline, guns and hit boxes, `content/testground/course.json`, the Test Ground's course, which the server's rooms stand on too, and `content/gear/`, the [[Gear]]'s traits, named items, islands' resources, rolled items' names and emblems, built into the gear rules (the page reads the emblems too), `content/arts/arts.json`, the [[Arts]]' spells and fragments with their numbers, built into the gear rules and read by the page, and `content/audio/`, the cues searched on Freesound and `sounds.json`, the published sounds the game plays and credits |
| `content/world/rmb/` | Daggerfall's RMB town blocks as data, for laying out towns: placements, ground tiles and flat counts ([[RMB Blocks]]) |
| `tools/claude-toolkit/` | The co-dev's Claude Code toolkit, kept as shipped ([[Toolkit]]) |
| `.claude/settings.json` | The repository's Claude Code settings: a hook that says, as a session starts, when the toolkit is not installed in its container ([[Toolkit]]) |
| `tools/forge/` | DFO's [[Sprite Forge]], kept as shipped in DFO's own layout ([[DFO's Sprite Forge Comes Over Exactly]]) |
| `tools/forge_publish.py` | Publishes the forge's renders and tables to R2, and pulls them back |
| `tools/r2.py` | R2 access for the publishers: objects named by their hash, uploaded once and checked when fetched |
| `tools/ships/shape_ship.py` | Shapes the owner's Sloop, her parts painted already: her size, and the gap and steps down from her quarterdeck ([[Sailing]]) |
| `tools/ships/paint_ship.py` | Sorts a ship's faces into her parts and lays their UVs in metres, for the procedural painter's pictures ([[Sailing]]) |
| `tools/ships/deck.py` | Measures a ship's deck from her published mesh, a grid of heights with walls where a body cannot walk, and the spot behind her wheel ([[Sailing]], "Her deck") |
| `tools/ships/export_ship.py` | Exports a ship's `.blend` to Overlook's mesh, with her waterline, guns, the boxes a ball can strike, her sails' corners and her deck, and publishes the model and mesh to R2 ([[Sailing]], [[Naval Combat]]) |
| `tools/ships/build_ship.py`, `ship_hull.py`, `ship_rig.py`, `ship_fittings.py`, `ship_details.py`, `ship_mesh.py` | Build a new hull's model in the Sloop's style from her numbers: her shell, rig, fittings, finer work and rigging, the Sloop's guns, and her companionway into the cabin ([[Hulls]]) |
| `tools/ships/build_cabin.py`, `cabin_props.py` | Build the one cabin every ship opens into, and furnish it along its walls and stern ([[Hulls]]) |
| `tools/ships/ship_pictures.ts` | Writes the pictures a ship's parts wear, from the procedural painter, for `paint_ship.py` to pack into her model |
| `tools/forge_dyes.mjs` | Reads Daggerfall's palette once into the forge's dye table |
| `tools/freesound/` | Finds candidate sounds on Freesound's public pages for the cues in `content/audio/freesound.json`, on GitHub's machines (the `freesound` workflow), and publishes the owner's picks to R2 with their credits ([[Sounds Come From Freesound, Judged on a Test Sheet]]) |
| `tools/install-flatc.sh`, `tools/schema.mjs` | Install the pinned `flatc`, and make the messages' code with it into `generated/` ([[Toolchain]]) |
| `bible/` | This vault |
| `.github/workflows/` | CI (`ci.yml`), which runs `cargo xtask check` and on `main` then calls `pages.yml` to publish the client to GitHub Pages, while that commit is still `main`'s head; actions are pinned by commit |

## The client's layers

Every folder directly under `client/src` is a layer, declared in `LAYERS` with what it may import, when its first
file arrives. Files directly in `client/src` may import any layer. They are also groundwork any layer may import,
such as `gpu.ts`, except the entry points `main.ts` and `editorPage.ts`. Client code never imports
Node's modules (tests may) and never uses WebGL. As the code arrives, the layers follow one direction:

- **The engine** (GPU, drawing, sound, input, assets) knows nothing of the game.
- **The interface** draws on the engine and reads game state; it does not change it.
- **The network** speaks to the server and knows nothing of drawing.
- **The entry point** wires them together. It wires; it does not implement ([[Small Files]]).

Declared so far: `rules`, `forge`, `textures`, `models` and `overworld` (each imports nothing), `network` and `water`
(each imports `rules`), `terrain` (imports `rules` and `water`), `nature` (imports `rules` and `water`), `ships`
(imports `rules`, the water's sun and samples, `textures` and `plus`), `editor` (imports `rules`, `water`, `terrain` and `ships`),
`combat` (imports `rules`, `network`, `plus`, `player` and the editor's camera), `player` (imports `rules`, `network`,
`forge`, `firstperson` and the editor's camera), `testground` (imports what `player` does, `player` itself, `combat`
and the editor's panel helpers), `firstperson` (imports `forge`), `city` (imports `models`, `textures`, `rules` and
`water`), `heldmap` (imports `forge`, `overworld`, `plus`, the first person's picture drawer and the editor's page
helpers),
`plus` (imports nothing) and `game` (imports the layers it wires, `combat` among them;
[[The Bars and the Fight Wear the Plus Kit]]). The code `flatc` makes, in `generated/`, is groundwork any layer may
import.

## The Rust crates

Crates appear when the work reaches them. Each is declared in the crates check's table, which says which other crates
and outside crates it may use (`CRATES`, [[Checks]]):

- **The rules**: what the world and its people may do. No graphics, network, files or clock, so the server and any
  predicting client compute the same bits ([[Agree to the Bit]]). They are `world`, which may use only `serde` and
  `serde_json`; `land`, which may use `world`, `serde` and `serde_json`; `movement`, which may use only `libm`;
  `sailing`, which may use `land` and `libm`; `naval`, which may use `sailing` and `libm`; `combat`, which may use
  `movement` and `libm`; `navmesh`, which may use `movement` and `libm`; `foes`, which may use `combat`, `movement`
  and `libm`; `reach`, which uses no other crate; `gear`, which may use `serde`, `serde_json` and `libm`; and `city`,
  which may use `land`, `world`, `serde`, `serde_json` and `libm`.
- **The server**, at multiplayer ([[Server-Authoritative Multiplayer]]): the authority. It depends on the rules and its
  own platform crates, never on the client. Its core is `room`, which may use `combat`, `foes`, `gear`, `land`,
  `movement`, `naval`, `navmesh`, `reach`, `sailing`, `world` and `libm`; its messages are `protocol`, which may use
  `combat`, `gear`, `movement`, `naval`, `room`, `sailing` and `flatbuffers`; and `room-wasm` puts them behind a WebAssembly door for
  the Cloudflare shell in `server/`, and for a browser playing alone or predicting its ship in a fleet, reading a
  node's baked file and the layout with `foes`, `gear`, `land`, `naval`, `sailing`, `world`, `serde` and `serde_json`.
- **Tools** run at build time, never in a room or a browser. `bake` may use `city`, `land`, `world`, `serde` and
  `serde_json`.
- **Door crates** hand memory across a boundary and are the only crates that may hold unsafe code. They are
  `world-wasm`, `land-wasm` and `movement-wasm`, which put the world rules, the land with its city (`city`) and a
  ship sailing and fighting over it, and movement on a window of the land behind WebAssembly doors for the browser;
  `room-wasm`, which puts the room behind one for its Cloudflare host; and `protocol`, whose code from `flatc` reads
  a message's bytes in place.
