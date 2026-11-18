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
  - client/src/game/groundTiles.ts#groundTiles
  - client/src/terrain/groundColour.ts#GROUND_COLOUR_WGSL
  - client/src/shadow.ts#ShadowMap
  - client/src/game/figureView.ts#FigureView
  - client/src/game/hud.ts#Hud
  - client/src/game/hudLaw.ts#standingOf
  - client/src/game/nodes.ts#windowRect
  - client/src/game/seaLaw.ts#continentToOpen
  - client/src/game/seaShips.ts#SeaShips
  - client/src/game/passage.ts#Passage
  - client/src/game/seaHelm.ts#clearAhead
  - client/src/game/seaClose.ts#CloseZoom
  - client/src/game/aboard.ts#Aboard
  - client/src/game/shipPanel.ts#shipPanelOf
  - client/src/game/hints.ts#seaHints
  - client/src/game/rooms.ts#roomsFrom
  - client/src/heldmap/heldMap.ts#HeldMap
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
| At sea | Enter, L or the offer to dock or go ashore, off a coast | Over the island's side |
| Over the side | A mark clicked, then clicked again or Enter | The veil, "Landing at" the node, then on foot there |
| Over the side | Escape | At sea |
| On foot | E in a gate's basin, or at an instance's way in | The veil, "Entering" the instance or "Returning to" the patrol area, then on foot at the other's way in or gate ([[Layouts]], "Gates") |

The veil lifts once the place is ready and the exact ground round the player has come, or after 20 s of wall time.
A way that fails stays on the veil, saying why, and Enter tries it again.

## Arriving

