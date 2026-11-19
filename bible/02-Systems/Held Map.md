---
type: system
status: live
code:
  - client/src/heldmap/heldMap.ts#HeldMap
  - client/src/heldmap/heldMapLaw.ts#stageOf
  - client/src/heldmap/heldMapLaw.ts#clampView
  - client/src/heldmap/heldMapView.ts#HeldMapView
  - client/src/heldmap/coastField.ts#coastField
  - client/src/game/discovered.ts#Discovered
  - client/src/overworld/discovery.ts#chartAround
  - client/src/overworld/discovery.ts#sightIslands
---
# Held Map

The map the player navigates the sea by, held in their own gauntlets at the ship's helm
([[The Sea Is Navigated From the Helm With the Held Map]], [[Pick - Held Map]]). It shows the whole world under fog of
war, and a click on it sets the ship's destination.

## How it works

- **Opening.** At sea, Map on the navigation panel, or N, takes the view down from the [[Overworld]]'s raised camera
  to the helm behind the Sloop's wheel on her quarterdeck in first person, over 1.1 s, the eye riding the swell with her.
  On the way down every ship shrinks from the Overworld's scale to her own, so at the wheel the Sloop is her true size
  ([[The Ship Is Managed and Walked From the Sea's Panel]]). There the
  painting rises from below the screen over 0.42 s, eased at both ends; it never fades. The ship sails on meanwhile.
- **The art** is the owner's, from their Blender pipeline, published with the [[Sprite Forge]]'s renders: the
  parchment (`@art/held-map-forge-sheet.png`, 1648 × 1086) and over it the gauntlets of the set worn
  (`@art/held-map-forge-hands-<Set>.png`; bare hands with none), a strip of 17 frames drawn six times over. The
  hands rest on frame 0 and every 6 s flex the fingers of each in turn, a frame each twelfth of a second. Where the
  painting stops short of the screen's foot, the cuffs are carried down to it. Both are drawn as the [[First Person]]'s
  pictures are, texel for texel.
- **The fit**, DFO's: the parchment takes 0.9 of the screen's width or 0.84 of its height, whichever fits, under a
  head of a tenth of the height (78 px at least) and over a foot of 0.06 (52 px at least); the painting's foot sits
  a little past the screen's, so the gauntlets run off it.
- **The ink** is drawn on the GPU a pixel at a time over the parchment, which is the land and the unknown. From the
  continents' outlines, once, a coast field over the world's 1,024 × 640 cells of 4.8 km (`coastField`, about a
  third of a second, behind the veil on first going to sea): each cell's exact distance to the nearest coast within 60 km, negative on land, and whose coast
  it is. A discovered island's coast is drawn as a pen does, a soft wash on the sea's side and then the line, with
  engraved lines following it out to sea and fading; the charted sea carries a faint wash, its edge soft.
- **Places.** Each discovered port is named at its city, and each discovered node at its middle, in the ink, as page
  elements over the parchment; the ship is a red-brown arrow along its heading. The voyage under way is inked as a
  dashed red-brown line.
- **The view**, DFO's: it opens centred on the ship, 1,600 km across. A drag pans; the wheel zooms about the cursor,
  from the whole world fitting the parchment to 6 px a kilometre; the world stays centred on an axis it does not
  fill. A press that moves more than 6 px is a pan, not a click.
- **Choosing.** A click picks the discovered place within 16 px of it, or else the point of the sea under it; a node
  is sailed for at its island's coast nearest it, a port at its city. The way there round the land is planned at once ([[Game]], "Sailing") and inked, and a card over the parchment offers Set
  sail (Enter), or says why no way leads there. Escape lets the choice go, then lowers the map.
- **The seas.** Beside Set sail the card offers the voyage's difficulty, Calm, Rough or Storm
  ([[Voyages Choose a Difficulty, Overlook Lives Like the Tower]]): the island's foes as they are, or two or three
  levels higher, paying half again or twice the XP, Aurem and Vestiges. The seas picked are the voyage's only once the
  player sets sail with them; letting the destination go lets them go too. The node landed at is joined at the
  voyage's seas ([[Server]], "The host").
- **Turning back.** Escape on the way down to the helm turns the view back before the map is raised.
- **Lowering.** Over 0.36 s, from wherever the painting is; then the view flies back up to the sea's, and a
  destination set, the ship sets sail for it as it does. The voyage can be stopped and resumed from the navigation
  panel.

## Fog of war

What the player has discovered is kept in this browser (`overlook-discovery`), every 30 s once it changes and as the
page is hidden or goes ([[World Map]]):

| What | Discovered |
|---|---|
| The sea | Charted within 40 km of the ship, a cell at a time |
| An island | Once its coast comes within 40 km of the ship; it is then seen whole |
| A port | Once the ship is within 60 km of its city, as its icon shows at sea |
| A node | Once it is marked over an island's side, or landed at |

The player starts with the island they arrive on, its port, the place they arrive at and the waters round its city.

## Limits

- Discovery is the browser's: another browser or a cleared one starts again, and the server keeps none of it.
- A route is planned on every continent's outline, so it keeps clear of an island the player has not found.
- The coast field is a cell's middle every 4.8 km, interpolated: a headland narrower than a few kilometres is drawn
  softened.
- The charted sea's wash is laid when the map is raised: what the ship charts while it is up shows the next time.
- The route is inked through at most 128 of its points.
- Quests are not tracked on the map yet.
- The waters are not tinted yet: each water's owner, name and level band, and the contested seam, are decided and
  not built ([[The Waters Come From the Islands]]).
