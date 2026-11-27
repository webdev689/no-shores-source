---
type: system
status: live
code:
  - client/editor/index.html
  - client/src/editorPage.ts
  - client/src/editor/editorMain.ts
  - client/src/editor/islePanel.ts#islePanel
  - client/src/editor/editorFrame.ts#EditorFrame
  - client/src/editor/panelKit.ts#editorRoot
  - client/src/editor/editorPanel.ts#continentsPanel
  - client/src/editor/landPanel.ts#landPanel
  - client/src/editor/markPass.ts#MarkPass
  - client/src/editor/strokes.ts#inkVertices
  - client/src/editor/viewMarks.ts#labelNode
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
  - client/src/editor/isleEditor.ts#startIsleEditor
  - client/src/editor/placeTools.ts#PlaceTools
  - client/src/editor/siteDrawing.ts#siteMarks
  - client/src/editor/siteDrawing.ts#siteInks
  - client/src/editor/layoutDrawing.ts#layoutMarks
  - client/src/editor/reliefTiles.ts#ReliefTiles
  - client/src/terrain/layoutMarks.ts#layoutMarksOf
  - client/src/editor/layoutCity.ts#LayoutCity
  - client/src/terrain/landTexts.ts#loadLandTexts
  - client/src/terrain/terrainView.ts#TerrainView
  - client/src/terrain/clipmap.ts#ringDraws
  - vite.config.ts#worldFiles
  - .github/workflows/ci.yml
  - .github/workflows/pages.yml
---
# World Editor

Where the owner paints the nine continents ([[The World Editor Paints in the Browser]]). It writes
`content/world/layout.json` ([[World Map]]) and checks every stroke with the same Rust rules the server keeps.

## Using it

Open `https://lattymoy.github.io/no-shores-source/editor/` in a browser with WebGPU, such as Chrome
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
Open… asks before it replaces painting not yet saved, and refuses a file that is not a layout. Coming back to the
editor, it offers to restore that painting; Cancel opens the saved layout instead. If the browser cannot keep it, the
status says so.

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
| Kind, Name | With Node: the next node's kind (social, patrol, mission, dungeon, boss or outpost) and name, blank for its id. Once drawn, or chosen in the list, the node is chosen and they change it |
| Spawn (`X`) | Click inside a node to add a spawn; `Backspace` takes the last spawn of the node under the cursor |
| City (`H`) | Click to move the port city's site there. Its Name and Motif (one of the nine) change it. A landmass's file names its city: the editor moves it, never adds or removes one |
| Port city and nodes | The landmass's city and nodes. A row shows that one whole in both views and chooses it for the City or Node tool |
| Undo, Redo (`Ctrl+Z`, `Ctrl+Y`) | Steps back or forward through the last 100 changes: strokes, and places added or removed. `Ctrl+Shift+Z` also redoes. With `Ctrl` or `Cmd` held, every other key is the browser's own, and so is `Alt` with a letter, a digit or a named key, so their shortcuts choose no tool; a sign typed with `AltGr`, or with a Mac's `Option`, still reaches the mode |
| Save | On the site, downloads `<landmass>.json`; under `npm run dev`, writes `content/world/land/<landmass>.json` |
| 2D map, 3D view, `V` | Switches between the shaded relief map and a 3D view of the landmass |
| Height | Multiplies heights in the 3D view, 1 to 10 times, so relief reads from afar. Within 3 km heights are true to scale; they ease to the chosen height by 30 km |
| Layouts (`L`) | Shows or hides the nodes' layouts over both views, with a legend of their colours |
| Walk (`G`) | Drops to a walker's eyes on the ground: `W` `A` `S` `D` or the arrow keys to move (6 m/s, 40 with `Shift` on land), drag to look round. In water the walker wades, then swims; `C` dives and `Space` rises ([[Water]]). `G` again, the 2D map or `V` stops. Brushes and place tools do nothing while walking |
| Sail (`B`) | Puts the owner's Sloop to sea at the camera's target, heading where the camera looks, and follows it ([[Sailing]]). `W` and `S` (or the up and down arrows) climb and come down the helm's ladder: oars astern, at rest, ahead, then sails set. `A` and `D` steer. Where the water is shallower than its draught it is refused, the panel says why and the camera stands back off. `B` again, Walk, another landmass, the 2D map or `V` brings it in |
| Fight (`F`, while sailing) | Calls a Grey Tithe captain onto the ring round the Sloop, or sends it off ([[Naval Combat]]). Hold the right mouse to aim (the camera stands past the ports on the side looked at, and where the look meets the water is the range); let go to fire, left click to hold fire, the wheel to change shot, `C` to brace, `Shift` to burst. The panel shows both ships, the guns, DFO's messages and the warning to brace |
| In a fleet (`?room=` in the address) | Sail joins a fleet room on the [[Server]] instead, from open water 15 m deep or more: `?room=<name>` the deployed rooms' `fleet-<name>`, a local server's address its `fleet-editor`. Every other player's Sloop and every captain is drawn; `F` calls a captain round it, four at most in the room, and `X` sends them all off; aiming, firing, the brace and the load are as alone, and `Shift` gives no burst |
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
reaches the sea's level on its painted line. Every pixel is sampled four times. Only what the view may see is drawn
(`ringDraws`): each ring's 96 x 96 quads lie in 32 sectors by their bearing from its middle, the quads every coarser
ring leaves to the finer one (47 x 47 of them) last, and a ring draws the sectors whose box, its quads' a quad further
back where a vertex slides onto the coarser grid, from the lowest ground read to the highest (30% of their span and
10 m more either way), reaches inside the view's planes. Rings drawing the same quads join in one instanced draw; a
frame takes from about a tenth to a half of the 829,440 vertices the whole rings would, as the view and the land's
heights allow. The 2D map reads the land along the
same splines and softens every edge across a pixel.

