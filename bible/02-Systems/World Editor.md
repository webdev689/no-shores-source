---
type: system
status: live
code:
  - client/editor/index.html
  - client/src/editor/editorMain.ts
  - client/src/editor/landMask.ts#LandMask
  - client/src/editor/traceCoast.ts#traceCoast
  - client/src/editor/measure.ts#references
  - client/src/rules/worldRules.ts#startWorldRules
  - crates/world-wasm/src/lib.rs#check_layout
  - client/src/editor/landEditor.ts#startLandEditor
  - client/src/editor/terrainView.ts#TerrainView
  - vite.config.ts#worldFiles
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
| Paint (`P`), Erase (`E`) | Left-drag paints or erases with the brush; the slider sets its radius, 5 to 250 km |
| Fill (`F`) | Click inside a closed coast to fill the sea there with the continent. Sea that reaches the open ocean, or is bigger than the largest continent, is refused |
| Ruler (`R`) | Left-drag measures a straight distance in kilometres; `Esc` clears it |
| Compare (`C`) | Click pins a reference shape: the smallest continent (161,600 km²), the largest (940,000 km²), or Daggerfall's whole map (819 × 410 km) |
| Right- or middle-drag, wheel | Pans and zooms, from 50 m to 20 km a pixel |
| Save | On the site, downloads `layout.json`; under `npm run dev`, writes `content/world/layout.json`. Asks first if a continent must be left out |
| Download, Open… | Saves or loads a layout file by hand |

To keep a layout painted on the site, put the downloaded file in `content/world/` through a pull request, or hand it
to Claude. To carry on painting later, Open… the downloaded file.

The browser also keeps the painting after every stroke, until it is saved. Coming back to the editor, it offers to
restore that painting; Cancel opens the saved layout instead. A private window may not keep it.

Each continent's row shows its area as painted and where it stands against the allowed range. The map carries a
kilometre grid, a scale bar and a readout of the cursor's position. The Problems list shows every rule a painted
continent breaks. A continent in pieces lists each stray piece with its size; clicking one shows it on the map.

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
| Remove (`0`) | Click a river, road, town or port to remove it |
| Undo, Redo (`Ctrl+Z`, `Ctrl+Y`) | Steps back or forward through the last 100 strokes |
| Save | On the site, downloads `<landmass>.json`; under `npm run dev`, writes `content/world/land/<landmass>.json` |
| 2D map, 3D view, `V` | Switches between the shaded relief map and a 3D view of the landmass |
| Height | Multiplies heights in the 3D view, 1 to 10 times, so relief reads from afar |
| In 2D: drag, wheel | Shapes with a brush (or pans with Look, or with the right button), and zooms |
| In 3D: left-drag, right-drag, middle-drag, wheel | Shapes with a brush (or orbits with Look), orbits, pans along the ground, and zooms |

The cursor's readout gives the ground's height under it, or the sea's depth, in either view. A stroke shows as it
is drawn; the rivers and lakes follow when it ends. Places are drawn on the 2D map and shown in both views. The Problems list gives every rule the landmass's edits
break. Each landmass's row says when it has unsaved shaping, which
this browser keeps until it is saved and offers to restore on the next visit. To keep shaping done on the site, put
the downloaded file in `content/world/land/` through a pull request, or hand it to Claude.

## How it works

- **The land** is a grid of square-kilometre cells over the frame, one byte each: sea, or the continent that holds
  it. A brush stroke never paints over another continent, so continents cannot overlap by accident.
- **The map** is drawn by WebGPU in one full-screen pass from a texture of that grid: sea, each continent's colour,
  coasts, the grid, the frame's edge and the brush. A stroke uploads only the cells it changed.
- **A coast** is traced around each continent's land, cell corner to cell corner, then simplified: the editor tries
  2, 1 and 0.5 km tolerances and keeps the coarsest whose outline the rules call simple. Lakes inside are not part of
  the coast; inland water comes from World 2.0.
- **The rules** are the world crate compiled to WebAssembly (`crates/world-wasm`), loaded as `world.wasm` beside the pages. After
  each stroke the editor drafts the layout and the rules check it. Saving writes the layout in the one written form
  the world crate gives it, so the repository's test passes on what the editor saves.
- **Continent ids** are kept as they are in the file. `continent-N` reopens on key `N` in its own colour; any other
  id takes a free slot, and a new continent takes its slot's `continent-N`. Climates and isles already in the file
  pass through untouched.
- **Untouched coasts stay exact.** On save, a continent not painted or erased since the file was opened keeps its
  outline as it was. Only changed continents are traced again, so saving never drifts a coast.

## Limits

- A continent must be one landmass. Land in more than one piece is held back, and Save leaves it out of the file,
  after asking, until the strays are joined or erased. Land that meets only at a diagonal counts as two pieces.
- Isles are not placed in the editor yet.
- The first draw uploads the whole grid, about 15 MB, to the GPU: instant on a graphics card, slow on a machine
  without one.
