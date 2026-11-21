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
| `client/src/editorPage.ts` | The [[World Editor]]'s entry point: offers the editor a fleet room, through the combat layer, when its address carries `?room=`, and the game's drawing of the captains' plates, then starts it |
| `client/src/game/` | The game layer: the [[Game]]'s flow from arriving to landing, on foot in a node, at sea in the [[Overworld]], the scene every drawer draws into, and the heads-up display |
| `client/src/game/audio/music/` | The [[Music]]: the FM voice bank, the song player, the score format with its layer roles, the scores (the sea's six songs and the three boss scores), and the director that plays them as danger nears, with what it hears of the game on foot and at sea |
| `client/src/game/audio/ambience/ambience.ts`, `player.ts`, `graph.ts` | The [[Ambience]] the game calls each frame on foot and at sea, one place sounding, and its nodes: rooms, beds' emitters and calls' chains |
| `client/src/game/audio/ambience/scapes.ts`, `law.ts`, `places.ts` | The eleven ambiences as data, and the pure laws: place to ambience, the time of day, breathing and gusts, call gaps, crossfades, and where each call stands |
| `client/src/game/audio/ambience/dsp.ts`, `beds.ts`, `calls.ts`, `songs.ts`, `noises.ts`, `sounds.ts` | The ambience's synthesiser: its kit, its seamless beds, its beasts' and birds' calls and the world's noises, and the jobs that name them |
| `client/src/game/audio/ambience/ambienceWorker.ts`, `bank.ts` | The worker that makes the ambience's beds and calls off the page's thread, and the page's side that asks it and keeps their buffers |
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
| `client/src/sky/` | The sky layer, which imports nothing: the world's clock set right by the rooms, the [[Sky]] and [[Weather]] read from the sky crate through its own WebAssembly, and what the scene draws by them |
| `client/src/water/` | The water layer: the [[Water]]'s surface, breakers, ripples and underwater view, drawn over any land a layer hands it, and a walker's wading, swimming and diving |
| `client/src/combat/` | The browser's side of [[Combat]]: the fight's controller in a room (the player's fighter predicted, foes and shots kept), the fight's display as nodes of the interface the game draws, the ground's marks for telegraphed blows and shots, the shots' tracers, the drops lying for the player ([[Gear]], "Drops"), and [[Blood]]; the [[Arts]]' casting keys, ability bar and every spell's view; and a Sloop's session in a fleet room ([[Naval Combat]]), her orders sent and her ship predicted |
| `client/src/nature/` | The nature layer: each biome's trees, plants and rocks, made in code, scattered over the ground round the eye and drawn on WebGPU ([[Nature]]). Imports `rules` and `water` |
| `client/src/ships/` | The ships layer: a ship's mesh read from R2 and drawn at her pose on the water ([[Sailing]]), and a fight's balls and effects drawn as small spheres ([[Naval Combat]]) |
| `client/src/network/` | The network layer: the browser's side of the [[Server]]: its messages, made from the same schema, the connection to a room or a room in the page, and the prediction it corrects |
| `client/src/rules/` | The rules layer: the Rust rules, the [[Land]] (with its door's sailing and naval fights), [[Movement]] and [[Combat]]'s player tick, loaded as WebAssembly, for any page that needs them, and a fighter's numbers read |
| `client/src/heldmap/` | The held map: the parchment raised at the helm, the world inked on it under fog of war, panned, zoomed and clicked for a destination ([[Held Map]]) |
| `client/src/overworld/` | The overworld layer: the [[Overworld]]'s camera, pick, sea routes, voyages, marks and bird's-eye view of an island's side, pure, with no page or drawing |
| `client/src/textures/` | The textures layer: the [[Procedural Textures]], every picture the forged world wears and the ground's sets, painted in code |
| `client/src/models/`, `content/forged/` | The models layer, which imports nothing: the [[Forged Models]], DFO's town buildings, props and room kit built from the three measured tables in `content/forged/` |
| `client/src/plus/` | The [[Interface]]'s Enhanced Plus kit, which imports nothing: carved stone and brass, each surface painted by the role it plays |
| `client/src/ui/` | The ui layer, which imports `plus`: the [[Interface]] as the GPU draws it, from the face's cells, the kit's frames and bevels, and one instanced draw a frame |
| `client/src/layout/` | The layouts in the browser: drawn with the city layer near the eye, the nodes' laid sections, and the ways through gates ([[Layouts]]) |
| `client/src/speech/` | The speech layer, which imports `plus`: the voice made in the browser for every line, the dialogue box, barks over heads and emotes ([[Speech]]) |
| `client/src/cinema/` | The cinema layer, which imports `water` and `combat`: the camera on rails, the screen's fades and bars, the weather pass, birds, fire and smoke, and the storm's sounds ([[Cinema]]) |
| `client/src/game/prologue/` | The [[Prologue]]: the tap to start, the intro and title, character creation and the story mission's beats, run by its director |
| `client/src/game/npc/` | The keepers' screen every counter of a social space opens, and Shape's: the keeper drawn in their dress with their words and band, the rows of wares each keeper sells, a faction's rows (`factionRows.ts`), the stock's clock ([[Interface]], [[Factions]]) |
| `client/src/game/appearance/` | The Appearance screen the Character page's button opens: the figure and horse on display, and the emblems, dyes, coats and bardings to wear ([[Interface]], [[Gear]]) |
| `client/src/game/welcome/` | Elder Maren Hale's welcome after the story: her walk round the plaza's counters and what she and the keepers say at each ([[Prologue]]) |
| `client/src/city/` | The city layer: a port city's plan drawn on WebGPU with the forged models and the procedural textures, whole near the eye, as masses and hulls further out, its solids and ground plates at every distance ([[Cities]]) |
| `server/` | The [[Server]]'s Cloudflare shell ([[The Server's Shell Is in server]]): the Worker and its Durable Object, which keep each room in WebAssembly, Cloudflare's settings (`wrangler.jsonc`) and the shell's TypeScript settings, and the keeper that keeps each player's character with the accounts while they play |
| `server/accounts/` | The [[Accounts]]' own Worker over D1: guests, usernames and passwords, Discord sign-in, sessions, the judge of the [[Names]] players set for others to read, the Roster (friends, companies, guilds, blocks, reports, where each player is), the characters the rooms hold, and the database's migrations |
| `crates/` | Every Rust crate, one folder each, named after its crate |
| `crates/world` | The world's structure: the layout of continents and isles, its rules and exact geometry ([[World Map]]) |
| `crates/world-wasm` | The world rules for the browser: a door crate, text in and text out |
| `crates/land` | The [[Land]]: relief, erosion and water from the painted coasts, the owner's edits and places, and the ground anywhere to the metre |
| `crates/land-wasm` | The land for the browser: a door crate, heights handed over as bytes |
| `crates/movement` | [[Movement]]: how a body walks, runs, jumps, climbs, hangs, mantles and vaults, one tick at a time |
| `crates/movement-wasm` | Movement for the browser: a door crate, a body stepped one tick at a time |
| `crates/layout` | The [[Layouts]] of patrol areas and instances: areas, paths, carved land, RMB villages, set pieces, great works, walk-in rooms, sites and sections |
| `crates/reach` | [[Reach]]: a node's section of the land, the warning past its edge, death beyond it and the respawn |
| `crates/navmesh` | The [[Navmesh]]: where a foe can walk, baked from a course's blocks over open ground or any terrain, the links where the movement rules climb a block's side or drop off its edge, the paths across both, and the firing spots shooters fight from |
| `crates/combat` | [[Combat]]: how fighters swing, guard, parry and dodge, their stamina and poise, the soft lock, foes' telegraphed blows, shots in flight, and the statuses a fighter is given |
| `crates/foes` | [[Enemies]] and [[Foes]]: factions, roles, the roster and ranks, and the brain each foe fights with: awareness and noises, turns at a target, the ring and flanking, cover, the combat director, telegraphed blows and phases, and answers to blows |
| `crates/sky` | The world's clock, its sun, moon and stars, and its weather: one field over the whole map from world time and place, with its wind, lightning and the ground's wetness ([[Sky]], [[Weather]]) |
| `crates/sailing` | [[Sailing]]: how a ship sails, her helm, her sails against the wind, her pose on the swell and where she grounds, one tick at a time |
| `crates/gear` | [[Gear]]: items, their rarity, nodes and costs, Prestige and level, Attack and Defense against a foe's level, Vestiges, weapons' elements and foes' shields, emblems and cosmetics, the [[Arts]] a player wears and their levels, the [[Factions]] they pledge to, Shape and his Shapes, and what a player holds and shows others |
| `crates/naval` | [[Naval Combat]]: guns laid and fired, balls in flight, the harm they do, and a captain who fights, one tick at a time |
| `crates/protocol` | The [[Server]]'s messages: the schema, `messages.fbs`, the Rust `flatc` makes from it, and the server's side of reading and writing them. A door crate |
| `crates/room-wasm` | The room for its Cloudflare host: a door crate, bytes in and bytes out; a fleet ship's prediction and lay for a browser; and the foes' roster for the browser |
| `crates/room` | The [[Server]]'s core: one shared space, its players' inputs in order, their bodies stepped tick by tick on its ground and judged against its section, its foes thinking and stepping by the same rules, and a node's garrison, its groups walking their beats ([[Enemies]]); the sea, its ships sailing their courses; and a fleet, its ships sailed by their helms and fighting at true scale |
| `crates/city` | [[Cities]]: a port city's plan from its site, the same on the server and in every browser: its footprint, ways in, districts and terraces, its cells filled with Daggerfall's RMB blocks, its wall and harbour, its landmark and its social space |
| `crates/bake` | The bake (`npm run bake`): each node's section, window of the ground and boxes, cut at build time for its room ([[Server]]) |
| `crates/xtask` | The repository's own checks: `cargo xtask check` ([[Checks]]) |
| `generated/` | What the tools make, never in git ([[Generated Files Stay Out of Git]]): `generated/messages/`, the messages' code `flatc` makes, and `generated/nodes/`, the bake's file for each node and their index, which the server's rooms read |
| `content/` | Authored game data, read by the tools, the server and the client: `content/world/layout.json`, each landmass's edits in `content/world/land/`, `content/world/open.json`, the patrol areas and missions open to players ([[World Map]]), `content/forge/renders.json`, which names the forge's published renders, `content/ships/ships.json`, which names each ship's published mesh and holds her waterline, guns and hit boxes, `content/testground/course.json`, the Test Ground's course, which the server's rooms stand on too, and `content/gear/`, the [[Gear]]'s traits, named items, islands' resources, rolled items' names, emblems, cosmetics and factions, built into the gear rules (the page reads the emblems, cosmetics and factions too), `content/arts/arts.json`, the [[Arts]]' spells and fragments with their numbers and the Arts' levels (`levels`: the bars, the rises' prices, power and lasting), built into the gear rules and read by the page, `content/world/social.json`, which social spaces open and the townsfolk's lanes, read by the city crate and the page, and `content/audio/`, the cues searched on Freesound and `sounds.json`, the published sounds the game plays and credits, and `content/story/`, the cast's voices and each mission's scenes, held to [[Dialogue]] by the dialogue check |
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
| `tools/freesound/` | Finds candidate sounds on Freesound's public pages for the cues in `content/audio/freesound.json`, on GitHub's machines (the `freesound` workflow), and publishes the owner's picks to R2 with their credits ([[Sounds Come From Freesound, Judged on a Test Sheet]]): the workflow runs on each push that changes the cue list, `tools/freesound/` or itself, cuts long picks in a step that holds no key, then puts the picks on R2 with the repository's Cloudflare token, keeping the game's `sounds.json` in its download for a commit to take in |
| `tools/install-flatc.sh`, `tools/schema.mjs` | Install the pinned `flatc`, and make the messages' code with it into `generated/` ([[Toolchain]]) |
| `bible/` | This vault |
| `.github/workflows/` | CI (`ci.yml`), which runs `cargo xtask check` and on `main` then calls `rooms.yml` to deploy the rooms when their code changed and then `pages.yml` to publish the client to GitHub Pages once the rooms deployed or had nothing to, while that commit is still `main`'s head; actions are pinned by commit |

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
(imports `rules`, the water's sun and samples, and `plus`), `editor` (imports `rules`, `water`, `terrain`, `ships`, `city`,
`layout` and `ui`, which draws its panel and the names over its views),
`combat` (imports `rules`, `network`, `plus`, `player`, the editor's camera and `ui`, whose nodes its display builds), `player` (imports `rules`, `network`,
`forge`, `firstperson` and the editor's camera), `testground` (imports what `player` does, `player` itself, `combat`,
the editor's panel helpers and `ui`, which draws the fight's display there), `firstperson` (imports `forge`), `city` (imports `models`, `textures`, `rules` and
`water`), `heldmap` (imports `forge`, `overworld`, `plus`, the first person's picture drawer and the editor's page
helpers),
`plus` (imports nothing), `ui` and `speech` (each imports `plus`), `cinema` (imports `water` and `combat`) and `game` (imports the layers it wires, `combat`, `cinema` and `speech` among them;
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
