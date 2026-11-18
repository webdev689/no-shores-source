---
type: system
status: live
code:
  - client/index.html
  - client/src/main.ts
  - client/src/game/game.ts#startGame
  - client/src/game/flow.ts#next
  - client/src/game/foot.ts#Foot
  - client/src/game/footFight.ts#FootFight
  - client/src/game/fightMarks.ts#FightMarks
  - client/src/game/footGear.ts#useAt
  - client/src/game/footGear.ts#groundRings
  - client/src/game/plazaLife.ts#PlazaLife
  - client/src/player/foeFigures.ts#FoeFigures
  - client/src/player/fightMoves.ts#fightButtons
  - client/src/combat/hud.css
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
  - client/src/game/seaShips.ts#SeaShips
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
- **The fight.** Online, the player fights in the node's room as on the Test Ground ([[Combat]]), by the same
  shared pieces: `FootFight` holds the combat layer's `Fighting` over the room's link. Right button swings once the
  weapon is out (Z), left button or F guards, and V dodges; with a bow, a crossbow or a gun the right button aims
  and the left fires, onto the crosshair's point over the node's ground. The arms are what the figure's hands
  hold. The lock turns the body to its foe, the first person swings as the fight's rules begin each swing, and the
  figure shows what the fight holds it to. Each foe is drawn in its kind's dress (`FoeFigures`), gliding between
  snapshots. Struck figures flash, sparks fly where a guard meets a blow, shots leave tracers, and telegraphed blows
  are marked on the ground (`FightMarks`). The fight's display (`#fight-hud`, drawn by `combat/hud.css`, the Test
  Ground's sheet too) shows the player's health, stamina and poise, the locked foe's bars, the parry rings and the
  words over the fight. Offline, with no room, the player only walks.
- **A social space's people** (`PlazaLife`): its keepers stand behind their counters and its townsfolk walk the
  plaza, seeded by the plaza so they walk the same each visit, online or not.
- **On the ground** (`footGear`): a brass ring at each counter that deals with the player; at each resource node they
  may still gather, a sea-green ring under a beam 40 m tall, seen across the patrol, so a route can be planned through
  them; and at each Vestige lying for them, a ring and a beam in its rarity's colour, picked up by walking over it.
- **E** uses what is within reach, listed first among the keys: at a counter it opens the gear screen at its tab (the
  Reader and the vault at Inventory, the Quartermaster and the Armsmith at Vendors); within 2.5 m of a node it asks the
  room to gather it.

## The edge

Offline, the movement door judges the body against the node's section each tick, by the room's own rules
([[Reach]]). Past the edge the screen darkens and "Return to the area" counts down 10 s; back inside, it ends. At 0,
or 60 m past, the player dies: "You died", the pointer is freed, and Respawn is offered after 4 s (or Enter). The
player comes back at the section's spawn nearest where they fell. A dead body lies still while its standing ticks on.

## At sea

`Sea` is the [[Overworld]] in play. The first return puts the ship off Overlook's harbour: out from the city's middle
through its harbour to water 4 m deep, then 600 m on. Later returns find it where it was left.

- **The ship** is the owner's Sloop ([[Sailing]]), in her parts' pictures, riding a little on the swell, her sails
  set while she is under way and furled at rest, filled by the steady wind along the swell's bearing. The Overworld is
  not to scale: a ship is drawn 75 m long (four times the Sloop), so one reads from the raised view. Every other
  player's ship is the Sloop too. At the helm every ship is her true size ([[Held Map]]).
- **The camera** is DFO's raised one over the ship (`stepCamera`): drag to orbit, the wheel to zoom, the arrow keys
  to turn. The ship first lies facing the island, and the view looks 30 degrees down, so the island stands in it.
- **Sailing.** A click on the sea or the land plans a route round the land (`planSeaRoute`): on the open landmass's
  2 km mask when both ends lie in its window, else on the whole frame's. The ship sails it at the pace dial's step,
  `[` and `]` or the panel's buttons, ×60 to start. A click on the port's icon sails for it. A route that cannot be
  planned says why.
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
  each joiner at the next of the node's spawns in turn. The room judges the edge. Each tick's input goes to it from
  the fight: the controls and the fight's buttons, the figure's look, its arms, the dress when it changed, the
  gear's asks and a respawn when asked. The player's fighter is predicted by the combat rules from `room.wasm`,
  standing on the node's window of the land as the room stands it (`setGround`), and set by each snapshot; the body
  is held still while the room says they are dead past the edge. The warning, the count and death are the room's
  word, and so are the blows. Every other player in the room is shown where the room last saw them, in their own
  dress, and every foe the room stands. A room whose socket closes is lost: the heads-up display says so, the fight's
  display is put away, and the player walks on alone, nothing more sent.
  With accounts ([[Accounts]]; the deployed rooms use the deployed accounts, a local server `?accounts=`), the page
  makes the player a guest or keeps their session, and the node's room keeps their character. Their gear shows in
  the gear window ([[Interface]]), I for Character and O for Inventory, and its presses ride their inputs as asks.
- **At sea** the player joins the `sea` room, their ship put to sea where it lies; each voyage's course and pace go
  to it, and every other player's ship is drawn where the room moved it. Playing alone, the same sea room runs in the
  page, so its pirates and fights are the same law.

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