The page reads the world (`loadWorld`: the layout and every continent's edits file) and opens Saltmere, continent 1,
in the [[Land]]'s worker, kept, with the RMB index's blocks, so its city is settled on it as the bake settles it
([[Cities]]). Overlook's plan comes from that worker; its social space is the node `overlook-social`, the plaza beside
the Beacon. The player stands at its first spawn, 4 m inside the seaward parapet, facing out from the landmark and
looking 17° down over the parapet onto the city, the harbour and the sea.

With `?at=<node id>` in the address the player arrives at that node instead, on its continent (a city's social space
is `<city id>-social`): a way to look round the world. An id the world does not hold arrives at Overlook. With `&spawn=<east>,<south>[,<bearing in degrees>]` too, the player stands at that point instead of the node's
spawn, offline: a way to look at one place.

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

- **The ship** is the owner's Sloop ([[Sailing]]), in her parts' pictures. Like the World Editor's, she rides the
  swell the sea draws and heels into her turns ([[Sailing]], "Drawn at sea"). Her sails are set while she is under way
  and furled at rest, filled by the steady wind along the swell's bearing. The Overworld is not to scale: a ship is
  drawn 75 m long (four times the Sloop), so one reads from the raised view. Every other player's ship is the Sloop
  too. At the helm every ship is her true size ([[Held Map]]).
- **The camera** is DFO's raised one over the ship (`stepCamera`): drag to orbit, the wheel to zoom, the arrow keys
  to turn. The ship first lies facing the island, and the view looks 30 degrees down, so the island stands in it.
- **Close in** (`seaClose.ts`, [[The Sloop Is Sailed by Its Keys and Seen Close From Any View]]). Past the camera's
  lowest the wheel keeps coming in, a fifth of the way a notch. The eye comes down along the camera's own look to
  25 m from the point 4.5 m over her waterline that the World Editor looks at, while every ship eases to her true
  size. Out goes back from close first; going ashore, it eases out as the view flies off. Clicks and marks are taken
  on the picture as shown.
- **Sailing.** A click on the sea or the land plans a route round the land (`planSeaRoute`): on the open landmass's
  2 km mask when both ends lie in its window, else on the whole frame's. The ship sails it at the pace dial's step,
  `[` and `]` or the panel's buttons, ×60 to start. A click on the port's icon sails for it. A route that cannot be
  planned says why.
- **The helm's keys**, as in a fight (`passage.ts`, `seaHelm.ts`), in the sea's own view, close in or not:
  - A and D turn her at the helm's 10 degrees a second. Under way she takes a course straight on along her new
    heading; at rest she turns where she lies, and the room turns her too ([[Server]], "The sea").
  - W sets her sailing straight on. That course reaches up to 20 km, stops 500 m short of the first coast that way, and
    is set again once under 5 km of it is left. Where a coast stops it short, or less than 200 m lies clear, she comes
    to rest facing the coast, and the voyage's line says "Land lies ahead."
  - S heaves her to, as Stop does.
  - Straight on, the voyage's line says "Sailing straight on"; resumed, she sails on straight along her heading.
- **The navigation panel** ([[The Sea Is Navigated From the Helm With the Held Map]]), a window of the [[Interface]]
  at the foot of the screen in three groups, Navigation, Pace and Ship, holds Map (N), which takes the
  view down to the helm and raises the [[Held Map]], where a destination is set; Stop while under way and Resume
  voyage once stopped short (both Space); the pace dial; and Manage (B) and Leave the helm (H)
  ([[The Ship Is Managed and Walked From the Sea's Panel]]). A stopped voyage keeps its destination: resuming
  plans the way there again from wherever the ship lies, after going ashore and coming back too.
- **Manage** pans the view down over 1.4 s to the Sloop at her true size, from her starboard quarter 39 m off,
  looking 0.5 radians down at her middle; a drag turns it round her, the wheel brings it from 18 m to 78 m. The player
  stands at her wheel, three stand-in hands go about her deck, and a panel of the [[Interface]] shows her: her hull
  and canvas whole (the naval rules' build, read through the room's own module), her guns a side and their loads,
  her length, beam and draught; her heading, pace and voyage; and Cargo and Crew, marked Later. B, or the panel's
  Back to the sea, pans back up.
- **Leave the helm** pans the view down to the player behind her wheel, walking her deck as on foot (the same
  controls, first or third person), the sea room the authority on every step ([[Server]], "The sea"). Under way her
  helmsman stands at the wheel and she sails on; at rest the player simply leaves it. At her wheel the offer Take the
  helm (E) takes it again, and once the room agrees the view pans back up. A fight that begins calls the player
  straight back to the helm.
- **Her hands.** Stand-ins until crew management comes: a human, a felid and a human in plain dress, each walking
  between spots on her deck at 1.3 m/s and standing at each 2 to 7 s, on a leg the deck leaves clear and away from
  her wheel; seeded, so they walk the same however the frames fall.
- **Seen from any view** ([[The Sloop Is Sailed by Its Keys and Seen Close From Any View]]). Her hands always go
  about her deck. The player stands at her wheel, but at the helm, where the eye is theirs. Off the helm the player
  walks her deck, with her helmsman at the wheel under way. In a fight they all stand on her as the fight lies her.
  Each figure stands where her deck lies on the swell, drawn as large as she is.
- **No nodes are marked at sea.** Only a port has an icon, over its harbour, with its name and distance, once the
  ship is within 60 km of it; it is held at the picture's edge when off it, its arrow pointing the way.
- **Pirates** sail the sea round the ship from the sea room ([[Naval Combat]], "At sea"), at her voyage's pace. As one
  comes near the voyage eases down, held to ×1 within 700 m of her, and the voyage's line says so; the page sails its
  ship at the pace the room sailed her at, drawn to where the room has her. A bold one that comes within 750 m meets
  her: the ship heaves to, her voyage kept, and the view pans down to the fight at true scale, then back up when it
  ends.
- **Other continents.** Once the ship is nearer another continent's coast than the open one's, within 60 km, that
  landmass opens in the worker, kept, and is drawn and charted in its place.

## Landings

Within 30 km of the open landmass's coast the ship is offered a landfall (`landfallOf`): within 20 km of its port's
harbour, to dock there ("Dock at Overlook"); anywhere else, to go ashore. Either one, by Enter, L or the offer's own
button, flies the view up over the island's side the ship lies off (`sideNodes`, `frameSide`, `flyRig`), over 2.5 s;
the ship heaves to, its voyage kept to be resumed. The side's nodes are marked by kind with names and distances from
the ship; docking keeps the city's social space among them. A click chooses one; a second click on it, or
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
- **At sea** the player joins the `sea` room, their ship put to sea where it lies, turned as she lies; each voyage's
  course and pace go to it, and every other player's ship is drawn where the room moved it. The room's word on her
  is taken 60 ticks after her course is sent, a round trip's allowance of a second: until then the page sails her at
  the pace the room last held her to, then draws her to where the room has her. Where the room has her at rest short
  of her voyage's end, a course it would not take, the page heaves her to there. Leaving the helm while a course
  waits its turn sends the course first, then the leave, so the room takes the course from the helm. A sea room
  whose link is lost calls the player to the helm, and they sail on alone, the voyage's line saying so. Playing
  alone, the same sea room runs in the page, so its pirates and fights are the same law.

## Drawing

`GameScene` draws the open landmass in rings round the eye, the exact ground round the player or the ship, every
drawer into the same pass, then the water's sky, haze and surface over all of it ([[Water]]). The game adds the
open landmass's drawers each frame (`landDrawers`). Its city is the city layer's `CityView` ([[Cities]]), drawn in
its continent's climate once the forged models' tables and the RMB blocks its plan names have come from the pages'
`world/` folder; the blocks are kept for every later city. Its nodes' layouts within 4 km of the eye are drawn by another `CityView` ([[Layouts]], "In the browser"), and each drawn
node's section and spawns are its layout's. Its nature is the nature layer's `NatureView`
([[Nature]]), grown round the eye from the exact ground round the player, off the city's pads and solids
(`cleared`). Ships and figures are drawn into the same pass; the first person's hands over the finished picture.
The land is tinted with its biome's woods past where its trees are drawn, so forests read from the sea.

**The ground's pictures.** The land wears its climate's ground tiles ([[Procedural Textures]], `groundTiles`), painted
off the page's thread by the city's painter: the terrain set's grass on the low ground, its dirt on the highlands and
roads, its stone on bare rock, its winter grass under snow and the desert's sand on beaches. Each class keeps its
biome's colour and takes its tile's grain over it (`groundColour.ts`), a tile to 6.4 m as Daggerfall laid them, read
again 34 m wide and turned so its repeats do not line up, and cast from three sides on cliffs so a face is not
smeared. One class gives way to the next by their grains' heights (each grain's light, as the tiles are painted lit
from above): stones show through the grass first as a slope steepens, bare rock standing a little proud of it, and
snow settles in the hollows before it covers the rises. The grain fades into the class's colour with distance as the tile's levels average away. Until a tile is
painted, and in the World Editor, the class is its plain colour. The layouts' paths and streets are painted on it
too ([[Layouts]], "In the browser"), in the dirt's and the town paving's grain.

**The middle ground.** Between the exact ground round the player (2 km, every 4 m) and the 1 km land, the scene keeps
the ground sampled every 16 m over 8 km round the player (`keepMiddle`), sampled again once the player moves 1.5 km,
so a patrol area's canyons, cliffs and mesas stand under its great works and rock as far off as they are drawn. It is
eased in from 150 to 400 m inland of the painted coast, so at the shore the land keeps to the 1 km land the water is
drawn from. Arriving waits for it as for the exact ground.

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
Under way the player's ship stirs the water's ripples at her bow and quarters, as the World Editor's does, and the
ripples follow her.
In death the world drains to grey, and comes back in colour on respawn or on leaving.

## Limits

- Until the city's tables and blocks have come, the land shows without its city.
- A voyage is the browser's word; the sea room refuses a course that touches a coast it judges exactly, and the ship
  then rests short of it, the page drawing her where the room has her.
- Only the open landmass is drawn; another continent appears once the ship is within 60 km of its coast.
- Offline, the edge is judged in the browser; online, the room judges it and the browser predicts nothing of it.
- A frame counts for at most 0.1 s, so below 10 frames a second the world runs slower than real time.
- A figure's shadow is its card as the eye sees it, turned to the sun: the outline of the side facing the eye, not
  of the side facing the sun.
- Past the far square, about 2 km ahead of the camera, nothing is shadowed; the plants cast into the near square
  only.
