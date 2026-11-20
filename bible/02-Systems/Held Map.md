---
type: system
status: live
code:
  - client/src/heldmap/heldMap.ts#HeldMap
  - client/src/heldmap/heldMapLaw.ts#stageOf
  - client/src/heldmap/heldMapLaw.ts#clampView
  - client/src/heldmap/heldMapView.ts#HeldMapView
  - client/src/heldmap/coastField.ts#coastField
  - client/src/heldmap/watersWash.ts#washOf
  - client/src/heldmap/watersWash.ts#labelPoints
  - client/src/heldmap/heldMapWaters.ts#HeldMapWaters
  - client/src/heldmap/heldMapWaters.ts#ruinedPlaces
  - client/src/heldmap/mapLetters.ts#paintLettering
  - client/src/heldmap/mapLayout.ts#layOut
  - client/src/heldmap/mapLayout.ts#handsCover
  - client/src/heldmap/mapKey.ts#keyPlace
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
- **The waters** ([[The Waters Come From the Islands]]). The page opens the waters once, just after its first frame
  (about 0.6 s in WebAssembly, `FriendlyTraffic`), and takes their grid at the coast field's own 4.8 km cell
  ([[World Map]], "Waters"). Under the ink, on the charted sea only, lies a faint wash in each water's holder's colour,
  at 0.26: Home green `#3f7f6f`, the Grey Tithe slate blue `#8596cc`, the pirates red `#d95c5c`, Contested amber
  `#b8862f`. Over the parchment each pair of washes stands at least 10 apart in CIEDE2000, and none darkens it by more
  than 6 in lightness.
  Each cell blends the charted sea within a cell of it (`washOf`), and the map samples between cells, so a border is
  soft over a cell or two and never stepped. The contested waters and the seam are hatched over their wash with fine
  diagonal lines in a dark amber (`#6b4a12` at 0.3), 7 screen pixels apart, which darken it by about 2 in lightness. Fog of war is as it was: the wash is laid for the sea charted when
  the map is raised.
- **The waters' names.** Each water is lettered with its name and level band ("The Fen Deeps, 22-26") at its label
  point, the name and a ring round it inked in the band's colour on the difficulty ramp
  ([[The Held Map Colours Each Water's Name by Its Difficulty]]): green `#256327` at level 1, gold `#6a5507` at 8,
  orange `#894314` at 15, red `#a3241f` at 22 and deep purple `#5a1f6e` at 30, blended between and read at the band's
  middle (`difficultyColour`). The ring is filled with the parchment's own colour, and every level's colour reads at
  least 4.5 : 1 against it. Its label point is the middle of its sea cell farthest from land, from other waters and from the frame's edge
  (`labelPoints`, chamfer distances in cells), once any of its sea is charted, held inside the map's edges.
- **The key** is one framed panel, a double rule of ink round a fill of the parchment's colour: "Held by" over the four
  holders' swatches and words in two columns, then "Levels" and the difficulty ramp from "1" to "30". It stands in a
  corner of the map whose box covers no discovered land (the coast field asked every 4 px across it), no name, no mark
  and no hand: the corner it stands in while that stays clear, else the first clear one, lower left, lower right, upper
  left, upper right. With every corner taken it is laid in one row in the middle of the parchment's margin under the
  map, where the row fits; where it does not, it takes the first corner clear of land, the hands, the marks and the
  ports' names, and the other names under it are dropped. So it moves only when it must, and never back and forth while
  the map stands still (`keyPlace`). On the real world, every island discovered, it stands in a corner in 64% of views
  at five zooms on three screens, where the earlier panel at the same size did in 51%.
- **Places.** Each discovered port is named at its city, and each discovered node at its middle. A city that is not
  a port (the waters' table names the three, [[Three Port Cities Remain, and the Others Are Desolate and Destroyed]])
  is drawn with a ruin's glyph, a dashed diamond, and named "Ruins of <name>" (`ruinedPlaces`); until the waters are
  open every city is drawn as a port. The ship is a red-brown arrow along its heading, ringed in the parchment. The
  voyage under way is inked as a dashed red-brown line.
- **Lettering.** Every name, mark, the ship's arrow and the key is part of the parchment: painted, whenever they
  change, onto a picture of the parchment (`paintLettering`), which the ink's pass lays down over the ink, before the
  gauntlets are drawn. So the hands cover them as they cover the parchment. Only the card that offers Set sail stands
  over the picture as a page element. How it reads:
  - *Sizes.* In the page's face, every word at least 13 px at a 1280 × 720 screen, a port's name 15 px; every size,
    mark and line grows with the map on a larger screen (`letterScale`: the map's height over its height at
    1280 × 720, never below 1), so at 1920 × 1080 the words are 20 px and 23 px.
  - *Hierarchy.* Ports strongest: the larger size, the darkest ink and a filled ring. Waters' names in their rings in
    their difficulty's colour. Ruins (a dashed diamond) and nodes (a ring) in a lighter brown, `#5c4631`. The place
    chosen is named in the route's red-brown. Every word is haloed in the parchment's colour, 3 px, so it reads at
    least 4.5 : 1 over the coasts' lines and the washes.
  - *Alignment.* A place's name stands right of its mark, its middle on the mark's, 5 px from it; where the right is
    taken or off the map, the same on the left. A water's name is centred on her label point.
  - *The clear region.* The thumbs of every set of gauntlets reach over the parchment in any frame of their fidget, as
    measured from the forge's strips (274 × 181 texels a frame): the left over the painting's shares 0-0.29 across and
    0.45-0.56 down, the right over 0.71-1 across and 0.46-0.57 down (`HANDS_COVER`). No name and not the key stands
    there; the ship's arrow and the places' marks stand where they lie.
  - *Priority.* The ship's arrow and every place's mark are laid first and never dropped. Then the names, the place
    chosen first, then ports, waters, ruins and nodes, each where it covers no mark, no hand and no name laid before
    it, inside the map. A water's name tries her point, then a line and two above and below, each held inside the map
    and, where it would lie under a hand, moved inward clear of it. A name with no clear place is dropped: a place's
    keeps its mark.
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
- The waters' wash is laid when the map is raised, as the charted sea's is. A water's label point is a 4.8 km cell's
  middle, so its words may stand over a small isle.
- A place's mark under a gauntlet's thumb stays there, under it; only its name keeps clear.
- On a phone's screen the key often finds no clear corner and no room on the margin, and is left off.