Closer than 8 km, the 3D view shows the exact ground the game uses round the camera's target: a 2 km square sampled
every 4 m, with river channels at their width and depth and water at its level, road beds, levelled towns, ports
and the coast. Its spline is held between the four samples round each point, so a city's pads (a terrace, a plaza)
stand level to their edges, with no ridge where the cubic would overshoot their step. It eases into the 1 km land
over its outer 96 m. It is sampled again once the target moves 400 m,
and after every stroke, place change, undo or redo; the land's worker samples it and works out the breakers over it,
so the page never waits.
Except while walking, a 1.8 m figure stands at the target with a scale bar beside it.

A stroke shows as it is drawn, the close-up stepping aside until it ends; the rivers and lakes follow when it ends.
Places are drawn on the 2D map and shown in both views; in 3D a place tool's click asks for the 2D map. The Problems
list gives every rule the landmass's edits break, its city's and nodes' among them. Every place change, a city's and a
node's too, is one undo step.

The port city and the nodes are drawn over both views as lines, not on the cells. The city is a marker with its name
and its wall, a dashed circle 3,456 m out. A node is its section's outline in its kind's colour (social gold, patrol
green, mission blue, dungeon purple, boss red, outpost teal) with its name; its spawns show as white dots once it is
40 pixels across, and under 10 pixels it shows as a dot. Names are laid city first, then the nodes largest on screen
first; a name that would cover another is left out. In 3D they lie on the land as it is drawn, and a line that passes
behind the camera is broken there.

The land is carved as the game stands on it. Each landmass opened for shaping is settled in its worker with the
same texts as the game's (the RMB blocks, the forged models' tables and the nodes' briefs), so its city and its
nodes' [[Layouts]] are planned and laid on it, and its ground is the game's to the bit. After every stroke, place
change, undo or redo the worker settles it again and plans the layouts again, off the page's thread: about 3.5 s
for continent 1 on a cloud session's machine (WebAssembly, measured under node), then 0.15 s to cut them down to
what the editor draws. Until then the views show
the layouts as they were.

Each layout is drawn over both views once its section is 40 pixels across: its areas as circles in their group's
colour (arrival, gate, settlement, works, haunt, wilds, arena) named "name · kind", a gate "Gate to" its instance;
its tracks and footpaths at their widths, never thinner than 2.5 and 1.5 pixels; its section dashed in white; and,
once it is 120 pixels across, its sites: the landing, gates, beacons and resources as dots, an event's ground and
where foes hold it as rings at their reach, with the resources', events' and foes' names once it is 600 pixels
across. Their names are laid after the city's and the nodes', none over another. In 3D a path stands at the heights
it was laid at and the rest on the ground as drawn, the exact ground where the close-up reaches; a point screens
off the view is left out, so no line runs out to it.

The 3D view also draws the layouts' buildings, props and solids (plinths, set pieces, great works, rock) with the
city layer, as the game draws them: the buildings walked into with their doorways open, near models dithering into
masses and hulls further out. Only the layouts within 4 km of the camera are drawn, gathered again once it has moved
1.5 km or the layouts were planned again (after a stroke, a place change, an undo or a redo). The page asks the land
worker for those layouts by name and parses only them, about 2 MB for the Saltgrass Downs and its two neighbours
against about 8 MB for all of continent 1's, and builds them once a frame before any pass is recorded. Buildings (`K`)
in the panel, shown in 3D, turns them off and on. The 2D map draws only the plans.

