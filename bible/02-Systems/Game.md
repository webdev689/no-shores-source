---
type: system
status: live
code:
  - client/index.html
  - client/src/main.ts
  - client/src/game/game.ts#startGame
  - client/src/game/flow.ts#next
  - client/src/game/foot.ts#Foot
  - client/src/game/sea.ts#Sea
  - client/src/game/landmass.ts#openLandmass
  - client/src/game/landDrawers.ts#landDrawers
  - client/src/game/scene.ts#GameScene
  - client/src/shadow.ts#ShadowMap
  - client/src/game/figureView.ts#FigureView
  - client/src/game/hud.ts#Hud
  - client/src/game/hudLaw.ts#standingOf
  - client/src/game/nodes.ts#windowRect
  - client/src/game/seaLaw.ts#continentToOpen
  - client/src/game/meshes.ts#shipMesh
  - client/src/game/rooms.ts#roomsFrom
---
# Game

The game itself, at the site's root (`/` under `npm run dev`): the world played as the owner decided it after
Destiny 1 ([[Overlook Is a Shared World After Destiny 1]], [[Every Island Is Seen Whole and Reached by Nodes]]). The
player arrives in Overlook, plays on foot in one node at a time, returns to their ship, sails the [[Overworld]]'s sea,
views an island's side from above and lands at another node. Each way between them passes through a veil while the
place loads, as Destiny's orbit does.

## The flow

`flow.ts` holds where the player is: loading behind a veil, on foot in a node, at sea, or over an island's side
choosing a landing; on foot and at sea a menu may be open. It is pure: the page hands it what happened and draws what
it answers. `game.ts` wires the rest and keeps the flow; each mode is its own module.

| From | Happening | To |
|---|---|---|
| Arriving | The ground round the spawn is in | On foot in Overlook's social space |
| On foot | M, then Return to ship | The veil, "Returning to your ship", then at sea |
| At sea | L, or View landings, within reach of a coast | Over the island's side |
| Over the side | A mark clicked, then clicked again or Enter | The veil, "Landing at" the node, then on foot there |
| Over the side | Escape | At sea |

The veil lifts once the place is ready and the exact ground round the player has come, or after 20 s of wall time.
A way that fails stays on the veil, saying why, and Enter tries it again.

## Arriving

