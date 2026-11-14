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
  - vite.config.ts#worldLayoutFile
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
| Ruler (`R`) | Left-drag measures a straight distance in kilometres; `Esc` clears it |
| Compare (`C`) | Click pins a reference shape: the smallest continent (161,600 km²), the largest (940,000 km²), or Daggerfall's whole map (819 × 410 km) |
| Right- or middle-drag, wheel | Pans and zooms, from 50 m to 20 km a pixel |
| Save | On the site, downloads `layout.json`; under `npm run dev`, writes `content/world/layout.json` |
| Download, Open… | Saves or loads a layout file by hand |

To keep a layout painted on the site, put the downloaded file in `content/world/` through a pull request, or hand it
to Claude. To carry on painting later, Open… the downloaded file.

Each continent's row shows its area as painted and where it stands against the allowed range. The map carries a
kilometre grid, a scale bar and a readout of the cursor's position. The Problems list shows every rule a painted
continent breaks.

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
- **Continent ids** are kept as they are in the file; a new continent takes `continent-1` to `continent-9`. Climates
  and isles already in the file pass through untouched.

## Limits

- A continent must be one landmass: land in two pieces is held back with a problem until it is joined. Land that
  meets only at a diagonal counts as two pieces' worth of coast and is refused as touching itself.
- Isles are not placed in the editor yet.
- The first draw uploads the whole grid, about 15 MB, to the GPU: instant on a graphics card, slow on a machine
  without one.
