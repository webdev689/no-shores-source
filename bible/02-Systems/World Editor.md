---
type: system
status: live
code:
  - client/editor/index.html
  - client/src/editorPage.ts
  - client/src/editor/editorMain.ts
  - client/src/editor/fleetLink.ts#offerFleet
  - client/src/editor/fleetDock.ts#FleetDock
  - client/src/editor/fleetScene.ts#FleetScene
  - client/src/combat/fleetBerth.ts#FleetBerth
  - client/src/editor/landMask.ts#LandMask
  - client/src/editor/traceCoast.ts#traceCoast
  - client/src/editor/measure.ts#references
  - client/src/rules/worldRules.ts#startWorldRules
  - crates/world-wasm/src/lib.rs#check_layout
  - client/src/editor/landEditor.ts#startLandEditor
  - client/src/editor/placeTools.ts#PlaceTools
  - client/src/editor/siteDrawing.ts#siteMarks
  - client/src/terrain/terrainView.ts#TerrainView
  - vite.config.ts#worldFiles
  - .github/workflows/ci.yml
  - .github/workflows/pages.yml
---
# World Editor

Where the owner paints the nine continents ([[The World Editor Paints in the Browser]]). It writes
`content/world/layout.json` ([[World Map]]) and checks every stroke with the same Rust rules the server keeps.

## Using it

Open `https://lattymoy.github.io/overlook-source/editor/` in a browser with WebGPU, such as Chrome
([[The World Editor Is on GitHub Pages]]). It opens the layout on `main`. To work on the editor itself, run
`npm run dev` and open `/editor/`. The map shows the whole frame; the panel on the left holds the tools.

| Control | Does |
|---|---|
| `1` to `9`, or a continent's row | Chooses the continent to paint |
| Paint (`P`), Erase (`E`) | Left-drag paints the chosen continent with the brush, or erases any continent's land under it; the slider sets its radius, 5 to 250 km |
| Fill (`F`) | Click inside a closed coast to fill the sea there with the continent. Sea that reaches the open ocean, or is bigger than the largest continent, is refused |
| Ruler (`R`) | Left-drag measures a straight distance in kilometres; `Esc` clears it |
| Compare (`C`) | Click pins a reference shape: the smallest continent (161,600 km²), the largest (940,000 km²), or Daggerfall's whole map (819 × 410 km) |
| Right- or middle-drag, wheel | Pans and zooms, from 50 m to 20 km a pixel |
| Save | On the site, downloads `layout.json`; under `npm run dev`, writes `content/world/layout.json`. Asks first if a continent must be left out |
| Download, Open… | Saves or loads a layout file by hand |

To keep a layout painted on the site, put the downloaded file in `content/world/` through a pull request, or hand it
to Claude. To carry on painting later, Open… the downloaded file.

The browser also keeps the painting after every stroke and fill, until a saved or downloaded file holds all of it.
Open… asks before it replaces painting not yet saved, and refuses a file that is not a layout. Coming back to the editor, it offers to restore that painting; Cancel opens the saved layout instead. If the
browser cannot keep it, the status says so.

Each continent's row shows its area as painted and where it stands against the allowed range. The map carries a
kilometre grid, a scale bar and a readout of the cursor's position. The Problems list shows every rule a painted
continent breaks. A continent in pieces lists its five largest strays with their sizes and counts the rest;
clicking one shows it on the map.

## Land mode

The Land button switches from painting coasts to the [[Land]] the generator makes from them. Every continent in
the layout as drafted generates in the background, the chosen one first; each row shows how far along it is.