The page reads the world (`loadWorld`: the layout and every continent's edits file) and opens Saltmere, continent 1,
in the [[Land]]'s worker, kept, with the RMB index's blocks, so its city is settled on it as the bake settles it
([[Cities]]). Overlook's plan comes from that worker; its social space is the node `overlook-social`, the plaza beside
the Beacon. The player stands at its first spawn, 4 m inside the seaward parapet, facing out from the landmark and
looking 17° down over the parapet onto the city, the harbour and the sea.

With `?at=<node id>` in the address the player arrives at that node instead, on its continent (a city's social space
is `<city id>-social`): a way to look round the world. An id the world does not hold arrives at Overlook.

## On foot

`Foot` stands the player in one node, as the [[Player]] plays on the [[Test Ground]]: DFO's controls, first and
third person, the forge's figure and the first person's hands.

- **The ground.** The node's window of the land, over its ring's bounds and 100 m past them, and its city's boxes
  there, cut by the land's worker and handed to the movement door, the same ground to the bit as the node's room
  ([[Movement]], [[Server]]). The scene draws the exact ground round the player, sampled every 4 m.
- **The camera** is the player's, held 0.3 m over the ground, with the Test Ground's 50-degree view.
- **The world goes on.** The body is stepped every frame, with the pointer locked or not; while a menu is open,
  with nothing pressed. Click the view to look round with the mouse.

## The edge

Offline, the movement door judges the body against the node's section each tick, by the room's own rules
([[Reach]]). Past the edge the screen darkens and "Return to the area" counts down 10 s; back inside, it ends. At 0,
or 60 m past, the player dies: "You died", the pointer is freed, and Respawn is offered after 4 s (or Enter). The
player comes back at the section's spawn nearest where they fell. A dead body lies still while its standing ticks on.

## At sea

`Sea` is the [[Overworld]] in play. The first return puts the ship off Overlook's harbour: out from the city's middle
through its harbour to water 4 m deep, then 600 m on. Later returns find it where it was left.

- **The ship** is our own, built in code (`shipMesh`): a 30 m two-masted trader, its band and pennant in the owner's
  paint (the player's own deep blue), riding a little on the swell. The Overworld is not to scale, and ships are drawn
  2.5 times their size so one reads from the raised view.
- **The camera** is DFO's raised one over the ship (`stepCamera`): drag to orbit, the wheel to zoom, the arrow keys
  to turn. The ship first lies facing the island, and the view looks 30 degrees down, so the island stands in it.
- **Sailing.** A click on the sea or the land plans a route round the land (`planSeaRoute`): on the open landmass's
  2 km mask when both ends lie in its window, else on the whole frame's. The ship sails it at the pace dial's step,
  `[` and `]` or the bar's buttons, ×60 to start. A click on a mark sails for it. A route that cannot be planned
  says why.
- **Marks** stand over the island's nodes within 120 km of the ship, by kind, with their names and distances, and
  over its port at any distance. Each is held at the picture's edge when off it, its arrow pointing the way. Two
  marks within 30 px of each other show the nearer.
- **Other continents.** Once the ship is nearer another continent's coast than the open one's, within 60 km, that
  landmass opens in the worker, kept, and is drawn and charted in its place.

## Landings

Within 30 km of the open landmass's coast, L or View landings flies the view up over the island's side the ship lies
off (`sideNodes`, `frameSide`, `flyRig`), over 2.5 s; the ship heaves to. The side's nodes, its city's social space
among them, are marked by kind with names and distances from the ship. A click chooses one; a second click on it, or
Enter, lands there: the player stands at its first spawn, facing inland from the ship, or at a social space out from
its landmark over the city, as on arriving. Escape flies back down.

## Rooms

With `?room=` in the address the game plays online (`roomsFrom`): a whole address names a server
(`?room=ws://127.0.0.1:8787` under `npm run server`), any other value the deployed rooms.

- **On foot** the player joins the node's room, `node-<node id>`, and starts at the spawn the room stands them at,
  each joiner at the next of the node's spawns in turn. The room judges the edge. Each tick's controls go to
  it with the figure's look, the dress when it changed and a respawn when asked; the player is predicted on the same
  ground and corrected by each snapshot, held still while the room says they are dead. The warning, the count and
  death are the room's word. Every other player in the room is shown where the room last saw them, in their own dress.
  A room whose socket closes is lost: the heads-up display says so and the player plays on alone, nothing more sent.
- **At sea** the player joins the `sea` room, their ship put to sea where it lies; each voyage's course and pace go
  to it, and every other player's ship is drawn where the room moved it, each in a paint of its own.

## Drawing

`GameScene` draws the open landmass in rings round the eye, the exact ground round the player or the ship, every
drawer into the same pass, then the water's sky, haze and surface over all of it ([[Water]]). The game adds the
open landmass's drawers each frame (`landDrawers`). Its city is the city layer's `CityView` ([[Cities]]), drawn in
its continent's climate once the forged models' tables and the RMB blocks its plan names have come from the pages'
`world/` folder; the blocks are kept for every later city. Its nature is the nature layer's `NatureView`
([[Nature]]), grown round the eye from the exact ground round the player, off the city's pads and solids
(`cleared`). Ships and figures are drawn into the same pass; the first person's hands over the finished picture.
The land is tinted with its biome's woods past where its trees are drawn, so forests read from the sea.

**The sun's shadows.** Before the pass, what casts draws its depth along the sun into two maps (`shadow.ts`), 2048
texels a side each, every square ahead of the camera and snapped to its own texels so the edges hold still:

| Map | Its square | A texel | What casts into it |
|---|---|---|---|
| Near | 300 m across, centred 75 m ahead | 0.15 m | The city's solids and near models, the near plants and the figures |
| Far | 2.4 km across, centred 900 m ahead | 1.2 m | The city's solids, and each building's masses, or its hull past where the masses are drawn |

What casts is found by whether, seen along the sun, its box overlaps a square, those behind the camera and far below
the eye too, so the city under the plaza casts. The land, the city, the plants and the figures are then lit through
both, softened over eight taps: the near map's sharp shadows hold inside its square and give way to the far map's
toward its rim, and those fade out toward the far square's own, about 2 km ahead. So from the plaza the city below is
shadowed as far as its masses stand. From more than 400 m over the ground, at sea or over an island's side, no
shadows are drawn.

**The figures' shadows.** A figure's card casts turned square to the sun about its feet, its clear texels cut away,
the picture kept the way round the eye sees it; it is drawn into the near map only. The card the eye sees is lit
through the maps, each of its points asked of them from past that turned card, so a figure is darkened in another's
shadow or a wall's and never by its own. Its contact shade stays under its feet where its own shadow is drawn, and
past the near square leans the way the sun throws one, standing in for it.

At sea each ship's footprint is handed to the water, which keeps out of her hull and foams round her bow under way.
In death the world drains to grey, and comes back in colour on respawn or on leaving.

## Limits

- Until the city's tables and blocks have come, the land shows without its city.
- A voyage is the browser's word; the sea room refuses a course that touches a coast it judges exactly, and others
  then see the ship at rest.
- Only the open landmass is drawn; another continent appears once the ship is within 60 km of its coast.
- Offline, the edge is judged in the browser; online, the room judges it and the browser predicts nothing of it.
- A frame counts for at most 0.1 s, so below 10 frames a second the world runs slower than real time.
- A figure's shadow is its card as the eye sees it, turned to the sun: the outline of the side facing the eye, not
  of the side facing the sun.
- Past the far square, about 2 km ahead of the camera, nothing is shadowed; the plants cast into the near square
  only.