The 1 km land cannot show a canyon 30 m across, so the 2D map lays the exact ground over it round the layouts:
tiles of 128 steps a side, a step the power of two from 2 m to 16 m nearest a pixel, within 200 m of a layout's
section and in view, sampled by the worker nearest the middle of the view first, one at a time. Each is drawn
under its own hillshade, a face steeper than one in one in rock, its fresh water, roads, towns and ports marked,
fading into the 1 km land over 48 m at the tiles' edge. Up to 64 are kept until the land changes; a tile of the
land before a change is drawn until its fresh one comes. Further out than 16 m a pixel the map asks for none.

Each landmass's row says when it has unsaved shaping. This browser keeps each landmass's unsaved shaping, undo and
redo included, until it is saved, and offers to restore it the first time Land mode opens; Cancel forgets it. If the
browser cannot keep it, the status says so. To keep shaping done on the site, put the downloaded file in
`content/world/land/` through a pull request, or hand it to Claude.

## Islands mode

The Islands mode shows one of the sea's islands at a time, from a seed and a climate, built through the page's
`room.wasm` exactly as its room builds it and drawn with the sea round it ([[Island Drawing]]). Next seed steps the
seed; Next isle steps to the next ruin or quarry; Close up looks from about 40 m over its middle and From 3 km from
afar. The panel counts the triangles and draws. `?mode=islands&isleSeed=<seed>&isleClimate=<climate>&isleView=afar`
opens on an island, `?islePacks=<prefix>` reads the build's packs before they are published, and `&islePlants=game`
draws the land's plants as the game does (Flora's, offered by `editorPage.ts`) in place of their modules. Its panel is
drawn by the game as the other modes' are (`islePanel`), and its island is drawn into the room right of the panel on
the same device. A captain's fight in Land mode shows the game's own readout over the view ([[Interface]], "The sea
fight's readout").

## How it works

- **One canvas.** The page holds one canvas and its script, nothing more
  ([[The Interface Uses No HTML, Now or Later]]). Each frame draws the mode open into the room right of the
  panel, 300 of the interface's pixels wide, which the view's place on the page follows at any screen's ratio
  (`panelCss`): the coasts' map, or the land's 2D map or 3D view (the 3D view drawn aside at that room's size and copied
  in). Over it the marks (rulers, reference shapes, the scale bar, the city, the nodes, the layouts, a place being
  drawn, the 3D scale cues) are drawn by the GPU as lines, fills and dots, each line smoothed across a pixel and each
  shape painted once where its pieces overlap (`MarkPass`). Last the interface the game draws (`ui/`) lays the names
  over the view, the captains' plates in a fight, and the panel at the left, which scrolls under the wheel. A frame
  is drawn when something asks for one: an input, a change, the water moving in 3D. A lost GPU device stops the
  editor, the page saying so and asking for a reload (`stopWhenLost`).
- **The panel** keeps the editor's own look, a tool's and not one of the game's screens: dark slate presses with a
  hairline edge and rounded corners, lit blue when chosen; the slider, the lists to choose from and the name fields
  in a browser's dark grey. Tab and the arrows move the focus through it, and Enter or Space presses; a field takes
  what is typed and hands it over on Enter or as the focus leaves it, or at once when a press on the view takes it.
  Keys go to the view while a field is typed in never, and to the panel never while walking or sailing. Save, Open…
  and Download hand files to and from the browser through the page's own services (`ui/page.ts`), and the questions
  before a file replaces painting are the browser's own dialog.
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
- Closer than about 50 m a pixel the 2D map shows the 1 km land smoothed, not the ground a node stands on, except
  round the layouts, where it lays the exact ground; the 3D view's close-up shows that ground everywhere.
- The exact ground is slow to sample where it is carved: a tile takes about half a second to two seconds, and the
  3D view's 2 km close-up about 7 s in Node (3 s uncarved), so a node's carving fills in over a few seconds.
- The layouts' streets and yards are not painted on the editor's ground, and nothing grows there: the game's
  ground paint and nature are the game's.
- Building the layouts near the camera takes the page's thread about 0.25–0.6 s after each change (in Node, for the
  Saltgrass Downs and its neighbours), on top of the worker's replanning, so the view stalls that long once.
- All of a landmass's layouts are planned again after every change, not only those it touches.
- A paragraph breaks only at spaces, never after a hyphen, and a control's words that reach the panel's edge run on
  under the words before them, not back at the panel's left edge.
- The first draw uploads the whole grid, about 15 MB, to the GPU: instant on a graphics card, slow on a machine
  without one.
