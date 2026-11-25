---
type: system
status: building
code:
  - client/src/rules/passageRules.ts#startPassageDoor
  - client/src/rules/passageRules.ts#readPassageWeb
  - client/src/rules/passageRules.ts#readPassagePlan
  - client/src/rules/passageRules.ts#readPassageHeights
  - client/src/game/passages/passageZone.ts#zoneIsle
  - client/src/game/passages/passageZone.ts#zoneLayout
  - client/src/game/passages/passageZone.ts#floorOf
  - client/src/game/passages/passagePieces.ts#pieceMesh
  - client/src/game/passages/pieceView.ts#PieceView
  - client/src/game/passages/passageWay.ts#wayOf
  - client/src/game/passages/passageWay.ts#wayAt
  - client/src/game/passages/passageWay.ts#wayClock
  - client/src/game/passages/passageMap.ts#passageSheet
  - client/src/game/passages/passageWords.ts#PassageWord
  - client/src/game/passages/passageWords.ts#mouthsChoice
  - client/src/game/passages/passageWords.ts#dealTracker
  - client/src/game/passages/passagePanels.ts#MouthsCardView
  - client/src/game/passages/passageShots.ts#zoneShot
  - client/src/game/flow.ts#next
---
# Passages in the Browser

How the page reads, draws and words the passages that web out from the patrol zone
([[Passages Web Out From the Patrol Zone Across Its Island]], built as [[Passages as Claude Builds Them]]). The rules,
the rooms and the routing are the passages' own note's; this note is the browser's part. The pieces are built here;
the game's frame does not yet play a passage zone, which waits on the zone's room.

## In the browser

### The doors

`startPassageDoor` opens an instance of the room module of its own and reads its three doors whole, each refusing
what does not read and saying why: `room_passage_web` (an island's web for a week: its patrol zone, its mouths, the
week's two modifiers and every zone, each its number, depth, place on the island, ground, size, deal, currents, name,
ways on, landmark and lamp; a way on to a zone the web lacks is refused), `room_passage_zone` (a zone laid whole: its
ground, its sites, its pieces and their solids; its onward mouths as many as its ways on) and `room_passage_heights`
(an above-ground zone's ground as `movement::Heights` gives it). An island with no passages, a zone the web lacks or a
style the Forge does not lay yet answers empty, read as none.

### A zone drawn

- **Under ground** its layout is the dungeon's: `zoneLayout` reads it as a dungeon's (`readDungeon`), for the
  dungeon's renderer, packs and kits ([[Dungeons]], "In the Game"). A body stands on the Forge's floor, 0 m.
- **Above ground** `zoneIsle` hands its hollow to the islands' layer as an island ([[Islands]]): its modules on its
  heights, dressed from the island's kit by its climate, with nothing of an island's landing, door or wrecks, and no
  sea or continent's land round it. A body stands on the heights as the room reads them (`floorOf`); every piece the
  room stands stands on them within 5 cm.
- **The passages' own pieces** (`pieceMesh`, drawn by `PieceView` in either scene's pass) stand as plain boxes to the
  sizes of their solids until the `passage.*` packs are published: the way in and each onward mouth a stone frame
  2.4 m wide and 3 m tall, an iron leaf in it while it is shut (the way in always); the lamp a plinth of the
  grey-green stone in a ring of five standing stones 3.5 m out, its light gold and lit while the player has lit it,
  grey while cold; a dead lamp an iron post whose cup is the same; a tally post timber with an iron band, a stump once
  broken; a reliquary a stone chest with an iron lid. A vein's nodes are the game's own resource nodes, from the
  room's word, as anywhere.

### The way between zones

`wayOf` lays the way's rails and `wayAt` plays it (`passageWay.ts`, on the cinema's rails, [[Cinema]]):

| Beat | Seconds | What is seen |
|---|---|---|
| Rise | 1.5 | From the camera in the zone left up to the island seen whole, framed from the side of the zone left as an island's side is framed from the ship (`frameSide`), every zone of the web and the patrol zone inside the picture |
| Draw | 2 | The way come as dots, 10 a leg; the way being taken drawn a dot at a time to the next zone's place |
| Wait | until ready | Held over the island while the room gone to is not ready (`wayClock`) |
| Down | 1.5 | Down to behind the character at their start, 3 m back from the arrival (its length Claude's call: the design gives none) |
| Walk | 1.5 | The character walks 3 m in to where the room stands them, the camera settling 4.5 m behind and 2.2 m up |

The player's inputs are held to its end. A lamp's Home is the same way, its leg running back to the patrol zone. A
zone's frame stands at its place on the island. In the flow ([[Game]], "The flow") a mouth or a Home is `passing`,
played in place of the veil, and on foot again once the way has played and the place has come.

### The passages' map

Held in a passage zone, the held map shows the web as a land sheet (`passageSheet`, [[Held Map]], "On land"): every
zone a mark at its place by its deal's glyph (a skirmish the foes' blades, a mission the objective's target, a vault
the sealed door, a vein the resource's ring, a reliquary the key, a lamp the beacon's tower), its lamp ("The second
lamp", ", lit" once lit this week) and its currents named under it; the way come a track from the patrol zone's gate,
the ways on from where the player stands footpaths; "You" at their zone. It opens across about a third of the web
round the player, the wheel drawing back to the whole. Nothing of it shows at sea, over the island's side or on the
land's map.

### The panels

Each from a view model (`passageWords.ts`) fed by the room's word on the player (`PassageWord`: the deal's progress,
the lamp lit, the mouths open, the haul), in the house style of the other panels:

- **The mouths' choice** (`MouthsCardView`), E at a run's sealed door in the Saltgrass Downs, as an entrance's card
  is drawn: the run's name; the zone beyond (its name, depth, deal and currents) and the week's modifiers; the routes
  ("The public passage", and "Your company's route" in a company, else "Your own route, alone"), the chosen one
  lit; Go in (E) at the mouth, "Begin at the second lamp" for each lamp lit this week, and Close (Esc, the pad's B).
- **An onward mouth's sign** on coming near it: the zone beyond, "8 zones deep", what waits there ("A chest, under
  guard."), its currents, a boon's name green and a bane's red, and while it is shut "Shut until this place's work is
  done.".
- **The lamp's prompt** where the use prompt stands: "Light the lamp", held 2 s; once lit, Home, or on through the
  open mouths.
- **The haul**, framed on the right under the tracker while anything is carried, each item, the Vestiges, the
  materials and the cold lantern, then "Carried, not kept. Fall or leave, and it is lost."
- **The leave held** in a passage zone, with anything carried, adds "What you carry is lost" under its place.
- **The deal's tracker** is the task tracker's quest (`dealTracker`): the zone's name, what is to do ("Light the dead
  lamps 1/3", a hold's clock) and once done "Go on through an open mouth".

### Pictures

`passageShots.ts`, which the game never imports, draws a zone of each kind with the game's own drawers onto a texture
of its own (above ground under a plain sky, under ground in the dungeon's dark), the way between zones as its dots
over a plain ground, the map on a parchment's colour, and the panels for `tools/uiShot.mjs`.

## Limits

- The pieces are boxes until the passages' packs are published.
- The way's picture draws its dots and framing only; the island's land under it is the sea's view's, drawn once the
  game plays the way.
- On the map the player's arrow covers their own zone's glyph, and a name at the sheet's edge may be cut.
