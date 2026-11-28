---
type: system
status: live
code:
  - client/src/heldmap/heldMap.ts#HeldMap
  - client/src/heldmap/heldMapKept.ts#layoutKey
  - client/src/heldmap/mapLayout.ts#shipRoomLost
  - client/src/heldmap/seaLettering.ts#SeaLettering
  - client/src/heldmap/routeTiles.ts#routeTiles
  - client/src/heldmap/heldMapAsk.ts#MapAsk
  - client/src/heldmap/heldMapAsk.ts#litCells
  - client/src/heldmap/heldMapAsk.ts#WaterJudge
  - client/src/game/helmMap.ts#HelmMap
  - client/src/heldmap/heldMapLaw.ts#stageOf
  - client/src/heldmap/heldMapLaw.ts#clampView
  - client/src/heldmap/heldMapView.ts#HeldMapView
  - client/src/heldmap/coastField.ts#coastField
  - client/src/heldmap/watersWash.ts#washOf
  - client/src/heldmap/watersWash.ts#labelPoints
  - client/src/heldmap/heldMapWaters.ts#HeldMapWaters
  - client/src/heldmap/heldMapWaters.ts#ruinedPlaces
  - client/src/heldmap/mapLetters.ts#paintIsle
  - client/src/heldmap/heldMapWaters.ts#onOwnSea
  - client/src/heldmap/mapKey.ts#keyEdges
  - client/src/heldmap/watersWash.ts#washedOver
  - client/src/heldmap/mapLetters.ts#paintLettering
  - client/src/heldmap/mapLayout.ts#layOut
  - client/src/heldmap/mapLayout.ts#handsCover
  - client/src/heldmap/mapKey.ts#keyPlace
  - client/src/game/worldShown.ts#worldShown
  - client/src/game/worldShown.ts#offCoast
  - client/src/overworld/seaRoute.ts#COURSE_POINTS
  - client/src/game/landMap.ts#landSheetOf
  - client/src/heldmap/landSheet.ts#relief
  - client/src/heldmap/landLetters.ts#paintLand
  - client/src/heldmap/landGlyphs.ts#paintGlyph
  - client/src/heldmap/landTable.ts#tablePlace
---
# Held Map

