---
type: system
status: live
code:
  - client/testground/index.html
  - client/src/testground/testgroundMain.ts
  - client/src/testground/sceneView.ts#SceneView
  - client/src/testground/figures.ts#viewOf
  - client/src/forge/compose.ts#composeFrame
  - client/src/forge/store.ts#ForgeStore
---
# Test Ground

An open stretch of ground for trying the [[Sprite Forge]]'s figures: dress one, set it moving and walk round it. It is
published with the site at `https://lattymoy.github.io/overlook-source/testground/`. Under `npm run dev`, open
`/testground/`.

## Using it

| Control | Does |
|---|---|
| Right-drag, middle-drag, wheel | Turns the view round its target, pans it and zooms it |
| Click the ground | Moves the chosen figure there; clicking a figure chooses it |
| `G` | Walks at eye height: `W` `A` `S` `D` or the arrows, 6 m/s or 40 with `Shift`; drag to look round |
| Add a figure, Remove the chosen | Places a figure at the view's target, or takes the chosen one away |
| Frames a second | How fast every move plays, 1 to 30; 6 at first |

For the chosen figure, the panel sets:

- its body and race, and its hair and the hair's colour;
- **Dress as**, one of the forge's dressed looks, which sets the gear and race;
- its move, with its frame count;
- its facing, and **Turn round**, which turns it once every 8 seconds;
- its gear, a list of every layer the body wears, with a filter;
- a tint for each dyeable layer it wears. Without one, the layer shows its own grey.

The ground is flat, with a line every metre, a stronger line every 10 m and the two axes through the start in gold.
It fades into the sky over the first 1.2 km.

## How it draws

The page reads `content/forge/renders.json` and fetches the forge's index and colour tables from R2. Each strip is
read from its pack by its byte range and decoded once.

A figure's frame is composed in the browser as DFO's game composes it (`composeFrame`):

- Each layer's cell is laid on the figure's cell by its root.
- At each pixel the nearest texel shows. Where two layers meet on one part of the body, the one with the higher order
  is drawn over the other: armour over cloth by its cover, a drape and a worn weapon by `under`.
- The bare body's skin takes the race's colours, the hair its colour, and a tinted layer's grey the tint.

The view shown follows the turn between the figure's facing and the eye, and the three side views past the back are
the other side's, mirrored. The frame stands upright on the figure's feet at 62 pixels a metre, turned to face the
eye, and the ground's depth hides what is below it.

## Limits

- A figure is drawn as one flat card, so two figures that overlap are ordered as whole cards, not pixel by pixel.
- Tints stand in for the forge's dyes, which name colours in Daggerfall's palette.
- Composed frames are kept on the GPU up to 4,000, then all are let go and composed again as needed.