| Control | Does |
|---|---|
| A landmass's row | Shows that landmass and opens it for shaping |
| Look (`1`), Raise (`2`), Lower (`3`), Smooth (`4`), Flatten (`5`) | Look only, or shape the ground with a brush |
| Radius, `[` and `]` | The brush's radius, 1 to 200 km |
| Strength | Metres a dab for Raise and Lower; the share of the way a dab goes for Smooth (to the neighbours' mean) and Flatten (to the height where the stroke started) |
| River (`6`), Road (`7`), Town (`8`) | Click point by point; double-click or `Enter` to finish, `Backspace` to take back a point, `Esc` to cancel. A road's points snap to ports, other roads and town edges |
| Width, Depth | A new river's or road's width, and a new river's depth |
| Port (`9`) | Click on the land by the coast |
| Remove (`0`) | Click a river, road, town, port, node or spawn to remove it: a spawn within reach first, then the nearest line or port within reach, then the smallest area under the click, a node before a town |
| Node (`N`) | Click round a node's section point by point; double-click or `Enter` closes it, `Backspace` takes back a point, `Esc` cancels. It is named `node-N` and takes a spawn at its middle |
| Kind, Name | With Node: the next node's kind (social, patrol, mission, dungeon or boss) and name, blank for its id. Once drawn, or chosen in the list, the node is chosen and they change it |
| Spawn (`X`) | Click inside a node to add a spawn; `Backspace` takes the last spawn of the node under the cursor |
| City (`H`) | Click to move the port city's site there. Its Name and Motif (one of the nine) change it. A landmass's file names its city: the editor moves it, never adds or removes one |
| Port city and nodes | The landmass's city and nodes. A row shows that one whole in both views and chooses it for the City or Node tool |
| Undo, Redo (`Ctrl+Z`, `Ctrl+Y`) | Steps back or forward through the last 100 changes: strokes, and places added or removed. `Ctrl+Shift+Z` also redoes |
| Save | On the site, downloads `<landmass>.json`; under `npm run dev`, writes `content/world/land/<landmass>.json` |
| 2D map, 3D view, `V` | Switches between the shaded relief map and a 3D view of the landmass |
| Height | Multiplies heights in the 3D view, 1 to 10 times, so relief reads from afar. Within 3 km heights are true to scale; they ease to the chosen height by 30 km |
| Walk (`G`) | Drops to a walker's eyes on the ground: `W` `A` `S` `D` or the arrow keys to move (6 m/s, 40 with `Shift` on land), drag to look round. In water the walker wades, then swims; `C` dives and `Space` rises ([[Water]]). `G` again, the 2D map or `V` stops. Brushes and place tools do nothing while walking |
| Sail (`B`) | Puts the owner's Sloop to sea at the camera's target, heading where the camera looks, and follows her ([[Sailing]]). `W` and `S` (or the up and down arrows) climb and come down the helm's ladder: oars astern, at rest, ahead, then sails set. `A` and `D` steer; on her oars, `Shift` with `A` or `D` rows her sideways. Where the water is shallower than her draught she is refused, the panel says why and the camera stands back off. `B` again, Walk, another landmass, the 2D map or `V` brings her in |
| Fight (`F`, while sailing) | Calls a pirate captain onto the ring round the Sloop, or sends her off ([[Naval Combat]]). Hold the right mouse to aim (the camera stands past the ports on the side looked at, and where the look meets the water is the range); let go to fire, left click to hold fire, the wheel to change shot, `C` to brace. The panel shows both ships, the guns, DFO's messages and the warning to brace |
| In a fleet (`?room=` in the address) | Sail joins a fleet room on the [[Server]] instead, from open water 15 m deep or more: `?room=<name>` the deployed rooms' `fleet-<name>`, a local server's address its `fleet-editor`. Every other player's Sloop and every captain is drawn; `F` calls a captain round her, four at most in the room, and `X` sends them all off; aiming, firing, the brace and the load are as alone |
| In 2D: drag, wheel | Shapes with a brush (or pans with Look, or with the right button), and zooms, 1 m to 20 km a pixel |
| In 3D: left-drag, right-drag, middle-drag, wheel | Left-drag shapes with a brush (or orbits with Look); right-drag orbits (or pans with Look); middle-drag pans along the ground; the wheel zooms, 3 m to 5,000 km from the target |

The cursor's readout gives where it points and the height of the 1 km cell there, or the sea's depth, in either
view. Walking, it gives where the walker stands and the ground's height there, exact inside the close-up, or how deep
the water is when they wade, swim or dive.

The 3D view draws the [[Water]] over the land, under a sky with clouds, and so draws every frame while it shows.

The 3D view draws the land as rings of mesh round the camera, each twice as coarse as the one inside it, from a
quarter metre a step near a walker. They are snapped to the world, so the land never slides as the camera moves, and
each ring's edge eases onto the next ring's grid. Every ring's vertices lie on one lattice, so a vertex two rings
share is the same point to the bit and they meet without a crack. Each pixel reads the ground under it along the
same Catmull-Rom splines the land crate uses, for its light, its colour and the water's edge; the mesh only places
it. Near water the mesh lies a little under the ground, so a coarse triangle never hides the water, and the coast
reaches the sea's level on its painted line. Every pixel is sampled four times. The 2D map reads the land along the
same splines and softens every edge across a pixel.

Closer than 8 km, the 3D view shows the exact ground the game uses round the camera's target: a 2 km square sampled
every 4 m, with river channels at their width and depth and water at its level, road beds, levelled towns, ports
and the coast. Its spline is held between the four samples round each point, so a city's pads (a terrace, a plaza)
stand level to their edges, with no ridge where the cubic would overshoot their step. It eases into the 1 km land
over its outer 96 m. It is sampled again once the target moves 400 m,
and after every stroke, place change, undo or redo; the land's worker samples it and works out the breakers over it,
so the page never waits.
Except while walking, a 1.8 m figure stands at the target with a scale bar beside it.

A stroke shows as it is drawn, the close-up stepping aside until it ends; the rivers and lakes follow when it ends. Places are drawn on the 2D map and shown in
both views; in 3D a place tool's click asks for the 2D map. The Problems list gives every rule the landmass's edits
break, its city's and nodes' among them. Every place change, a city's and a node's too, is one undo step.

The port city and the nodes are drawn over both views as lines, not on the cells. The city is a marker with its name
and its wall, a dashed circle 3,456 m out. A node is its section's outline in its kind's colour (social gold, patrol
green, mission blue, dungeon purple, boss red) with its name; its spawns show as white dots once it is 40 pixels
across, and under 10 pixels it shows as a dot. Names are laid city first, then the nodes largest on screen first;
a name that would cover another is left out. In 3D they lie on the land as it is drawn, and a line that passes
behind the camera is broken there.

Each landmass's row says when it has unsaved shaping. This browser keeps each landmass's unsaved shaping, undo and
redo included, until it is saved, and offers to restore it the first time Land mode opens; Cancel forgets it. If the
browser cannot keep it, the status says so. To keep shaping done on the site, put the downloaded file in
`content/world/land/` through a pull request, or hand it to Claude.

## How it works

- **The land** is a grid of square-kilometre cells over the frame, one byte each: sea, or the continent that holds
  it. A brush stroke never paints over another continent, so continents cannot overlap by accident.
- **The map** is drawn by WebGPU in one full-screen pass from a texture of that grid: sea, each continent's colour,
  coasts, the grid, the frame's edge and the brush. A stroke uploads only the cells it changed.
- **A coast** is traced around each continent's land, cell corner to cell corner, then simplified: the editor tries
  2, 1 and 0.5 km tolerances, then the unsimplified coast, and keeps the first whose outline the rules call simple.
  Lakes inside are not part of the coast; inland water comes from World 2.0.
- **The rules** are the world crate compiled to WebAssembly (`crates/world-wasm`), loaded as `world.wasm` beside the
  pages. After each stroke the editor drafts the layout and the rules check it. Saving writes the layout in the one
  written form the world crate gives it, so the repository's test passes on what the editor saves.
- **Continent ids** are kept as they are in the file. `continent-N` reopens on key `N` in its own colour; any other
  id takes a free slot, and a new continent takes its slot's `continent-N`. Climates and isles already in the file
  pass through untouched.
- **Untouched coasts stay exact.** On save, a continent not painted or erased since the file was opened keeps its
  outline as it was. Only changed continents are traced again, so saving never drifts a coast.

## Limits

- A continent must be one landmass. Land in more than one piece is held back, and Save leaves it out of the file,
  after asking, until the strays are joined or erased. Land that meets only at a diagonal counts as two pieces.
- Isles are not placed in the editor yet.
- A node's points cannot be moved once it is closed: to reshape one, remove it and draw it again.
- Closer than about 50 m a pixel the 2D map shows the 1 km land smoothed, not the ground a node stands on; the 3D
  view's close-up shows that ground.
- The first draw uploads the whole grid, about 15 MB, to the GPU: instant on a graphics card, slow on a machine
  without one.