The map the player navigates the sea by, held in their own gauntlets at the ship's helm
([[The Sea Is Navigated From the Helm With the Held Map]], [[Pick - Held Map]]). It shows the whole world from the first
time it is raised, with no fog of war
([[Other Ships Wear Their Players' Marks, the Sea Map Has No Fog, and New Players Ride a Bay That Bursts]]),
and a click on it sets the ship's destination. On land it is raised anywhere, and shows the land the player stands
on ([[The Held Map Comes to the Social Spaces and Every Land Area]]).

## How it works

- **Opening.** At sea, Plan a voyage on the ship's console in the Oversea view, or M, takes the view down from the [[Overworld]]'s raised camera
  to the helm behind the Sloop's wheel on its quarterdeck in first person, over 1.1 s, the eye riding the swell with it.
  On the way down every ship shrinks from the Overworld's scale to its own, so at the wheel the Sloop is its true size
  ([[The Ship Is Managed and Walked From the Sea's Panel]]). There the
  painting rises from below the screen over 0.42 s, eased at both ends; it never fades. The ship sails on meanwhile.
  As it rises the page tells the sea room (a course message's ask 4), which ticks the opening's sailing lesson's step
  for it ([[Quests]], "The lessons").
- **The art** is the owner's, from their Blender pipeline, published with the [[Sprite Forge]]'s renders: the
  parchment (`@art/held-map-forge-sheet.png`, 1648 × 1086) and over it the gauntlets of the set worn
  (`@art/held-map-forge-hands-<Set>.png`; bare hands with none), a strip of 17 frames drawn six times over. The
  hands rest on frame 0 and every 6 s flex the fingers of each in turn, a frame each twelfth of a second. Where the
  painting stops short of the screen's foot, the cuffs are carried down to it. Both are drawn as the [[First Person]]'s
  pictures are, texel for texel.
- **The fit**, DFO's: the parchment takes 0.9 of the screen's width or 0.84 of its height, whichever fits, under a
  head of a tenth of the height (78 px at least) and over a foot of 0.06 (52 px at least); the painting's foot sits
  a little past the screen's, so the gauntlets run off it.
- **The ink** is drawn on the GPU a pixel at a time over the parchment, which is the land. From the
  continents' outlines, once, a coast field over the world's 1,024 × 640 cells of 4.8 km (`coastField`, about a
  third of a second, behind the veil on first going to sea): each cell's exact distance to the nearest coast within 60 km, negative on land, and whose coast
  it is. Every island's coast is drawn as a pen does, a soft wash on the sea's side and then the line, with
  engraved lines following it out to sea and fading; the sea carries a faint wash, its edge soft.
- **The waters** ([[The Waters Come From the Islands]]). The game opens the waters once, just after its first frame
  (about 0.6 s in WebAssembly, `pageWaters.ts`), and takes their grid at the coast field's own 4.8 km cell
  ([[World Map]], "Waters"). Under the ink, on the sea, lies a faint wash in each water's holder's colour,
  at 0.26: Home green `#3f7f6f`, the Grey Tithe slate `#6b7785` (its ships' slate), the Lattice its crystal's red
  lit a third again `#de3d49` (`CRYSTAL.red`). None darkens the parchment by more than 6 in lightness; two washes closer than 10 apart in
  CIEDE2000 are told apart by their hatching.
  The Lantern Sea past its home waters' reach, 10 km from Overlook's coast by the coast field, is washed and hatched as
  the Grey Tithe's, so a home band a cell or two wide lies along the coast.
  Each cell blends the sea within a cell of it (`washOf`), and the map samples between cells, so a border is
  soft over a cell or two and never stepped. The Lattice's waters are hatched over their wash with fine level lines in
  a dark crystal red (`#60141c` at 0.3), the Grey Tithe's with level lines in a dark slate (`#4a5563` at 0.3), each 7
  device pixels apart (`HATCHES`). The wash is laid once, as the waters open.
- **The seas' names** ([[The Held Map's Seas Are Lettered Across Them, Ports Are Anchors and Other Seas Locked]]).
  Each sea's name (no level band) is arched across its sea along a circle whose middle stands below it, each letter
  turned to the arc and spread apart, in the ink thinned to two fifths and with no halo, so it sinks into the sea
  (`paintArched`, `archOf`). A sea is named while any of it is in view. Its name is tried first at its label point,
  the middle of its sea cell farthest from land, from other waters and from the frame's edge (`labelPoints`, chamfer
  distances in cells), then at every point of a grid 10 px apart over the map that lies on its sea, nearest the middle
  of its sea in view first (`HeldMapWaters.letters`); spread wide (9 units between letters at 18 px), then closer
  (4, then none), then at a plain word's 13 px (`SEA_FITS`).
- **The islands' names.** An island the owner has named (Saltmere, `ISLANDS`) is lettered at its outline's middle
  with its water's level band after it, "Saltmere, 1-4", the name in the ink and the band in its colour on the
  difficulty ramp: green `#256327` at level 1, gold `#6a5507` at 8, orange `#894314` at 15, red `#a3241f` at 22 and
  deep purple `#5a1f6e` at 30, blended between and read at the band's middle (`difficultyColour`); every level's
  colour reads at least 4.5 : 1 against the parchment it is haloed in. It is laid before the seas' names.
- **Locked seas.** Every other island's sea, and its land, is darkened toward the ink by up to 0.42, softly at its
  edge (`shutCells` on the waters' grid, the land by its outline and its coast's island), and a padlock stands out at
  its label point, while it stands whole inside the map: the lock in the ink on a disc of the parchment ringed in the
  ink (`paintLock`). A lock is never dropped for a name, and names keep clear of it. A locked sea is not sailed or
  travelled into: a course whose end lies in one is refused ("That sea is locked."), and the route planner keeps a
  4.8 km cell clear of every one (`SeaLock`, `lockedOut`; [[Locked Seas Are Not Sailed or Travelled Into, Their Ports Locked With Them]]).
- **The legend** (the sea's key, the land's table) hides and shows again with its key (`legend`, L, heard while any
  map is up, at the helm too, where the map takes every key; the strip says "L Legend"), as a player asked ([[M Is the Map, N the Leave, and the Players' First Asks Are Built]]).
  Hidden, it is not painted, nothing keeps clear of it, and it stays hidden for the next map in this browser
  (`MapLegend`).
- **The key** is one framed panel, a double rule of ink round a fill of the parchment's colour: "Held by" over the three
  holders' swatches (Home, Grey Tithe, The Lattice) and words in two columns, then "Levels" and the difficulty ramp from "1" to "30". Each swatch is
  its wash as the map shows it, over the map's parchment (`washedOver`), with the Tithe's and the Lattice's
  hatching. It stands in a
  corner of the map whose box covers no land (the coast field asked every 4 px across it), no name, no mark
  and no hand: the corner it stands in while that stays clear, else the first clear one, lower left, lower right, upper
  left, upper right. With none clear it takes, of the place it stood, the corners and the places along the map's four
  edges half its size apart (`keyEdges`), one clear of the hands, the marks and the ports' and the chosen place's
  names, round which the other names laid again lose least: a water's name lost counts ten, land under the key five,
  any other name lost one. So it moves only when it must, and never back and forth while the map stands still
  (`keyPlace`). It is never laid on the
  parchment's margin, where the game's hints stand under the map.
- **Places.** Every port is an anchor at its city, inked over a halo of the parchment; no node is marked, but for a
  red-brown ring round one the quest names. A city that is not a port (the waters' table names the three,
  [[Three Port Cities Remain, and the Others Are Desolate and Destroyed]]) is a faded anchor, in the lighter ink thinned,
  named "Ruins of <name>" (`ruinedPlaces`); until the waters are open every city is drawn as a port. A place's name
  shows only as the pointer comes within 16 px of its mark, on the card a region's name shows on, over the region's. The ship is a red-brown arrow along its heading, ringed in the parchment. The
  voyage under way is inked as a dashed red-brown line. Islands found, and every one standing in the water the ship
  lies in (`setIsles`, `isleMarksOf`), are marked in the lighter ink under the words: a cove a small ring, an isle a
  wider ring with a tower in it (`paintIsle`, [[Island Drawing]]).
- **Other ships** ([[Walk-in Windows Are Seen Through and Larger, Public Events Show on the Map, and So Does Every Player]]).
  Every other player's ship in the sea's room, however far off, is a dot as on land (below), in their nameplate's
  square's colour, over the words and under the ship's arrow (`chartMarksOf`, `dotInks`). Every hostile ship in the
  water the ship lies in, sailing or still in a player's fight, is a hull under a sail in the Grey Tithe's dark slate `#4a5563`, edged in the parchment, beside
  them (`paintHostile`; [[Hostile Ships and Islands Show on the Sea Map, Travel Goes Anywhere at Sea, and Home Waters End 10 km Out]]). The room sends the sea's chart, and with it each
  player's hostile ships and standing islands in their water (`chart_marks`), about once a second ([[Server]]); the
  map shows the last. A hostile ship's mark is drawn only whole on the map, never across its edge.
- **Lettering.** Every name, mark, the ship's arrow and the key is part of the parchment: painted, whenever they
  change, onto a picture of the parchment (`paintLettering`), which the ink's pass lays down over the ink, before the
  gauntlets are drawn. So the hands cover them as they cover the parchment. Only the card that offers Set sail stands
  over the picture, a node of the game's interface. They are laid out again only when something the layout reads has
  changed (`layoutKey`: the map's view, the ink and the hands' place, the face's loading, the waters set, the places
  and islands shown, the place chosen, whether the legend shows), or when the ship's arrow, painted where it is each
  frame, would cover a name or the key (`shipRoomLost`): so the names stand still while the ship sails on under them.
  A still frame lays out nothing, and while only the arrow moves, only the pixels round where it was and is are
  painted again and sent to the GPU (`SeaLettering`). A layout asks each water's name's spots whether they stand on
  its own sea some 18,000 times, each four reads of a table summed once a grid (`CellSums`, `onOwnSea`), and the
  key's places laid round reuse the first layout up to the first name the key would cover: measured natively on the
  real world, a layout takes some 13 ms at 1920 × 1080 and 18 ms at 2560 × 1440; a drag or the wheel still lays out
  each frame it moves the view. How it reads:
  - *Sizes.* In the game's face, every word at least 13 px at a 1280 × 720 screen, a port's name 15 px; every size,
    mark and line grows with the map on a larger screen (`letterScale`: the map's height over its height at
    1280 × 720, never below 1), so at 1920 × 1080 the words are 20 px and 23 px.
  - *Hierarchy.* Ports strongest: the larger size, the darkest ink and a filled ring. Waters' names in their rings in
    their difficulty's colour. Ruins (a dashed diamond) and nodes (a ring) in a lighter brown, `#5c4631`. The place
    chosen is named in the route's red-brown, and a place a step of the quest walked names is ringed in it. Every word is haloed in the parchment's colour, 3 px, so it reads at
    least 4.5 : 1 over the coasts' lines and the washes.
  - *Alignment.* A place's name stands right of its mark, its middle on the mark's, 5 px from it; where the right is
    taken or off the map, the same on the left; where the ship's arrow stands on the mark and both are taken, the same
    right and then left of the arrow. A water's name is centred on the spot it takes.
  - *The clear region.* The thumbs of every set of gauntlets reach over the parchment in any frame of their fidget, as
    measured from the forge's strips (274 × 181 texels a frame): the left over the painting's shares 0-0.29 across and
    0.45-0.56 down, the right over 0.71-1 across and 0.46-0.57 down (`HANDS_COVER`). No name and not the key stands
    there; the ship's arrow and the places' marks stand where they lie, or just clear of a mark they meet (below).
  - *Marks apart.* No two places' marks overlap, and each keeps 1.5 px clear of the marks laid before it. They are
    laid ports first, then ruins, then nodes, so a port's or a ruin's stands where it lies over a node's. A mark that
    meets one laid before it moves out along the line between their middles to the first spot clear of every mark and
    inside the map, else as near that line as it can, and
    its name stands beside it there (`layOut`). A click picks a mark where it is drawn.
  - *Priority.* The ship's arrow and every place's mark are laid first and never dropped. Then the names, the place
    chosen first, then ports, waters, ruins and nodes, each where it covers no mark, no hand and no name laid before
    it, inside the map. A water's name takes the first of its spots wholly on its own sea, on one line or two; with
    none, the first on no land with its middle on its sea, so across a sea too narrow for its name seen whole (the
    Elmwater and the Rimeholt Deep) it may run over a neighbour's wash, never over land (`onOwnSea`). A name with no clear place is dropped: a place's
    keeps its mark.
- **The view**, DFO's: it opens centred on the ship, 1,600 km across. A drag pans; the wheel zooms about the cursor,
  from the whole world fitting the parchment to 6 px a kilometre; the world stays centred on an axis it does not
  fill. A press that moves more than 6 px is a pan, not a click.
- **Choosing.** A click picks the port or ruin within 16 px of it, or else the region or the point of the sea under
  it. A port and a node are sailed for just off their island's coast nearest them, 400 m clear of its outline
  (`offCoast`), straight out from them, or where land stands across that way within 5 km (a narrow inlet's far wall)
  at the nearest such point any way round, as the sea room judges a course by the outline and refuses one that ends
  on it; a region at its
  anchorage ([[A Held Aim Swings Between the Sides, the Oversea View Keeps Its Height, and No Ship Is Sailed Through]]).
  The way there round the land is planned at once ([[Game]], "Sailing") within the 64 points the room takes in a
  course: 48 at most, those it can best do without left out, leaving room for its bends round the sea's islands
  (`COURSE_POINTS`); a way round most of Saltmere's coast would hold some 80. It is inked, and a card over the
  parchment offers Set sail (named with its key as bound, Enter or the pad's A), or says why no way leads there: one
  that still holds more points, its bends and all, is none ("The way there winds too much to sail at once: choose a
  nearer place."), and a voyage bent past them on the way by an island come into sight heaves to, its line saying
  so. Escape lets the choice go, then lowers the map.
- **The regions** ([[World Map]], "Regions"). At sea, the land of the island whose waters the ship is in is lit by
  region as the pointer passes over it: the land's cells of the waters' grid whose middle lies inside the island's
  outline and nearest that region's centre of the island's own, its land brightened and lined as another water's sea
  is (`mapRegions.ts`), and the region's name shown where the pointer came onto it on a card of the parchment in a
  double rule of ink with a diamond at each inner corner, its island's name under a short rule in the lighter ink
  (`paintCard`), over the point, or under it where over would leave the map, whole inside the map, and stood anew by the pointer once the map is panned, zoomed or raised
  again; with the pointer off the map, none is lit. Its land lit, no water is; off it, the water under the pointer is
  lit again. A click on a region's land (no place's mark within 16 px) chooses its anchorage, named for the region:
  the way there is planned and inked as any course is, and sailed at ×200, as any course set on the held map, the course judged by the
  waters' rules as any other ([[Sailing]]). Another island's land lights nothing.
- **Other waters** ([[The Held Map Takes the Ship to Other Waters, Seen Sailing Away]]). At sea, the water under the
  pointer, when it is not the one the ship is in, is lit (the pad's cursor stands only in the interface's windows, so the pad lights none): its sea brightened a little with the
  parchment's light and its edge with the other waters softly lined in the ink, where its cells' share crosses a half
  (`litCells`, on the page's grid of the waters, the world crate's rule judged once a 4.8 km cell). Its name, holder
  and level band are written small where the pointer came into it, kept inside the map ("The Elmwater · Grey Tithe ·
  levels 8-14"), the holder as the wash shows it under the pointer (the Lantern Sea past 10 km the Grey Tithe's), and
  painted again only as another water is lit or the pointer crosses into another's hold of it, never at each move within one (they stand anew once the map is panned, zoomed or resized); they give way to the
  prompt while it asks. The ship's own water
  and land light nothing. Which water the ship and a course's end lie in is the exact rule's, the room's own
  (`WaterJudge`), never the grid's, which reads a coast's sea as land a cell from it. A course chosen whose planned end
  lies anywhere at sea asks, in the ship's own water or another, and one whose end or ship's water is unknown asks
  nothing, nor one no longer than the 400 m a travel lays the ship short of its end, which would leave it where it lies
  (Set sail sails it): on a card of parchment ringed in ink a quarter of the
  way down the map and in its letters: "Travel to <water>?", the holder at its end and its level band, and "Yes <key> No <key>", each as the last device used names it (Enter and Escape, or the pad's A
  and B)
  (`MapAsk`). Yes (the confirm key, the pad's A, or the card's press, which reads Travel while it asks) lowers the map
  and the ship travels to the water the prompt named, for the place chosen (a port or a node sailed for at its own
  point) ([[Sailing]], "Travel by the held map"); No (Escape, the pad's B) lets the prompt go and
  keeps the course inked, to be sailed the long way with Set sail.
- **The difficulty.** Beside Set sail the card offers the voyage's difficulty, Normal, Elite or Abyss
  ([[Voyages Choose a Difficulty, Overlook Lives Like the Tower]]): the island's foes as they are, or two or three
  levels higher, paying half again or twice the XP, Aurem and Vestiges. The difficulty picked is the voyage's only once
  the player sets sail with it; letting the destination go lets it go too. The node landed at is joined at the
  voyage's difficulty ([[Server]], "The host"); the sea itself sails at Normal whatever is picked. Elite here is the voyage's tier, never a foe's rank; the Roster says
  "Elite difficulty" where a player is, and reads a place kept under the tiers' old names (`--rough`, `--storm`) as
  Elite and Abyss. The presses stand after a "Seas" label. A difficulty the player's level shuts rests, titled with
  its gate's reason, and the first reason stands in a line under the row ("Elite seas open at level 10."), read from
  the rules by the last word of the character a room sent ([[Activities]]); before any word none is shut. A pick the
  level shuts, kept from an earlier voyage or another character, falls to the hardest difficulty open below it, and
  Set sail takes that one, so no voyage sails for a sea room whose gate would turn the player away.
- **Turning back.** Escape on the way down to the helm turns the view back before the map is raised.
- **Lowering.** Over 0.36 s, from wherever the painting is; then the view flies back up to the sea's, and a
  destination set, the ship sets sail for it as it does, at ×200, a planned voyage's pace
  ([[The Sea Has Two Views, Docking Asks First, and an Island's Nodes Stand in a Panel]]). The voyage can be stopped
  and resumed from the ship's console.

## On land

The map on land speaks in icon glyphs, with little text, and a table on it says what each glyph is
([[The Held Map Comes to the Social Spaces and Every Land Area]]).

- **Raising.** On foot, M anywhere but in a dungeon (where it opens the [[Dungeon Map]]; a passage zone's under ground among the places it rises, the web its sheet: [[Passages]], "The passages' map"), under no land (with no menu or gear screen up): the view goes into the player's eyes (from third
  person too), and there the same painting rises in their gauntlets as it does at the helm. The pointer is let go to
  pan it. The world goes on: the player stands still and hears it, and a fall lowers the map. While it rises every key
  waits; M or Escape turns back. Up, M or Escape (the pad's B) lowers it, and the view goes back as it was. The fight's crosshair,
  plates and compass, and a gate's offer, give way while it is up.
- **The view** opens centred on the player, 400 m across (in a passage zone, the whole web), held to the land's sheet: its ring and 40 m past it. A drag
  pans and the wheel zooms, to 8 px a metre at most. A click does nothing: the map is only to look at.
- **What it shows**, painted on the parchment in the map's inks and washes as a surveyor colours a plan, read afresh
  each time it is raised, off the ground as the camera keeps it (exact within 1 km of the player, an island's its
  own):
  - **The ground**: the sea washed blue-grey and the shore inked; the relief every 10 m and a bolder line every 50 m,
    read about 160 times across; rivers as wide as their flow; the edge of the ground walked, dashed.
  - **A social space's plan**, from its own solids, the city's landmark and the city's works within its ring, each
    module by its parts, each piece by how it stands over the ground under it: paving faint, lawn
    green, trodden earth ochre, still water blue, walks a shade darker; walls, stalls and buildings 1.8 m and taller
    near solid with a shadow; benches, counters and low walls light; what is walked under (a roof, a lintel, an arch's
    head) only outlined, dashed, so a passage through a range reads open. Its trees and bushes are green crowns.
  - **A patrol area's plan**: its layout's tracks cased and footpaths dashed, at their widths (4.5 m and 2.6 m), its
    buildings and pieces as a social space's, its plantings' trees and shrubs.
  - **Places by name**, a glyph's width under their middles, else over them, else twice as far, else beside them,
    where clear of the glyphs, the table, the names before them (a gap apart on a line) and the gauntlets, else left
    off; a place on the map by its edge has its name whole inside the map, moved along its line (the hub's: the Seaward Walk, the Watch Court, the West Court, the Forge Yard, the Beacon Walk, the Hall of
    the Arts and the Stair Yard).
  - **The glyphs.** Each keeper is a coin in their sign's board colour carrying their sign's device: a star for the
    Mage, a key for the vaults, an anvil for the Weaponsmith, a helm for the Armorsmith, open shears for the Tailor, a
    horseshoe for the Tack, a ship's wheel for the Harbourmaster, candles for the chandler, and the Postmaster, who
    keeps no stall, a sealed letter on a slate coin, the blue of his vest toward the ink; each faction's coin in its
    cloth with its banner's emblem (the Stormcallers' bolt, the Lamplighters' flame over a lamp, the Veiled's crescent
    and star). Each site: a landing's chevrons, a public event's red-brown diamond, a gate's open arch and a sealed
    door's barred one, an objective's target, foes' crossed blades, a beacon's tower, and a resource node's small ring with
    a cut stone, named in the table for the island's resource ("Brineglass"; [[Material Nodes Stand Where They Are Dressed, Worked by Holding E]]). The player's red-brown arrow points
    where they look.
  - **What moves on it** ([[Walk-in Windows Are Seen Through and Larger, Public Events Show on the Map, and So Does Every Player]]): every other player in the room the player stands in, a patrol zone's or a social
    space's, wherever they are in it, a dot in their nameplate's square's colour, the company's green or the players'
    blue, edged in the ink, under the player's arrow (`mapMarks.ts`); and the zone's public event while it runs, ringed
    at its ground in the route's red-brown, its name and the time it has left beside it; a player off the map is
    neither dotted nor named in the table. They are gathered ten times a second, to the whole pixel, and painted, with
    the player's arrow, over a copy of the land's sheet (`LandLettering`), which is painted again only when the view or
    the table's rows change; none of them covers the table.
  - **A lit coin.** A keeper's coin is lit as their mark over them is ([[Game]], "Over what a player can use";
    [[A Keeper With Something for You Pulses and Is Seen From Everywhere]]): a quest step asks to speak with them, or
    letters wait at the Postmaster. It is ringed in the route's red-brown, a quarter wider than the coin, and a second
    ring goes out from it to twice its width and fades, once every 1.3 s; under reduced motion only the first. The
    rings are inked by the map's own pass each frame (`pulse_at`, at most 16 coins), so the parchment's picture is
    never painted again for them, and the gauntlets cover them as they cover the coin.
  - **The table**, framed as the sea's key is, in the corner clear of the gauntlets over the fewest glyphs and names
    (keeping its corner while it can), the names then laid again clear of it: the land's name at its head; then each
    glyph the land holds, once, beside what it is ("The Mage", "Public event"), in columns of at most seven, and the
    player's arrow, "You", then "Your company" and "Other players" while the map shows one; under them a bar
    of the ground's length at the map's zoom ("25 m").
  - **Other land** (an island's): its ground, edge and landing.

## Limits

- A route is planned on every continent's outline.
- The coast field is a cell's middle every 4.8 km, interpolated: a headland narrower than a few kilometres is drawn
  softened.
- A name the ship's arrow sailed onto and pushed off the map stays off after the ship sails on, until the map is
  panned, zoomed or raised again.
- The route is inked through at most 128 of its points. Each 32 px tile of the map is told which of the route's
  legs pass near it (`routeTiles`), so a pixel measures itself against those alone.
- On land, the map marks a keeper a quest step names, not the place of a quest's other goals.
- A water's sea is judged a 4.8 km cell at a
  time, so its words may stand over an isle smaller than a cell.
- A place's mark under a gauntlet's thumb stays there, under it; only its name keeps clear.
- With every corner and edge place taken by marks, ports' names or the hands the key is left off, as on a screen as
  narrow as a phone's with the whole world in view.
- On land a glyph under a gauntlet's thumb stays there, under it, as at sea; a place's name with no clear room is left
  off until the map is zoomed or panned.
- On land the relief is exact within the 2 km of ground the camera keeps round the player and the land's 1 km grid's
  past it, so a patrol area's far side may read softer.
- On land the sheet is the land's own: all of it shows from the first time the map is raised, as the sea's does.
