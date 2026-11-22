---
type: system
status: live
code:
  - client/src/ui/paint.ts#PaintedRole
  - client/src/cinema/screen.ts#Screen
  - client/src/speech/dialogue.ts#DialogueBox
  - client/src/speech/overheads.ts#Overheads
  - client/src/game/prologue/tap.ts#tapToStart
  - client/src/game/prologue/nameplate.ts#Nameplate
  - client/src/game/prologue/objective.ts#Objective
  - client/src/game/prologue/creation.ts#windowNode
  - client/src/heldmap/heldMap.ts#HeldMap
  - client/src/ui/page.ts#touchesHeld
  - client/src/ui/page.ts#SIGN_INS
  - client/src/plus/frame.ts#framePixels
  - client/src/ui/faceReader.ts#readFace
  - client/src/ui/text.ts#layLine
  - client/src/ui/uiRenderer.ts#UiRenderer
  - client/src/ui/uiRenderer.ts#uiScale
  - client/src/ui/layout.ts#layout
  - client/src/ui/node.ts#Node
  - client/src/ui/ui.ts#Interface
  - client/src/ui/canvasEvents.ts#CanvasEvents
  - client/src/ui/canvasEvents.ts#eventsOn
  - client/src/ui/screenKeys.ts#screenKeysNode
  - client/src/ui/controls.ts#slider
  - client/src/testground/panelKit.ts#panels
  - client/src/testground/viewTexture.ts#ViewTexture
  - client/src/ui/pictures.ts#Pictures
  - client/src/ui/field.ts#typed
  - client/src/ui/paint.ts#paint
  - client/src/ui/announce.ts#announce
  - client/src/ui/page.ts#saveFile
  - client/src/ui/page.ts#openFile
  - client/src/game/toasts.ts#layToasts
  - client/src/plus/tones.ts#TONES
  - client/src/plus/tones.ts#FILLS
  - client/src/plus/emblems.ts#emblemSvg
  - client/src/game/journalPage.ts#Journal
  - client/src/game/journalTimers.ts#timersNode
  - client/src/game/journalWords.ts#questCardsOf
  - client/src/plus/journalArt.ts#bannerSvg
  - client/src/plus/journalArt.ts#bannerFor
  - client/src/game/bountyGlyphs.ts#bountyGlyphSvg
  - client/src/game/bountyTiles.ts#bountyTileNode
  - client/src/game/journalIcons.ts#iconSvg
  - client/src/game/entranceCard.ts#EntranceCardView
  - client/src/plus/barLayout.ts#BarLayout
  - client/src/plus/barLayout.ts#PLATES
  - client/src/game/hud.ts#Hud
  - client/src/game/hudPieces.ts#seaBarNode
  - client/src/game/hudMarks.ts#markNodes
  - client/src/game/hudParts.ts#keycap
  - client/src/game/keyIcons.ts#iconNode
  - client/src/game/hints.ts#keysShown
  - client/src/game/controls.ts#CONTROL_GROUPS
  - client/src/game/controlsSheet.ts#ControlsSheet
  - client/src/game/rebinding.ts#Rebinding
  - client/src/game/padIcons.ts#padIconNode
  - client/src/game/gameKeys.ts#listenForControls
  - client/src/player/binds.ts#rebind
  - client/src/player/pad.ts#PadReader
  - client/src/game/compassNode.ts#compassNode
  - client/src/game/shipPlates.ts#shipPlateNodes
  - client/src/game/usePrompt.ts#UsePrompt
  - client/src/game/tasks.ts#TaskTracker
  - client/src/game/seaPanel.ts#readoutOf
  - client/src/game/seaPanel.ts#seaFightQuest
  - client/src/combat/hud.ts#Hud
  - client/src/combat/reticle.ts#Crosshair
  - client/src/combat/seaReadout.ts#SeaFightReadout
  - client/src/combat/shipAbilityBar.ts#ShipAbilityBar
  - client/src/combat/shipAbilityBar.ts#usedBetween
  - client/src/combat/shipIcons.ts#SHIP_MAPS
  - client/src/combat/ringSlot.ts#ringNode
  - client/src/ships/shipAbilities.ts#shipAbilities
  - client/src/game/controls.ts#shipKeys
  - client/src/game/seaSight.ts#SeaSight
  - client/src/combat/barDraw.ts#thinBarNode
  - client/src/combat/compassNode.ts#compassNode
  - client/src/combat/barDraw.ts#barFrame
  - client/src/plus/meter.ts#Meter
  - client/src/ui/stack.ts#Stack
  - client/src/plus/compass.ts#compassPlace
  - client/src/plus/compass.ts#markPlace
  - client/src/game/seaHud.ts#seaShipMarks
  - client/src/game/seaHostiles.ts#hostileLook
  - client/src/combat/hud.ts#veilOf
  - client/src/combat/hud.ts#clearOf
  - client/src/combat/vitals.ts#Vitals
  - client/src/combat/vitals.ts#chargesShown
  - client/src/combat/hudLayout.ts#hudLayout
  - client/src/combat/hudLayout.ts#barLength
  - client/src/plus/barFrame.ts#barFrameCells
  - client/src/combat/weapons.ts#WeaponRows
  - client/src/combat/weapons.ts#weaponsOf
  - client/src/combat/weaponPicture.ts#lengthwise
  - client/src/player/itemPictures.ts#ItemPictures
  - client/src/player/picture.ts#overlapped
  - client/src/player/iconFit.ts#shrunk
  - client/src/combat/statusIcons.ts#StatusRow
  - client/src/combat/foePlate.ts#FoePlate
  - client/src/plus/barLoss.ts#stepLoss
  - client/src/plus/barLoss.ts#pieceAt
  - client/src/combat/foeTarget.ts#FoeTarget
  - client/src/combat/foePlate.ts#poiseTrackOf
  - client/src/combat/plateSight.ts#coneWant
  - client/src/combat/plateSight.ts#aimedFoe
  - client/src/combat/plateSight.ts#bodyDegrees
  - client/src/combat/plateSight.ts#landBlocks
  - client/src/combat/plateSight.ts#plateScale
  - client/src/combat/plateSight.ts#PlateSight
  - client/src/combat/foePlate.ts#OVERHEAD_SIZES
  - client/src/combat/hitWords.ts#wordsOf
  - client/src/combat/foePlate.ts#wardOf
  - client/src/plus/kit.ts#motionReduced
  - client/src/ships/shipBars.ts#ShipPlates
  - client/src/plus/notices.ts#NoticeStack
  - client/src/game/hudPieces.ts#noticesNode
  - client/src/game/seaWord.ts#SeaWord
  - client/src/ships/shipBars.ts#HullLosses
  - client/src/game/gearScreen.ts#characterOf
  - client/src/game/gearScreen.ts#itemDetailOf
  - client/src/game/gearWindow.ts#startGearWindow
  - client/src/game/characterPage.ts#characterPage
  - client/src/game/itemPage.ts#itemPage
  - client/src/game/inventoryPage.ts#inventoryPage
  - client/src/game/acquiredFeed.ts#AcquiredFeed
  - client/src/game/menuPage.ts#MenuContext
  - client/src/game/shipPages.ts#shipTab
  - client/src/game/shipPages.ts#harbourPage
  - client/src/game/shipPages.ts#musterAt
  - client/src/game/stationView.ts#stationPage
  - client/src/game/gearHold.ts#Holds
  - client/src/game/gearNodes.ts#tileNode
  - client/src/game/gearNodes.ts#pictureNode
  - client/src/game/gearCard.ts#cardNode
  - client/src/game/gearShell.ts#screenNode
  - client/src/game/accountMark.ts#accountMark
  - client/src/game/gains.ts#gainsOf
  - client/src/game/uiSounds.ts#play
  - client/src/soundSamples.ts#playSample
  - client/src/soundSamples.ts#Samples
  - client/src/soundSamples.ts#soundCredits
  - client/src/soundMeasure.ts#measuredOf
  - client/src/contentCache.ts#contentBytes
  - client/src/game/uiSounds.ts#worldOutput
  - client/src/combat/worldSounds.ts#WorldSounds
  - client/src/combat/worldCues.ts#eventCues
  - client/src/game/gearCards.ts#cardOf
  - client/src/player/itemPictures.ts#ItemPictures
  - client/src/player/iconFit.ts#fitIcon
  - client/src/game/gearGlyphs.ts#nodeGlyphSvg
  - client/src/game/accountTab.ts#AccountPanel
  - client/src/game/menuPages.ts#shipPage
  - client/src/game/menuPages.ts#settingsPage
  - client/src/game/menuPage.ts#PlainContext
  - client/src/game/rosterTab.ts#RosterPage
  - client/src/game/rosterPanel.ts#panelParts
  - client/src/game/rosterRows.ts#actionsFor
  - client/src/game/playerDetails.ts#detailsNode
  - client/src/ui/page.ts#PAGE
  - client/src/game/emblemArt.ts#emblemPixels
  - client/src/game/appearanceButton.ts#emblemCard
  - client/src/game/appearance/appearancePage.ts#appearancePage
  - client/src/game/appearance/appearanceDisplay.ts#displayNode
  - client/src/game/appearance/bardingTile.ts#bardingPicture
  - client/src/forge/cosmetics.ts#rampOf
  - client/src/game/companyHud.ts#CompanyHud
  - client/src/game/stationPages.ts#vaultPage
  - client/src/game/npc/npcScreen.ts#npcPage
  - client/src/game/npc/npcTiles.ts#wareTile
  - client/src/game/npc/npcFigure.ts#keeperFigure
  - client/src/game/npc/npcSpeech.ts#speechBand
  - client/src/game/npc/factionRows.ts#factionRows
  - content/story/keepers.json
  - client/src/game/bountyBoard.ts#boardPage
  - client/src/game/gearNodes.ts#ringNode
  - client/src/player/elementGlyphs.ts#elementSvg
  - client/src/face.ts#outlineOf
  - client/src/face.ts#useMendedFace
  - client/src/face.ts#CANVAS_FACE
  - client/src/trueType.ts#trueType
  - client/src/combat/playerPlates.ts#PlayerPlates
  - client/src/combat/playerPlates.ts#aimedPlayer
  - client/src/combat/playerPlates.ts#squareNumber
  - client/src/game/social/interactMenu.ts#interactRows
  - client/src/game/social/social.ts#holdOnPlayer
  - client/src/game/social/inspectWindow.ts#InspectWindow
  - client/src/game/social/inspectGear.ts#inspectedGear
---
# Interface

The game's screens wear Enhanced Plus, DFO's own interface, brought over and adapted ([[Pick - Enhanced Plus UI]],
[[The Ship Is Managed and Walked From the Sea's Panel]]): carved stone and brass, so every surface reads as one stone.
Its words call a ship "it" ([[Ships Are It, Not Her]]), and the sea wears it too ([[The Sea's Screens Wear Enhanced Plus]]).
The game draws every screen itself, and by the owner's word no HTML is laid over the canvas
([[The Interface Uses No HTML, Now or Later]]): the game's page is one canvas ("Drawn by the game", below).

## Drawn by the game

- **The face.** As the page starts, Pixelify Sans is read into its own grid's cells, one texel a cell, with the
  glyphs `face.ts` mends, so every browser reads the same cells (`readFace`). Words are laid where a browser sets
  them: Pixelify's advances and the sheet's letter, word and line spacing, rounded as the pages round them.
- **One draw.** Each frame's glyphs and surfaces are quads in one list, drawn in one instanced pass over the frame at
  its end, from one atlas of glyphs and tiles, read by whole texels and never filtered (`UiRenderer`).
- **The roles, painted.** `paint` lays a role's drop shadows, ground, bands, inner shades and bevel or carved frame.
  The interface lays itself in pixels of its own, each drawn as the screen's ratio rounded to whole device pixels
  (`uiScale`), so at a ratio of 1.5 each is 2 device pixels.
- **The pointer and the ratio.** The page hears the pointer and the wheel in its CSS pixels. Each frame is told the
  screen's ratio (the game, the World Editor and the Test Ground pass `devicePixelRatio`), and the interface turns each
  position into its own pixels, the ratio over `uiScale`; `takes`, which a page's handler asks with CSS pixels, does
  the same. The box of the field being typed in goes back to the page in CSS pixels, for the browser's typing to place
  its composition by. At a whole ratio the two are the same. The World Editor's view starts at the panel's drawn edge
  at any ratio: the panel is 300 of the interface's pixels, `panelCss(ratio)` CSS pixels.
- **The pointer's look.** In the game and the Test Ground the pointer is the gauntlet, DFO's own grey hand
  (`gauntlet.ts`, [[The Pad Moves a Cursor in Windows, and the Gauntlet Is the Pointer]]): 31 by 32 pixels in five
  colours, the point it presses at its fingertip in the top left. The canvas wears it as its cursor, a picture at 1x
  and at 2x for a denser screen, never past 32 CSS pixels a side; while a mouse button is down over the canvas it
  shows its press frame at once, the finger drawn in, but not for a touch nor while the pointer is locked. A field
  keeps the text caret, and while the pad's cursor is out the mouse's pointer is hidden. The World Editor keeps the
  system's pointers.
- **Announced.** A toast's words, each press's label as focus reaches it (by the keys or the pad, or given by a
  screen), and a slider's value as the keys step it go to a screen reader through `document.ariaNotify` where the
  browser has it.
- **A tree of the game's own.** Each frame the interface is built afresh as plain nodes (`Node`): a box that is a
  fixed size, fits its content, grows into the room left or takes a share of its parent; lays its children in a row,
  a column or wrapping lines, with padding, gaps and alignment; and shows a role's paint, a fill, an outline, words
  (spans in their own colours, wrapped at spaces with a paragraph's leading spaces kept and the spaces at a break
  dropped, or kept to one line and cut short with '...', a newline a space there; with a hard shadow or a halo), a picture, or its own
  drawing. A node can float over the rest, against its parent or the screen, clip or scroll its children, and be
  drawn moved or faded. `layout` lays it out after Clay's model, every length in whole CSS pixels.
- **Pictures.** A picture is laid into the atlas at the size it is drawn, as it is first wanted: a file, SVG markup,
  RGBA pixels, 2D drawing, or a live image copied in again as its version changes; pixel art keeps its own texels. The
  atlas grows a layer at a time, up to 8 of 2048 square; full, it is laid afresh once the frame is
  drawn, each picture laid again as it is next wanted. A quad can turn about its middle, as an arrow does. One larger
  than a layer (2047 device pixels a side) is laid scaled down to fit and stretched back over its box; one whose own
  texels are given (pixel art, raw pixels) cannot be, and is said once in the console and not drawn. One laid at no
  size, as a page's is on its first frame before its room is known, is not drawn.
- **Pressed, focused, typed.** What the input did is read against the last frame's boxes (`Interface`): what the
  pointer is over and pressed, held or let go; focus walked by Tab, moved by the arrows to the nearest press that
  way, or by the pad's cross, whose up and down always move focus and whose left and right step a slider; A presses,
  and B goes back; the wheel scrolling the list under it, and focus by keys scrolling every list that holds it into
  sight. A press held as its node goes is let go. A field takes the mouse as a page's does: a drag selects, Shift
  with a click extends, a double click takes a word. A hidden field is typed through keys and paste only, never handed
  to the browser's typing, and its words go the frame its field does; what the interface keeps by id (scrolls, a
  field's words unless asked for that frame) goes with the id. A field takes words through the browser's `EditContext` where it has one (Chromium), so
  composition works on the canvas, and through keys and paste elsewhere; copy and cut take its selection. A field
  reached by a touch or the pad opens the keys the game draws (`screenKeys.ts`): ten across in even columns, the digits
  over the letters, Shift for one capital, Back, a wide Space and Done (Enter), at the view's foot or its head where the field stands
  low; the pad's cross walks them, A types the one it stands on and B puts them away, the field keeping the focus.
  While they are open the browser's own typing and keyboard stay away; a keyboard's key, or the focus leaving the
  field, sends them away. A on a field the pad reached opens them again once B has put them away. The page's side is `CanvasEvents`; the interface hears plain events, and with the game in its worker
  ([[Game]], "Threads") hears them as the page sends them (`eventsOn`), what it types in sent back to the page. Outside a menu the keys stay the game's, and the pointer locked to look round presses nothing.
- **The pad's cursor** (`padCursor.ts`, [[Pick - Pad Cursor and Gauntlet]]). Wherever the interface takes the pad (a
  window, the sheet, the creation, a field being typed in, the Test Ground's panels while a control there has focus), the left stick thrown from rest past its 0.2 lean brings
  out a cursor, the gauntlet drawn over everything: at the focus's middle, else where the mouse last was, else the
  view's. A stick already leant as a window opens moves nothing until it has come back. It moves as DFO's does: 900
  CSS pixels a second at a full lean, the lean past the rest curved to the power 1.7; it eases in over 0.1 s and stops
  dead as the stick is let go; a full lean (0.95 of the throw) held past 0.45 s climbs to 1.6 times over 0.3 s. Over a
  press it goes at 0.4 of its speed, unless boosted. With the stick under half its throw, or at rest, it is drawn
  toward the middle of the press it is over, or the nearest whose edge is within 28 CSS pixels, closing 10 times a
  second's share of the gap, the lighter the stick the more; a step under 0.05 pixels is none. Every press the pad
  can reach pulls it, so it settles on presses in every window.
- **Pressing with the pad's cursor.** While it is out it is the pointer: what it is over is lit as under the mouse,
  and A goes down at it and comes up as A is let go, so a hold or a drag works, the gauntlet's finger drawn in
  meanwhile. Y is the right button there (inspecting an item), and X a press with Shift there (on a press the press,
  on a field its selection grown to the cursor); each brings the cursor out at the focus if it is away. The right
  stick leant past 0.25 scrolls the list under it at 900 CSS pixels a second, a whole pixel at a time, or under the
  focus while it is away. The cross steps the focus from the press under the cursor and carries the cursor onto the
  one it reaches, following it as its list scrolls it into sight; on the keys the game draws, A types the key under
  the cursor. A move or press of the mouse, or a key, puts the cursor away; a move the page makes within 0.3 s of the
  pointer locking or letting go, or one that goes nowhere, does not.
- **Modal.** A node marked `modal` (the menu, and each window that stands over the game while it is up) holds the
  keys and the pad while it is laid: focus walks only among what acts inside the topmost one, focus left outside it
  is let go, and Enter, Space and A press nothing outside it. Its scrim still takes the pointer.
- **Controls.** A press with words, a toggle, a slider (dragged, or stepped by its arrows or the pad's left and right,
  each step said to a screen reader) and a choice from a list that opens under it and shuts on Escape or a press
  anywhere else are built once, for every screen (`controls.ts`).
- **Laid again cheaply.** The tree is built and laid afresh each frame, but a text's lines at a width and its fitted
  widths, each line's glyphs and each colour read are kept across frames (bounded, emptied whole when full), and a
  node whose box, frame and shadows fall outside its clip is not drawn.
- **The heads-up display** is a layer of its own (`Hud`): the place's name, the edge's warning and its darkening,
  death's words and Respawn, the key strip on its keycaps, the task tracker, the
  toasts, the status line, the compass, the marks with their rings, glyphs and arrows, the ships' plates, the sea bar
  and its offers, Manage's panel, the menu, the prompt for E, the veil and the sheet of every control. Each stands where the page's sheet stood
  it, gives way as it did, and eases, slides and flashes as it did. Words laid over the world, and the darkened edge,
  let a click through to the world; the marks, presses and panels take it. A mark's glyph is
  drawn into a picture in the mended face (`CANVAS_FACE`), which holds the ones Pixelify lacks. It gives way to the fight's display as that says it shows, and to the
  dialogue box while a named speaker's words are up (`speaking`).
- **The menu.** The menu's frame (its tabs, the account's mark, the banner, the footer and the world dimmed behind
  it), the Character, Inventory, Ship, Social and Settings pages and the pages to come, an item's page, the hover card, the holds and their bursts, what the player
  gains and the company on the heads-up display are one layer of the game's drawing (`startGearWindow`).
- **A page of the menu** is a function of what the menu gives it (`MenuContext`) answering its nodes each frame: the
  gear and the way to ask of it, the pictures, the room its body leaves, the menu's sizes on this screen, the holds,
  the one hover card (shown beside a press while the pointer is over it or the keys gave it the focus, floated over
  everything on the screen and kept above the footer, the pointer passing through it to what it describes where
  there is no room beside it; a keeper's coins and the account's mark are named in it too), what X opens, and the Art's and Appearance screens' doors. It
  reads what was done to it through the interface; the menu chooses the footer's hints and presses by the view, and
  Escape's steps. The worn Art's screen, Appearance and the keepers' screens with the vault are drawn pages too; the
  Art's and Appearance stand to the body's edges, the Art's scene a live picture the game paints a step at a time, and
  the figures, the horse and the keepers drawn from the forge's pixels, kept whole. A page that needs no gear (Ship,
  Social, Settings and the pages to come) takes only the interface, the room, the sizes and the holds
  (`PlainContext`); Social and Settings keep what the accounts answered while they show, asked again each time they
  open, and the Roster takes Escape's step first while its panel or a player's details are open. The page's own
  services a screen asks for are `ui/page.ts`: a link opened in a new tab, the address left or loaded again, words
  copied, a file saved or opened from the player's chooser, a yes or no asked in the browser's dialog; each borrows the
  page for a moment, and nothing of them is drawn interface.
- **The story's screens** are layers of their own, each where the page stood it: the tap to start over everything,
  the cinema's screen (its veils, bars, eyelids, flash, title, prompt and skip) over the HUD and the menu, a boss's
  nameplate and the objective under it, the dialogue box and the barks over heads under every other layer, and the
  creation's two windows at the helm, whose fields are typed through the interface and whose keys are the
  interface's while either is up (`creationOpen`); each window, and the pause menu, is modal while up. Words over the world and the veils let the pointer through to the
  view; the tap to start and the windows take it. The tap's own wake of the browser's sound is still heard from the
  page's pointer and keys.
- **The held map's** names, the ship's arrow and the card to set sail are a layer over the parchment the GPU draws,
  rising and falling with it; the card's presses take the pointer, so a click on them never picks a place.
- **The Test Ground's panels** are drawn too: the page is one canvas, its two panels laid either side of the view as
  its grid laid them, each a scrolled column of the Test Ground's own dark surfaces, flat presses and dim hints, with
  the shared toggle, slider and choice (`panels`, `Panel`, `GearPanel`). The view between them is drawn into a
  texture of its own, the fight's display over it in an interface the view's size, and copied into its place
  (`ViewTexture`); a click there is the world's, and the wheel over a panel scrolls it.
- **The World Editor's panel** is drawn too: its page is one canvas, the panel at the left in the game's face and the
  map, the land's view or the Islands mode's island to its right, its overlays' marks drawn on the GPU and their names
  in the interface; a captain's fight shows the game's own readout over the view.
- **Checked headless.** `node tools/uiShot.mjs <shots.json>` draws any module's tree through the real renderer and
  writes a PNG, hearing a shot's events on its second frame, once the first has laid what they press. `ui/gallery.ts`
  holds what a screen is mostly built of: a window under a header panel, presses at rest, primary, warn and disabled,
  words in a span's colour wrapping across a break, at two sizes, with a halo and with a hard shadow, a chip, a field
  and the words typed in it, pictures from SVG (one turned), pixel art and 2D drawing, a scrolled list of tiles, and a
  float on the screen; `screenKeysShot` draws the keys open over it, and `punctuationShot` the face's punctuation at
  each size. `game/journalShots.ts` draws the menu whole as the game starts it, over sample gear and the day's word:
  the Journal, its timers down, the bounty board, the Postmaster's letters and a dungeon's entrance card.
  `game/social/socialShots.ts` draws the plates over players, a player's menu, and the chat open and shut. A shot may
  hear its events on a later frame (`at`), once a screen has put its focus where it wants it, and take more frames (`frames`) for many pictures
  to come; the page asks for reduced motion, so a screen stands settled.

## How it works

- **Roles.** Every surface plays a role, and the role says how it is painted and how it answers a press: a window
  (the carved frame with brass fittings at its corners, a grained ground, a hard drop), a panel, a button, a primary
  (the one press a surface is for, in brass), a warn (a press that costs something, its edge in blood), a tile, a
  chip (a readout), a well, a header, a footer, a rule, a rail, a track (a bar's dark trough, sunk into its edge, a
  hairline at 1 px) and a meter (a bar's fill, lit along its top, shaded along its foot, its leading edge lit, in the
  colour its surface gives it). A node takes its role by naming it (`PaintedRole`); a role no surface wears yet comes
  over from DFO's kit when one does.
- **Presses answer alike.** A button or primary is raised stone; it goes brass under the pointer or focus, sinks while
  held and goes flat when it cannot be pressed. A warn lights in blood, never brass.
- **Paint only.** The kit writes colours, bevels, grounds and shadows, never a width, padding or size, so dressing a
  surface never sizes or spaces it; only a held press sinks a pixel. Each surface's nodes give it its room, and each
  window and press the 2 px border the kit's bevel and frame land on.
- **The frame** is a 25 px square picture drawn pixel for pixel and used at 1:1: the outline, the stone bevel lit
  from the top left, an engraved line and a dark lip, with a brass fitting and its rivet at each corner. It reaches
  6 px outside its box, so it takes no room.
- **The palette** names each tone for what it is: the stone from lit to dark, the brass from lit to dark, the grounds
  and the words; and each bar's fill (`FILLS`): red, orange and yellow by rank, and the three vitals.
- **Emblems and marks** are our own pictures, drawn pixel for pixel in the palette and shown at whole multiples: the
  Grey Tithe's balance in grey stone and the pirates' skull in bone over crossed brass bones, by faction number, on
  ships' plates (a foe's plate shows its level there instead); an Elite's brass chevron and a Miniboss's two.
- **A hostile ship's mark at sea** is a port's mark in its own dress (`hostileLook`): the ship's faction's emblem in the
  ring, the ring and its arrow in the ship's rank's colour (red Minor, orange Major, yellow Elite and Miniboss), a Miniboss's
  two chevrons over it as the ship's plate bears them, the ship's name under it and under that "Hostile", its level and its
  distance.
- **Bars over figures never overlap** (`BarLayout`), but for a plate fading out of the cone, which holds its place for
  its quarter second. Each frame the nearest keeps its place over its figure, in front, and each farther one that would
  cover a bar already placed is lifted just above it. The order changes only when a figure comes 6% nearer, a lifted bar
  comes down only once it is 10 px further clear, and a bar eases to a new height, so the bars hold still from frame to
  frame.
- **Where it is worn.** The sea bar is a window, its groups
  (Navigation, Pace and Ship) parted by rails; the dock or landing offer, Take the helm and Respawn are primaries;
  the status line is a chip; the menu is a window under a header. At sea, every surface wears its role:
  - sailing: the sea bar (window, rails), the status line (chip), the place line and the hints (the on-foot words,
    outlined), the dock or landing offer and Take the helm (primary); a sighting's hostile marks wear its rank's colour
    and emblem; the status line keeps the state alone ("Under way", "Fighting"), and the sea's word (a ship
    sighted, other waters entered, who joins, colours struck, boarders away, what floats gathered, washing up) stands
    as notices, DFO's toasts;
  - the fight: the player's plate (the vitals' thin bars), the ship's bar (the Arts' rings and keycaps) and the card (the target plate), the bars (track and meter), the tally and the
    broadside warning directly under the card at the top's middle (under the compass while no card shows), never over
    the sight or the ship aimed at, written over the sea with no panel as the game's other warnings are, each captain's plate
    over its masthead; DFO's messages are notices (`plus/notices.ts`: a panel at the top right, under the status line, its right edge 28 px in
    as the chip's, its edge in the toast's yellow, three at most, sliding in from the edge in steps), and the hints the fight's keys;
  - the ship's deck: the place line (the ship's hold's take on its second line) and the hints, as on foot;
  - washing up: its notice, then the veil's own words; on land the sea's own pieces go (`seaHud.ts` `hideSeaHud`):
    the ships' plates and the sight, the readout, the sea bar, Manage's panel and the wheel's offer;
  - Manage's panel: a window under a header, each part's heading ruled, Back to the sea a button on its footer;
  - what floats: the Acquired feed's rows and the gold marks over the water;
  - the World Editor's fight: the same readout and plates over its picture, its lines in the editor's own panel.
- **Nothing covers another.** The place's name keeps left of the compass, its words wrapping before they reach it.
  A boss's bar under the compass, and ships' plates in a sea fight, take the top from the place's name, which gives
  way while they show. On foot the vitals hold the top left, so the place's name and the status line under it stand
  at the top right, the line under a boss's bar while one shows; at sea the status line stands under the compass,
  and in a sea fight in the top right corner, off the sky the aim looks at. On foot the company stands under the
  vitals, and the prompt for E stands over the Arts and weapons. The key strip stands at the bottom right, under the
  dialogue box's foot and wrapping short of the Arts and weapons; at sea it rises above the sea bar and the offer to
  dock or go ashore, and in a sea fight it keeps clear of the ship's bar at the bottom left. The task tracker stands at the right under the place's name, above the Acquired feed, and under
  the compass's column in a view 900 px wide or less; the toasts in the middle over the dialogue box's top. The key
  strip gives way while someone speaks in the dialogue box. The edge's warning stands under the compass's column.
  Where the hints grow to 22 px on a wide screen, the place line's small words grow with them ([[Game]]), so the
  water's name and holder are never the smallest words on the screen.
- **The fight's display** ([[Enemies]], [[Test Ground]]) is drawn by the game, a layer of its interface under the
  game's own windows that lets the pointer through to the world (`combat/hud.ts`); in the [[Game]] the company
  at the top makes way for it while it shows. It stands the compass at
  the top's middle with a boss's bar and the target's plate under it, as DFO's Enhanced HUD does; the vitals at the
  top left; and the Arts and weapons at the bottom left
  ([[The Vitals Go Top Left and the Arts and Weapons Bottom Left]], with Claude's choices in
  [[The Display as Claude Lays It Out]]). Its bars do what DFO's Enhanced UI Plus does with them
  ([[Pick - Enhanced Plus UI]]). It takes a larger step where the view is 1500 by 900 or more, and stands at twice
  its first size past 1440p (2400 by 1300), as the rest of the display does (`combat/hudLayout.ts`).
- **The compass** is a strip 18 px down the top's middle, 520 px wide (60% of a narrower view) and 26 px tall over a 2
  px rule, showing a quarter of the circle. Its eight points (N, NE, E, SE, S, SW, W, NW, the four cardinals at 22 px
  and the others at 11, on the face's grid) stand by the bearing the view looks at, the shortest way round; one off the
  strip is hidden, never held at an end. A brass needle marks its middle. Its column stands what comes under it 10 px
  under its rule, 56 px down: a boss's bar, then the target's plate. A view too narrow for health's bar to stand 150 px
  long beside the compass stands the whole column under the vitals instead. On foot past 1440p the whole column (the
  compass, the boss bar and the target's plate) stands at twice its size, as the corners do. At sea it marks each hostile
  ship within its own sight (5 km at the helm, farther with the voyage's pace, [[Naval Combat]], "At sea") and every
  other ship within 900 m on its top edge, a bow pointing up, at its bearing on the same quarter turn, so one
  north-east stands under NE; one off the strip is held at the end on the side to turn toward. A mark is red while its
  ship would take the player (a hostile ship, or a hostile captain in the fight), lit pale red (`#ffc2b8`) while a
  captain has a battery run out at the player, as the broadside warning names it, bone for another player's or a
  captain who is not hostile, Overlook's blue (`#2f5d9a`) for a friendly ship of the traffic, and grey once its colours
  are down; one going down has no mark. The compass hides with the view while the held map is up at the helm.
- **The vitals** stand at the top left, 28 px in and 14 down, after a souls-like display: three long thin bars, health
  over stamina over poise, each in a fine stone frame whose ends come to a point at a brass tip (`plus/barFrame.ts`),
  drawn pixel for pixel and never scaled. Health is 12 px tall, stamina 10 and poise 8, 4 px apart (16, 14 and 10, 5
  apart, at the larger step). Health's bar is 26% of the view's width, 150 to 600 px, kept 16 px clear of the
  compass; stamina's and poise's are as long as what they hold beside health's most. No words stand on health or
  stamina; poise says Iron, Staggered or Open beside its bar, and each bar is labelled with its name and its share. Health at
  a quarter or less flashes its frame to blood; stamina's lights white for a swing or a dodge asked with none; poise's
  turns brass while open. Under the bars stand the healing charges ([[Combat]], "Healing charges"):
  three diamonds 12 px tall (16 at the larger step), as far apart as the bars, each drawn cell by cell as the bars'
  frames are (`plus/barFrame.ts`), an outline over a stone line lit on its upper half and shaded on its lower, the
  inside the bars' see-through track. A charge held is whole in health's red, and the next fills from its foot by
  whole pixel rows in a pale health red as the player's blows fill its meter. A diamond brightens in two steps over
  0.4 s, near white and then pale red, as a charge is gained or drunk (not under reduced motion). A screen reader
  reads them as a meter, "Healing charges", with how many of the three are held and how far the next has filled,
  to a whole percent while the diamond fills in whole pixel rows ([[Three Healing Charges, Refilled by Blows and
  Kills]]). Whole and untouched for 4 s (health
  and stamina short of no whole point, no poise taken, all three charges held), with no buff and no foe on the target
  plate or the boss bar, the vitals rest out of sight in six steps over 1.2 s; the first point lost or spent brings
  them back in two.
- **The Arts and weapons** stand at the bottom left, 28 px in and 22 up, after Destiny's. The Arts' icons come first
  ([[Arts]], "The ability bar"). Right of them, under a thin brass rule, the weapon in hand is drawn as its forge
  picture (see "Pictures" below) in a 116 by 36 px box (164 by 52 at the larger step), laid level with its point or
  muzzle to the right (`combat/weaponPicture.ts`), grown by whole pixels at the screen's own ratio where that keeps
  most of its size. A Ranged weapon's shots stand large
  over its capacity ("18 / 24"; at none a large 0 in the loss colour with "No ammo" small beside it); a Melee one's
  name is in its rarity's colour, and a weapon whose picture has not come (still drawing, or none to be had) says its
  name instead. Under it stands the other loadout's weapon, in an 80 by 22 px box (112 by 32), with its key (1 or 2)
  and its own shots. A weapon with an element bears its glyph just past its picture's top right, in the row's
  margin clear of a blade's point, as a gear tile bears it in its corner, 16 px in hand and 12 under it (22 and 16 at the larger step), and its row's words name the element. The rows
  change weapons as the fight's rules take them up, only at rest: one pressed, or put
  away, during a swing, a guard, a draw or a reload waits with the hands until it ends. A swap trades the two rows over
  its 0.4 s, and a swap pressed during one trades them again from
  the start; a reload fills a line under the count, a weapon drawn flashes for 0.3 s, and one put away dims and greys
  its picture and words over the row's own dark band. In a view too narrow for the vitals beside the compass, the
  weapons stand over the Arts, so the corner keeps clear of the view's middle and the hands drawn there
  (`combat/weapons.ts`). The display is built afresh each frame from what its pieces keep; an arrow at the edge keeps
  clear of the corners where they were laid the frame before, and reads the HUD's key strip only while it shows.
- **Status icons** ([[Combat]], "Statuses"): each a 12 by 12 pixel glyph drawn as the elements' are, in its element's
  colours (Crit a burst and Linked two rings in Blaze; Expose a diamond cracked through, the mark the Arts' fragments
  give it, and Veiled a crescent in Cosmic; Charge a crackling bolt and Haste two chevrons in Volt), over a thin line
  in the element's colour that shrinks from the most time it held since it began or was refreshed. Each is labelled
  with what it is and the whole seconds it has left. The player's buffs (Crit, Haste, Linked, Veiled) stand in a row
  under the vitals, 24 px each (36 at the larger step) and 6 apart, and keep the vitals awake while one holds. A
  foe's debuffs (Expose, then Charge, or the Charge's immunity as a faded Charge) stand beside the bar of each of its
  plates, 24 px each: over a figure the row keeps its size as the plate shrinks with distance, so it never reads
  smaller.
- **A bar's losses.** After a loss a strip holds where the bar stood for 0.55 s (1.2 s at most however the losses
  keep coming), then drains at 70% of the bar a second: on a vital it is the bar's own colour, faint; on a foe's or a
  ship's, pale. A frame that takes a real bite (1.5% of a vital, 0.5% of a foe's health, 1% of a hull) breaks the
  span off as a piece that falls in two halves, each in eight hard steps to its turn and eight more down and away,
  fading (0.56 s, 0.64 s); two pieces fall in turn, so blows in quick succession each have their own. The vitals'
  health and stamina, the target plate, the boss bar and ships' plates break pieces off; the plates over figures and
  the poise do not.
- **The target plate** shows the foe the player is fighting: the one their blow last reached (of several struck at
  once, the soft lock's foe, else the first struck), the one their soft lock takes, or one beginning a telegraphed blow
  at them (unless they struck another in the last 2 s). It stands 6 s
  after the last of these, fading over the last 1.5 s, and goes at once when the foe dies; never the Boss the boss
  bar shows. It remembers the health it last showed of each foe, so one turned back to loses from where its own bar
  stood, and one first shown is taken as whole, the plate coming with the first blow. The boss bar remembers its
  Bosses alike, but takes one it first shows as it finds it, as it comes before any blow.
- **The poise track**, a thin bar under the target's and the boss bar's health: the poise filling toward a break in
  brass; an iron blow wound up, full and hatched in red, "Iron"; staggered, full and white, "Staggered" ("Charged"
  for a Charge), flashing as the foe it shows breaks and never as the plate turns onto one already staggered; open
  after a blow that found no one, a brass edge, "Open". With nothing to say it keeps its room unseen.
- **A foe's shield** ([[Gear]], "Elements and shields") lies over its health on every plate (over a figure, the
  target's and the boss bar), as DFO's Enhanced HUD laid a boss's ward: from the bar's left end, as long as the share
  of the foe's whole health it holds still, lit along its top and dark along its foot in its element's colours, Blaze
  orange, Volt blue, Cosmic violet (`wardOf`). It is gone once broken. What it takes from the player's own blows is
  said in its element's colour; a blow it holds whole fills no poise, so the poise track says nothing of it.
- **Plates over figures are never overbearing**, and few show at once, after Destiny's ([[Fewer Plates Show, Sized by
  Rank, After Destiny]]; Claude's calls in [[Plates as Claude Shows Them]]). The cone round the crosshair shows one
  plate (`aimedFoe`): the foe whose body the crosshair is on, the nearest of them if several, so a foe behind another on
  the line never takes it; else the foe in sight nearest the crosshair, measured to the nearest point of its body, feet
  to head and its breadth round (`bodyDegrees`), whole within 4 degrees and none past 6, easing in and out over 0.25 s.
  Another foe takes the cone only once the crosshair is on it, or it stands a degree nearer, or the cone would show a
  quarter more of it, so two side by side, or a view wobbling between them, do not trade it. When the foe at the
  crosshair is already fought or locked, the cone shows no other foe's plate; a Boss there takes the cone too, and shows
  none over its head. The foe the soft lock holds shows wherever it is, and so does a foe the player traded a blow with,
  for as long as the target plate would stand from that blow, fading as it fades (`foughtShare`); being the target
  alone, a foe winding up at the player or one the lock let go, holds no plate. A plate new on the screen starts at what
  it should show, without easing in: past the cone it starts hidden, at the cone's edge or in a fought plate's fade it
  starts at that share, and otherwise whole. A plate fading out of the cone holds its place and lifts none over it, so
  the one taking the cone stands where it will stay; for that quarter second the two may overlap. The words of blows
  keep clear of the plates drawn, never of a foe with none, and a word pushed down clear of a plate stays down as the
  plate goes. A plate shows for no foe farther than 60 m across the ground, nor one whose head the place's blocks or its
  land hide (`landBlocks`, the line tried every 2 m, only for a foe that could show a plate or take the cone): a plate
  showing goes once its line has stayed blocked 0.15 s, one not showing stays hidden from the moment it is; seen again
  it comes back at once. It is whole as near as 12 m through a 60 degree lens and shrinks as its figure does farther
  off, never growing, its name never under 9 px.
- **A blow's words** stand where the blow met the body, in the face at 22 px with no box and a hard 2 px outline,
  thrown the way the stroke's blade went, its near edge 28 px from the blow (a crit's and a kill's 56; a number with
  no stroke one side and the other in turn), and kept on the screen. Each pops
  1.4 times for 2 frames and 1.15 for 2, rises 4 px every 4 frames and blinks out over its last 6, standing 0.95 s; a
  crit's and a kill's stand 1.2 s at 33 px in gold, stamped Crit or Slain beside the number. A number pushes itself
  down to stand 24 px clear of any plate drawn and clear of the words already shown. Blows by one striker on one
  foe within 0.6 s add into one number, which pops again. A number dealt in an element is in its light. What a blow
  did besides (Staggered) rides on its number as a small word, and the player's blow on a foe winding up that does
  not break it says "Holds". Stepping onto an Ammo box the room leaves lying, the ammunition full, says "Ammo full" on
  the player in plain grey, once each time ([[Gear]], "Ammo full"). A drink's heal says what it gave back ("+40") on
  the player in green, and in plain grey on another player.
- **Reduced motion.** With it asked for, no piece falls, no word pops or rises (each stands and blinks out), no edge
  blinks (it holds blood or white), no flash plays and plates over figures and ships go straight to their places. The
  compass and its marks move only as the view turns.
- **Its layers**, back to front: what stands over the world (the plates over figures, nearest in front, the parry
  rings, the words, the arrows), then the compass's column, then the veil over the whole display: blood while
  the player lies dead, plain while the link to the room is lost or joining again. The display never stands over
  the game's own windows. An arrow to a threat off the screen that would fall on the vitals stands just below them,
  and one that would fall on the Arts and weapons, or on the game's key strip, just above them.
- **Words** over the world or a fill (plates' names, the vitals' words, the veil's) carry a hard 1 px outline all
  round (a word's `halo` edge, `ui/drawLaid.ts`), as a ship's plate strokes its words, so they read over bright sky. The
  [[Game]]'s place name and key strip, laid straight on the world too, carry the same outline.
- **A foe's plate**, after the owner's reference: its level in a chip square at the left, the number half the square
  high (over a figure; on the soft lock's and the boss bar's, 22 px on the face's grid), the square empty for a foe of
  no level; to its right its name above a thin track, the meter in its rank's
  colour. Over each foe, the soft lock's (with its poise under the health) and the boss bar's are this one plate at
  three sizes. Over a figure its width and bar go with its foe's rank (`OVERHEAD_SIZES`), all 26 px tall: a Major's
  140 px with an 8 px bar under the whole name; a Minor's as wide, since "? Crossbowman" fills it in the face, but its
  bar 6 px and only three fifths as long, still a row of its red and of a shield's colour when drawn at three quarters
  far off; an Elite's and up 176 px with a 10 px bar, cut in thirds by dark marks edged light, so they read over the
  fill and the empty trough alike. Ships' plates are drawn alike by the interface, at the sizes in `PLATES`: a Major's 140 by
  26 px over a figure, and the boss bar 640 px wide at most, 76% of a narrower view, its faction after its name. The soft lock's is 340 px
  wide at most, and never wider than 76% of the view. Its name stands at 11 px and the
  boss bar's at 22, on the face's grid. A ship's hull reads its losses as a
  foe's health does, and its bar's edge flashes for a bite, whole, two thirds and a third over 0.24 s; a ship first
  seen starts whole at its bar.
- **The task tracker** (`TaskTracker`, [[Quests Get a Task Tracker, and the Placeholder Panel Goes]]) is a window naming
  the quest in its header band (11 px, in brass), the task now under it at 22 px, and the task's steps at 11: each a
  box, its words, the keys that do it on keycaps, and a count of what is left at 22 in brass. A step met has its box
  filled in brass and its words dimmed; the moment it is met its row lights in brass and settles in four steps over
  0.7 s, and a new task slides in from the right over 0.35 s. A quest hands it a name, a task and steps (`Quest`), so
  any quest uses it with data alone. It reads what the player does, never a press of its own, so keys and touch tick it
  alike, and it writes the page only when its words change. At the larger step its words stand at 22 and it is 396 px
  wide (264 below).
- **A sea fight's task**: the fight's task in the tracker says to defeat their crews, counts the ships fighting the
  player still afloat and their men, and says they need not be sunk, as the rules strike a ship whose men are gone
  or whose hull is beaten low. The ship's own state is the fight's readout ([[The Sea's Screens Wear Enhanced Plus]]). At sea DFO's messages are the
  notices; in the prologue's fight they are toasts.
- **Toasts** are chips at 22 px, the newest three, each standing as long as what it tells holds (a DFO message its
  3.5 s), rising in over 0.2 s; one already shown keeps its place.
- **The key strip** shows only the controls of what the player is doing now (`hints.ts`), in plain verbs, each its
  first key or button as bound now (the sheet has the rest) beside its words, 8 px apart, wrapping right to left, and
  always last All controls. A key stands on its keycap; an arrow key is drawn on its cap; a mouse button is drawn as a
  small pixel mouse with that button lit in brass, the wheel, a side button or a drag (the mouse with a two-headed
  arrow) likewise, each texel a pixel larger than the words' step and edged dark to read over the world
  (`keyIcons.ts`). While the pad was the last thing played, the strip shows the pad's buttons drawn instead
  (`padIcons.ts`), a stick's ways as the stick with those ways lit, and the pad's own words where they differ (a ranged
  weapon's RT fires, LT aims); a mouse's gesture the pad has no way for is left out, a drag is the right stick, Escape
  is B. On foot: with the weapon put away, draw, run, jump, crouch and the menu; a melee weapon drawn, the swing, the
  guard or parry, the dodge, the drink and the Ranged loadout; a ranged one, the aim, the fire, the dodge, the drink
  and the Melee loadout; aiming, the fire and letting go; Dusk Daggers aimed, only letting go of the first Tenet;
  riding, getting down, the gallop and the menu; hanging from a ledge, the climb and letting go, and on a wall the kick
  off too, whatever is drawn; the Arts' three while one is worn and the hands are free to cast, Shadow's first Tenet
  apart as held to aim Dusk Daggers; the held map's key wherever it can be raised, before the menu's; the click that
  takes the mouse to look round first while the mouse is free; dead, Respawn once death is told, and nothing while the
  fall plays out. The prompt for Use says what it does, with Use's key or button, so the strip leaves it
  out. At sea: sailing, the click to sail there, the helm's controls and the menu (the sea bar names its own keys); in
  Manage, the drag, the wheel and Manage's key back; on the deck, the click to look round as on foot, run, jump and Use
  to take the helm; at the map and
  choosing a landing, their clicks, Set sail and Escape; with the land's held map raised, the drag, the wheel and its
  key or Escape to close it (the pad's B); in a fight, the helm, the sails, the burst, the aim and the
  brace, and while aiming, letting go to fire (the pad's RT), holding fire, the shot and the drag. Eight entries at
  most, counted as shown on the keys or the pad: past eight, those just before All controls give way, the last first, so the menu's goes, then the map's, then
  the Arts' ([[The Key Strip Follows the Moment, and K Opens Every Control]]). Past 1440p the strip stands at twice its size
  and wraps 960 px short of the view's width, so it never runs over the weapons; a view under 720 px wide gives it
  240 px, room for its widest entry. In a sea fight, where the strip at its widest would come within 8 px of the
  ship's bar (a view under 556 px wide, with its five abilities), the strip stands 8 px over the bar instead.
- **The sheet of every control** (`ControlsSheet`) opens with its key (K, or the pad's View) wherever the key strip
  shows, except over the menu's gear screen, and its key, Escape, the pad's B or its Close press shuts it. It is a
  window of the kit over a dimmed view, over every layer the game draws but the screen's keyboard: ALL CONTROLS on its
  header band, then its groups, Move, Fight, Arts, Camera, Menus, Sea and Sea fight (`CONTROL_GROUPS`), each its name
  in faint capitals over a rule and its rows under it: the keys, then the pad's buttons, drawn as the strip draws them,
  beside a few words on what the row does; a footer band holds a line of a few words and Reset to defaults. Every key
  and button shown is as bound now, so the sheet always says what the game hears; the side the player used last stands
  bright and the other faint, and the words are that side's ("Swing; fire" on the pad). The groups stand in as many
  400 px columns as the view holds (two at 1280 by 720, one on a phone), in their order, each column near an even
  share of the rows; the words take their larger step at 1500 by 900 and up. The list scrolls inside a window kept
  16 px from the view's edges. Opening it lets the mouse go and moves the focus to the first key; while it is open the
  keys are the interface's, and Tab, the arrows and the pad move among the keys, the focused one lit in brass. A screen
  reader hears "All controls", then each key with its row's words as it takes focus, a sign by its name (Comma, Left
  bracket). While it is open no key reaches the game (a key let go still does, so none stays held) and its scrim takes
  the pointer, so nothing behind it is clicked, the held map no more than the world; the world goes on, as under the
  menu.
- **Binding a control** (`rebinding.ts`): a key chosen in the sheet (a click, Enter or the pad's A) is lit and waits;
  on a key's side the next key or mouse button binds it, on the pad's the next button, held past 0.3 s for its hold,
  or with another within 0.12 s for the two together. Escape cancels, as does six seconds with nothing pressed. A
  mouse button binds only a control that hears one: the menus, the sheet, Use, Respawn and the helm's controls act on
  a key going down or at the helm, where the pointer is free, so for them the footer says it "takes keys only"; a
  button past the fifth is no key, and the slot waits on. Every other control acting with the key in the same place
  (on foot, dead, in a window, at the helm or in a sea fight; `binds.ts`) gives it up, taking the slot's old key
  where that clashes with nothing it acts with there, and the footer says "Swapped with" them; where one would be
  left with nothing, the binding is refused and the footer says that control "needs it". No two controls that act
  in one place ever share a key. Reset to defaults binds every control as it came. A mouse's gesture (the click to
  look or to sail there, a drag, the wheel), Tab, Escape, the arrows on the menu's tabs, the pad's sticks and their
  ways and the pad's buttons in a window (the cross and left stick, A, B, the bumpers) are written, not bound, and
  never given in a swap. What the player binds is kept with their account ([[Accounts]], "Binds").
- **The pad** (`pad.ts`, `Input`) is read each frame through the browser's Gamepad API, the first pad with the
  standard mapping: a stick at rest inside a 0.2 lean is still, and leant past it moves as far as it leans (the walk,
  the helm, the look); a trigger is pressed past 0.3; a stick's way counts as pressed past half its lean. Its layout is
  Destiny's as the owner chose it ([[Every Control Can Be Rebound, and the Pad Plays as Destiny's]]): on foot the left
  stick moves and its click runs until the stick comes to rest, the right stick turns and looks, RT swings and LT
  guards or parries (a ranged weapon drawn, RT fires and LT aims, in every fight on foot: ashore, on a boarded deck
  and in the story), A jumps, B tapped dodges and held crouches, X uses,
  Y draws or sheathes, LB and RB cast the Tenets and both together the Anima, the cross's left and right draw the
  loadouts, its down drinks and its up mounts, the right stick's click changes the view, Start opens the menu at
  Character, View the sheet and View held the game's menu; dead, A respawns. At the helm the left stick steers, sails on
  and heaves to; A sets sail, lands or docks, X stops or resumes, the cross's left and right slow and speed, its up
  opens the map and its down repairs (walking the ship's own deck too), Y manages the ship, B leaves the helm, and at the map or a landing B steps back.
  In a sea fight the left stick steers and sets the sails, its click bursts, LT aims, RT fires, LT let go unfired holds
  fire, the cross's left and right change the shot, B braces as it goes down and while it is held, X boards, and the
  right stick turns the view; a tap presses and lets go in one frame. A button with a hold bound where the player is
  (on foot, B's crouch) waits to be told a tap from a hold, and one of two bound together waits 0.12 s for the
  other, so one press never does both. In a window (the menu, the game's menu, the sheet, the story's creation) the
  pad's buttons are the window's: the cross steps the focus, the left stick moves the pad's cursor, A presses (at
  the cursor while it is out), B steps back, Y and X press at the cursor, the right stick scrolls, LB and RB turn the
  menu's tabs; a button held as a window opens or closes is stale until it is let go, so the press that
  changed it acts on nothing more, and what it held is let go at once, as is a stick let go under the window, so
  nothing stays held once it closes. The story's tap to start takes any of the pad's buttons, and A takes the stranger's hand.

- **Manage's panel** is a window at the right under a header naming the ship. Each part's heading is a rule; Back to
  the sea stands on its footer. It is built again only when what it
  shows changes.

## The face

Every word on the game's pages, the Test Ground's and the editor's is set in Pixelify Sans, Enhanced Plus's own face
([[Pixelify Sans Is Overlook's Font]]), served with the page. It draws sharpest at whole multiples of its grid, 11 px,
so every size is one: 11 for words, 22 for names and titles, 33 to 66 for the numbers that lead a page. Letters stand
1/22 of their size apart (3/22 for labels, 5/22 for titles), each word a little more than the face's own space, each
rounded up to a whole pixel, with no kerning and no ligature. Where the menu is wide, the Character page's labels, the
banner's numbers and the footer's keys stand at 22. It is set at one weight, 500, so emphasis is in size and colour; it is never slanted, as
it has no italic. Shadows under it are hard, a pixel's step.

Six of its glyphs misread and eleven symbols are missing, so a second face, listed first, stands in for just those
([[The Face Is Mended Whole, and the Gauge Counts Upgrades]]): a 2, a 5, a B, a Z and square brackets, and the
rarities' diamonds, the map's house, triangles, skull and anchor; and the marks Pixelify draws in half cells, which a
reading of its whole cells garbles (the at sign, equals, tilde, asterisk, caret, semicolon and the straight quotes).
Each is drawn in `face.ts` as rows of cells on Pixelify's grid at its weight, and the interface draws those cells
where it would read the face's own (`ui/glyphs.ts`). The held map's lettering, which a 2D canvas writes, has them as a
font made where the face is read (`useMendedFace`, `trueType.ts`), first in its stack, so nothing generated is kept.

## The menu

A screen over the game, after Destiny's ([[The Menu Follows Destiny, the Vault and Vendors in the Social Space]]):
the tabs Character (I), Inventory (O), Journal, Ship, Social, Guild and Settings fill the top of its header, each a
whole number of pixels wide, their words at the names' size (the words' under 1100 px, where they would not fit);
keys on keycaps where the menu is wide enough; Guild
marked Later, a page saying what it will hold. The chosen tab is a lit brass press; the arrow keys move
between tabs. At the top line's right stands the account's mark, after DFO's
([[The HUD Drops Its Room Line, and the Account Mark Comes From DFO]]): a round well rimmed in brass with the player's
face in it, a hooded silhouette until their figure is drawn, and a gem on its rim, filled for an account kept with a
username or Discord and hollow for a guest's; pressed, it opens Settings. On the Journal its place is DFO's timer
hourglass in a sunk well, edged in brass under the pointer, which stands turned over while its timers are down;
pressed, or T, it drops the timers from the Journal's top
([[The Journal Holds the Quests, the Bounties at Its Side and the Timers at Its Top]]). Under them, the whole width of
the menu, stands the player's banner
([[The Menu's Tabs Fill Its Top, Its Banner Under Them]]): their emblem drawn to the banner's width at three times its
cells, so it is never cut off, their name, level, Prestige and Defense over it, and their Aurem at its end, left blank
on the Inventory, which shows it. Once shown it stays, though the room's word goes; only its numbers wait for it. It opens with a short
stepped rise; the world behind is dimmed, the pointer is free, the game's keys and the HUD under it rest, and the
focus stays within it, marked in white. Its window is modal: Tab, the arrows and the pad walk only its presses, and
Enter presses nothing under it; Escape or the pad's B steps back. A focused press that goes (dismantled, worn, sold,
moved) gives the focus to the one beside it, else to the chosen tab. On a screen past 1440p the menu, its cards and the HUD's words stand at
twice their size, the 1280 by 720 layout doubled. Escape steps back: a page's own step first (the Roster's panel, a player's
details), then an item's page, then a slot's flyout, then the Art's screen, then the menu; with the room lost none
of those is shown, and it closes the menu. A tile the focus is given back to (an item's, the Art's diamond) is
forgotten once it has it. Gear shows as the
player's room last sent it ([[Gear]]), built again only when that is new or the player moves within the menu, and
never while a press is held. Each press is an ask the room answers.

- **The footer** is one: the room's answer to the last press, read aloud as it comes, then what the presses and keys
  do here; at its right an item's presses on its page, Back while a flyout is open, else Close.
- **Pictures.** Every item is drawn from the forge: the figure dressed with it, less the figure without it, cropped. A
  loadout is the forge's large picture of what its hands hold
  ([[Weapons Are Forged Large for the Weapon Rows and Gear Screens]]): the right hand's level, its business end to the
  right, and a shield or a pair's second behind it at its left, at three quarters of its size, its middle on the
  first's top edge a fifth of the way along it. Each is dyed as the figure's layer is, a faction's colour too, and
  snapped to the palette; a greatsword shows its metal's sword. Until every piece in hand has a large picture, a
  loadout in one hand is its own layer drawn alone in the pose that holds it, so no hand hides its grip, and one in
  both (a pair, a weapon and shield) is what the figure gains holding it, on guard. Each is fitted to its place as
  Enhanced Plus fits its icons, and one larger than its place is shrunk by an area average, each screen pixel the mean
  of the pixels it covers, a weapon's large picture then cut at half cover and snapped to the palette again; an icon
  long and thin (a blade, a staff, a gun) is laid on its tile's diagonal, as Destiny lays weapons, so it reads. Where
  the forge draws nothing of a piece, its slot shows its name's initials. A Vestige is its crystal, still and turned
  broadside, 18 pixels square (12 where it is drawn at 24), its halo see-through ([[Gear]], "Drops"). Each island's
  resource, the Ammo box and the Ammo crate are baked from Blender models at 18 cells, each resource mostly in its
  island's colour ([[Item Pictures]]). Currencies, nodes and elements are small pixel glyphs drawn by hand. The ship's
  glyphs are 24 by 24, as the Arts' emblems are, so a module shows a picture where a piece shows the forge's: its
  materials and modules baked as the resources are, its officers' posts drawn by hand, all lit from the top left. A
  baked or ship glyph shows only at whole multiples of its cells (36 for 18; 24, 48, 96 and 264 for 24).
- **Rarity** ([[Vestiges Are project-final's Crystals, and Physical Pictures Are Baked]]). Normal white, Magic green,
  Rare yellow, Legendary red, Atheric cyan blue; a Normal piece's frame is the kit's plain stone. A tile is Enhanced
  Plus's dark well, its bevel in its rarity's tones and its glow sunk inside; a card or page takes its rarity's band;
  pips mark it.
- **An icon shows its item's state, not words** ([[Text Is Plain]]): a weapon's element as its glyph in the top
  corner; a green gauge along its foot that fills as its nodes are bought ([[The Face Is Mended Whole, and the Gauge Counts Upgrades]]); and, once every node is
  bought, a gilded frame in place of the gauge, as Destiny 2's masterworks are.
- **Character.** The player's figure large in the middle, under two plaques side by side
  ([[Prestige Stands Beside Level on the Character Tab]]): the level in brass, "of 30" under it, and Prestige in pale
  steel, each armour piece's share under it (head, torso, arms, legs), and under both the meter to the next level and
  what it takes; under the figure the Melee and Ranged loadouts' Attack, Defense and Fruit of Dagon. The Melee and Ranged loadouts, the cloak and the
  Appearance button stand to its left, under the worn Art's diamond, the armour to its right, each slot its item's picture with its
  names, the worn Art's diamond first, under the Weapons heading, so each row stands level with the armour's across from
  it; under the Ranged slot's, the ammunition left of its capacity ("Ammo 18 of 24"), or "No ammo" in the loss colour,
  at 22 where the menu is wide. A kind is named as the screens name it: Sword & Shield, Double Daggers, Great Axe. A
  slot's card shows as the pointer moves over it or the keys bring the focus to it; a click opens its flyout of the nine
  it may carry, toward the figure, upward from each side's two lowest slots; a click there wears one, and F held over
  one dismantles it. A flyout closes once the mouse is off its slot and itself, a strip over the gap between them
  keeping it while the mouse crosses, or on a click or Escape; a key's focus in it goes back to its slot.
- **Appearance** ([[The Character Page Opens Appearance From an Icon Button]]). Among the slots stands the
  Appearance button: a wardrobe mark (a coat on a brass hanger) with the worn emblem's sign in its corner. It opens the
  Appearance screen in the page's place, as the Art's diamond opens the Art's screen, the focus on the worn emblem. At
  its left the display: the player's figure turning a view every 1.2 s through the forge's five views and their
  mirrors (still with less motion asked for), in the dye worn, and under it their horse from the side in its coat and
  barding. At its right, under engraved headings counting what is kept, EMBLEM (five a row) and DYE, COAT and BARDING
  (eight a row), every one of the catalogues: kept pieces lit and worn with a click or Enter, the rest dim, each card
  saying how it is had ("Sold by the Tailor.", "Reach the Lamplighters' second rank."); the worn one of each kind in
  brass with a brass corner. A dye's tile is its ramp over a cuirass, a coat's a swatch, a barding's the horse's head
  and chest wearing it, cut from 4 to 16 texels over the bare horse's ears so a crest shows and the head stays in;
  the Tack's barding tiles are drawn the same way. Hovering or focusing a dye, coat or barding shows it on the display before it is worn; after the pointer leaves,
  a piece keeps its preview only if the keys focused it. The display keeps the figure's pictures without coat or
  barding and the horse's without the dyes, 96 at most, letting go of the least lately shown. Escape
  goes back to the button. On a screen 800 px tall or less the tiles are 52 px, so every row shows at 1280 by 720.
- **The card.** An item's name on its rarity's band, its kind, pips and element, its picture, its main number large,
  its level, its chosen traits, its words, and what it changes over the piece it would replace, each number's meter
  with the gain or loss in green or red. Along its foot what its presses do. Where the menu is wide, every card's words
  stand at 22, as the menu's labels do, in a card 440 px wide. It shows only for a pointer that moves or a focus the
  keys moved: a page built anew under a resting pointer, or a focus a click left, opens none over what the player
  looks at.
- **An item's page** lies over the menu, as Destiny 1's weapon page does: its name on its rarity's band, its kind,
  level, pips and element; an Atheric's two perks first, under "Atheric", for a weapon and a module alike: its
  intrinsic, marked always on, and its own node's perk, marked and dimmed until it is chosen, never listed again among
  the perks; its words, in a column 380 to 660 px wide (880 at the larger words); its main number large over a meter
  of it; what it changes over the piece worn; the perks its chosen nodes give, a perk that gives and takes with its
  cost on a line of its own in the colour of a loss; and its node grid. An item's card names an Atheric's intrinsic
  first among its perks. Each node is a tile of the kit's stone with its kind's glyph:
  sunk while locked, a ring inside it lit as far as the item has grown toward it; glowing when it can be bought; its
  glyph brass once bought; set in brass when chosen. A node is bought by holding it and one bought is chosen by a
  click. To the right, the item drawn large on a lit floor. Its presses go to the footer: wear it, take it off, put
  it in the vault or take it out (at the vault's counter), and, held, feed it a Fruit of Dagon or dismantle it.
- **Inventory.** Aurem and the Shapes held along the top, each named under its count; under it the Vestiges carried, "Vestiges 3/10" over ten places
  in two rows of five, as Destiny 2's engrams stand, an empty place a dark Vestige, a click opening one at the Mage;
  then shelves, each counting what it holds: Consumables, and Materials, the Weapon and Armor Fragments and Essence
  first, then the islands' resources. Each shelf is a grid as Destiny's is: each thing a stack in a cell with its count,
  shown only while one is held, then empty places to the end of its row of ten. Consumables holds the Fruit of Dagon and
  the Ammo crate; the crate is held ("Hold to fill your ammo") to fill the Ranged weapon's ammunition, and offers
  nothing at full. The gear is on the Character page alone.
- **Holds.** What cannot be undone is held. As a press is held, what it acts on charges: a wash of its rarity rises
  through a tile, and its picture brightens and quivers toward the end, as Destiny's dismantle does. A piece is held
  longer the rarer it is: 0.6 seconds for Normal up to 1.8 for Atheric. Once it acts, a dismantled piece breaks
  into shards of its rarity and a fed one gives off a ring; let go early, nothing happens. F dismantles the carried
  piece last pointed at or focused; with Ctrl, Cmd or Alt it is the browser's key. Moving the pointer off the piece,
  or leaving the window, lets go.
- **Acquired.** What the player gains shows at the right of the screen, in play and over the menu alike, as Destiny
  shows a pickup: a row each, its picture in a well of its rarity, its name and how many; every dye, coat or barding
  newly kept among them. Rows slide in, stay four
  and a half seconds and fade; a gain like one still shown adds to its row; six stand at most. Each batch chimes
  once, for its rarest gain. Over the menu the rows stand low, above its footer and under a hover card. A room's first
  word on the gear is not a gain, nor what changes in the ten seconds after it, while the player's own character is
  claimed. Ammunition an Ammo box gives back shows as "Ammo" and its shots, and Ammo crates gained as theirs; a crate
  used is spent, not gained. Letters newly in the mail show as one row, "Sent to the mail" and how many, under the
  Postmaster's mark; a letter taken is not a gain, though what it held is.
  Currency, XP, each faction's reputation ("Reputation") and an Art's XP ([[Material Nodes Stand Where They Are Dressed, Worked by Holding E]]) stand as short
  lines over the rows, as Destiny shows them: the count, its word where the icon alone is not enough, and its icon,
  with no band; five stand at most, apart from the rows' six, so a kill's lines never push its drops out. An Art's
  level, a fragment of its Core, the ship's materials and a module gained are rows. Prestige is not a gain: it is
  what the armour worn is worth. At sea the feed reads the gear the sea sends (`Sea.gear`), which the menu there does
  not show: what a piece gathered held, the ship's XP from a sinking, an officer won, and a boarder's kills.
- **The ammunition counter.** While the Ranged loadout is drawn, its shots left stand beside the crosshair whenever
  that shows (aiming, or in first person, the pointer held or not), counted as the fight's rules count them on the
  player's own fighter, so a shot takes one at once: 22 px with the HUD's outline, in brass at a fifth of the capacity
  or less, and "No ammo" at none, in the loss colour. Whether the Ranged loadout is drawn is read from the outfit
  shown.
- **Sounds.** Every control makes a sound: a tick as the pointer or the keys reach it, a press, a step back, a tab
  turned, the menu opened and shut, a hold's charge rising, a dismantle, a feed, a gain's chime by its rarity, a
  refusal. Each is the owner's pick on the sound sheet ([[Sounds Come From Freesound, Judged on a Test Sheet]]): the
  tick, press, step back, tab, opening, close, dismantle and feed are recordings from Freesound, listed with their
  credits in `content/audio/sounds.json`, kept on R2, levelled to one peak and one loudness, and silent until each has
  come; the gains are the synthesiser's Brass bells, one bell for a Normal or Magic gain, a rising run for a Rare, a
  longer run over a held chord for a Legendary or Atheric; a hold builds up as the synthesiser's Shimmer, high thin air
  swelling over the hold and glinting faster toward its end; the refusal is the synthesiser's low double buzz. One
  listener hears every press, as DFO's does. Nothing sounds before the player's first press or key, as
  browsers ask.
- **Journal** ([[Activities]], [[The Journal Holds the Quests, the Bounties at Its Side and the Timers at Its Top]]):
  - **The quests** are the houses' roads ([[Quests]]) as story missions: the opening, walked from the start, and each
    house's road the player walks, each at its task, and each road done, in the roads' order. They show as cards six a
    page in two columns (one under 900 px); how many show stands beside the title, and the page between its drawn
    arrows at the head's right; a card alone in its row keeps its column's width. Each card shows its banner, sixteen
    by twenty-four: a story mission's swallowtail pennant in blood and brass, charged with a star, a crown, a
    watchtower, an anchor, an open eye or a ship, one to each road by its place in the roads' file, so no two roads
    wear the same (a side quest's shield, its field stone, plum, sea, moss, ochre or slate, charged with a lozenge, a
    key, a fish, a sheaf of wheat, a hammer or a compass rose, is drawn for quests of other kinds). Then its name, the
    first line its opening scene says as a line of its tale, and its task's number in a brass badge with the task's
    words, the last task with a brass tick once the road is done. The keys' focus edges a card white. A name too long
    for its card is cut short there and read whole to a screen reader with the rest of its card. With
    none to show (before any room's word, or a word not on the player's own character), it says why, the two banners
    resting over the line.
  - **The bounties**: six slots three to a row under "Bounties", with how many are taken. A tile bears its bounty's own
    glyph, sixteen square (a dagger in the Tithe's coin sack, a sword under a chevron, a pick over ore, a horned skull,
    a cannon firing, a great fish, a wolf over the swell, a torch, steps down into the dark, a lantern) on its kind's
    ground, with no words on it (a bounty not drawn wears the mark of where it counts: two peaks, a wave, an arched
    door): a gauge of its count while held, a gilded edge once done, its glyph dimmed with a drawn tick once turned in. A
    slot not taken is an empty frame. The hovered, focused or pressed tile, ringed white just outside its edge, has its
    card under the grid: its name, cut short where too long, its kind by its mark, its words, its count, and what it
    pays, XP and Aurem each by its glyph. Bounties are taken and turned in at the board alone. The column stands at the
    right wherever it fits beside the quests, as wide as its head; on a phone (under 600 px) it stands under them.
  - **The timers** lead with icons, drawn in the gear glyphs' style (`journalIcons.ts`), and write nothing twice.
    Today's head carries the rising sun and the one countdown to the daily reset, with its moment in the player's own
    time; This week's, a page of the week and the countdown to the weekly reset; Later's, its name alone. Each row
    is its icon in a sunk well, its name and its marks. Under Today: the dungeon of the day (an arched door), each
    tier's seas (calm water, a rearing wave, a maelstrom) with this character's tick or padlock, the day's modifier's
    icon on the Elite and the Abyss seas it is on, what it pays (the Vestige glyph and a chest), and each island's
    dungeon with its levels, read down its columns, the band this character's level falls in lit; and the bounties (a
    sealed notice), their six a day said at the foot.
    Under This week: the Elite and the Abyss Dungeon of the week (their doors under a brass chevron and with a
    burning eye), each its level, its tick or padlock, the Abyss's five revives (a heart) and its wipe (a skull), its
    modifiers each by its icon alone, its name and what it does said at the foot (Burn's flame in its Art's colours,
    Brawler's fist, Marksman's target, Lightswitch's claws, Ironclad's shield, Trickle's drop, Juggler's three balls on
    an arc, Exposure's broken heart) and its pay (the Vestige
    in its rarity, Essence, the boon's star); and the Abyss boon while held, by XP's glyph. Under Later, Breaches (a
    rift). The panel's foot says in words whatever the pointer or the focus rests on, and each mark's words are read
    to a screen reader with its row as the focus takes it; the arrows step between the rows. Each countdown is drawn
    afresh each frame. The panel drops from under the hourglass, or with T, on its own ground, edged and ruled in
    brass, the focus going to its Close; Escape, Close, T or the hourglass takes it up, the focus going back to the
    hourglass, and it goes up as the Journal is left; the page under it rests, dimmed and out of the keys' and the
    pointer's reach.
  - It reads the rules and the last word of the character a room sent, so it reads the same at sea.
- **Ship.** Two parts on the inventory's shelf tabs ([[Ship Power]], [[Crew]]). Manage: the ship's papers as Manage
  shows them at sea (its hull, canvas, guns, loads and measure, its voyage while it is at sea), its materials and its
  hands, beside its power (its level, a meter to the next, its numbers) and its modules fitted and carried, each a
  press that opens its page (`shipTab`). Crew: each officer's panel, their duties (the one held lit in brass), their
  Nodes, and Hold to pay off; an officer's own page shows their perks and their nodes, and Escape steps back from it.
  With no gear it shows the papers alone.
- **Social** is the Roster, after Destiny 1's ([[The Roster Follows Destiny 1, With Blocking]], [[Accounts]], "The
  Roster"): three columns, Game, Friends and Guild, each a page of fourteen rows, fewer where the screen is too short
  to show them without scrolling, with arrows between pages; its empty rows kept so each column keeps its length. Game holds invites to a company, then the company (its leader marked with a
  gold corner, or the player alone, who leads their own), then those in the same room; over it the company's privacy.
  Friends holds those asking, then friends playing, those asked, and friends away; over it a press to add a friend.
  Guild holds its members playing, then away, each with their rank, then those invited; over it the guild's name, motto and presses, or, with none, a
  press to found one and the invites. Each row is a player's emblem and its nameplate behind their name and tag, at
  twice the emblem's cells; one away is grey and bare. A long name gives way before its tag. Choosing a row opens a
  panel beside it, or over it near the page's foot: who and where, then all that may be done with them, what cannot
  be undone held and saying so ("Hold to …"), blocking and reporting apart under a rule. A member of the company
  playing elsewhere can be gone to. Details shows another player's nameplate, guild, power and
  worn pieces. A join goes to them if they are on foot on this landmass, unless the player is in a fight at sea or
  has fallen; then they go to them once it is over. The Roster is asked for again every 15
  seconds while it is seen.
- **The company on the heads-up display**: each other member's nameplate under the place's name, with where they are,
  and an invite waiting; it stands over the veil, so the company shows while the player travels.
- **Settings** holds the account ([[Accounts]]): whether the player is a guest, signed in, or linked with Discord; a
  username and password to keep a guest by or sign in with; Discord; and signing out, here or everywhere, each held.
  Under it, the players blocked, each with a press to unblock them; then the volumes of the interface, the world
  ("World sounds"), the music ("Music") and the [[Ambience]] ("Ambience"), each kept in this browser, and the recorded
  sounds' credits: each one's name, author, licence and source, and what was changed.
- **Motion** runs in steps, as Enhanced Plus's sigils breathe. With less motion asked for, only a hold's fill and
  wash move: no quiver, no shards, and the gains appear without sliding in.

## World sounds

`WorldSounds` (`combat/worldSounds.ts`) watches the fight and the walkers each frame, on foot and on the [[Test
Ground]], and plays each world cue of `content/audio/freesound.json` where it happens. A cue plays once the owner has
picked its recording on the sound sheet ([[The World Sounds From the Sound Picker]]) and it is in
`content/audio/sounds.json`; until then it is silent, with no synthesised sound in its place. A pick is Freesound's,
put in by `tools/freesound/publish.py` through the `freesound` workflow ([[Code Map]]), or one of DFO's own, by
`tools/freesound/own.py` ([[DFO's Own Sounds Join the Sound Sheet]]); a cue with several files, as the steps have,
plays any but the one it played last. The Duskraven plays its raven with a fire of its own under it ([[The Duskraven
Sounds With Fire Under Its Raven]]). Which cue a moment calls for is chosen by pure rules (`combat/worldCues.ts`):

- **Blows.** A swing as its blade sweeps to its blow, started so its recording's loudest 20 ms meet the tick the blow
  lands (never before the swing begins, and not once a dodge or a flinch has cut it short), or as a foe's wound-up blow
  lands: light (fists, a dagger, a sword, a mace), heavy (a flail, an axe, a warhammer, a greatsword) or a staff's.
  A blow that lands cuts (a dagger, a sword, an axe, a greatsword) or strikes blunt (the rest, and a gun's ball); an
  arrow or a bolt strikes as itself. A crit, the element a blow bursts in and an elemental kill's finisher sound over
  it; a spell's blow is heard as its spell. A blow met by a shield or by a blade, a parry, a guard broken, a kill, a
  foe's shield struck and broken.
- **Arms.** A weapon drawn or put away (the player's and other players'; foes stand armed). A bow drawn, each shot by
  its weapon (a braced pair fires twice), a crossbow wound, a gun loaded, and a click when the player fires a gun with
  no shot left. Where a shot stops: a ball on stone, an arrow in the ground, any shot in water; on a body, the blow.
- **Moving.** A footstep each 2.5 m walked, in time with the first person's bob, never mounted: on wood (the Test
  Ground's crate), on a block (the city's stone), in water (land below the sea) or on the ground. A jump as a body
  rises, a landing after a fall of 0.6 m or more, and a dodge's roll.
- **The Arts.** The player's own Anima gathering as it is cast; each spell as it first appears, an Anima with its
  Art's release, once a cast; a Tempest orb bursting on what it sought; each Duskraven bolt; Linked and Veiled as
  they are given (Exposed, Charged and Haste make no sound: [[Exposed, Charged and Haste Make No Sound]]).
- **The rest.** A drop coming to rest, an Ammo crate used, a foe turning alert, and the player standing again. A
  drink's heal plays the same sound as standing again, as the health comes: there is no drinking sound.

Each is heard through a panner (equal power, fading with distance past 2 m, none past 40 m), the listener at the eye
facing its yaw. At most 16 play at once: the farthest gives way to a nearer one. One fighter's cue plays once in
0.1 s, and a step, a swing and a blow stray up to 4% in pitch. A figure first seen makes no sound for what it was
already doing. In the game they play through the interface's engine at the World volume, beside the interface's in
Settings (80% at first); nothing new plays while a menu is open on foot or the page is hidden, and nothing at sea.
The Test Ground makes its own sound at full volume on the first click into its view.

## At a dungeon's entrance

E at a dungeon's entrance ([[Game]], "A dungeon") opens a card drawn in a window of the menu's kit, in the middle of
the view (`EntranceCardView`, a layer of its own over the menu's), its words as large as the menu's on the same
screen: the dungeon's name in its header; under it the run's tier and level ("Elite seas · Levels 3 to 6", "Elite
Dungeon · Levels 1 to 4", "Elite Dungeon of the week · Level 26"), its rules (an Abyss run's revives, and the Abyss
Dungeon of the week's "Never matched. Bring your company."), its modifiers each led by its icon as the timers draw it,
with what each does, and what it pays, "Taken today" or "Taken this week" once this character's record holds it; why
it is shut, in its gate's words, if it is; and Enter (E) and Close (Esc) on its footer, Enter resting while it is
shut. It reads as the Journal's timers do ([[Activities]]),
built again as the minute or the character's word changes. While it stands the world is dimmed, the pointer is free
and no key of the game's or the menu's acts behind it. It goes if the player falls, goes into a dungeon or leaves
the place.

Where the run is matched (an Elite Dungeon at Normal, or the Elite Dungeon of the week), it is open, and the page is
signed in to the accounts, Find a Company (F) stands on the footer beside Enter. While it finds, the card shows
"Finding a company · 0:23", counting up, and "A run starts with four, or with fewer after a minute.", and the press
is Stop finding (F). A run found closes the card and goes into it. Enter goes in alone and Close or Escape leaves,
each stopping the search. A search that ended unasked says why on the card ("You are finding a company in another
tab.", or "The search stopped. Try again."). A search for a run the card no longer opens ends, as when the week
turns while it finds; a run found just as the week turned, for a run the card built again no longer opens, is not
gone into, and the card says "The week turned. Try again.".

## How recordings load

Recordings come as they are wanted, as the owner decided areas load ([[Areas Load in Chunks With Proper Caching]]):
the short sounds of play (every cue but the ambience's and the story's) once the page's sound wakes, the ambience's and
the story's the first time each is asked for, silent until it has come (`soundSamples.ts`, `Samples`). A recording
longer than a chunk (1 MB, about a minute) is fetched a chunk at a time, a stretch of its bytes that decodes on its
own, its last part shorter than a chunk among them; as one plays, another not held is fetched at random, and each
play takes a chunk other than the one played last, so every chunk fetched is heard and a bed's minutes are never held
at once, two chunks at most. A file or chunk that fails to come is asked for again only after 30 s. The page
decodes each and keeps it; the worker holds only its shape and how it measures, its level and its loudness over each
window the game asks (`soundMeasure.ts`). What is held is kept within 192 MB, the ambience and story recordings
played least lately let go first, never one played in the last two minutes nor a sound of play. Every file and chunk
fetched is kept in the browser's own storage under its address (`contentCache.ts`): named by its hash, it never
changes, so one let go comes back from the disk. The storage holds every file the game reads from R2, within 1 GB, the
files kept longest ago let go first.

## The sea fight's readout

In a sea fight the display shows DFO's helm readout in the Plus kit, drawn by the game (`combat/seaReadout.ts`, its
words and model in `plus/seaFight.ts`), laid afresh each frame, never pressed, from the fight's first frame to its
last, at sea (`Hud.seaFight`) and over the World Editor's fight; on a struck ship's deck it gives way to the fight on
foot's display ([[Naval Combat]]). While it shows, the place's name gives way and the status line stands at the top
right; the ship's abilities stand at the bottom left as the Arts do
([[A Ship's Abilities Stand at the Bottom Left, as the Arts Do]]). The fight's panel leaves the Sloop's own hurts and
guns to it:

The plate, the ship's bar and the card are the on-foot HUD's own build, so the sea reads as the same HUD: the plate and
the card are the vitals' thin bars (`combat/barDraw.ts#thinBarNode`) with the kit's bar (`plus/meter.ts`, with its
lost strip and falling pieces), and the ship's bar is built of the Arts' bar's own rings and keycaps
(`combat/ringSlot.ts`).

- **The Sloop's plate**, at the top left, is the vitals' long thin bars, as on foot
  ([[The Sea Fight's Ship Plate Wears the Vitals' Thin Bars]]; `thinBarNode`, the one build both wear): Hull over Sails over Crew (hull red as health and at its height, sails bone, crew green as stamina, both at
  stamina's height), each as long as the vitals' health is laid for the view, stepping and doubling with the display,
  with no words inside; a reader hears each by its name and percentage. The hull's frame flashes blood at a quarter or
  less as health's does. Under them an "On fire" chip while it burns, the kit's chip, as the buffs stand under the
  vitals. In a fight the place's name gives way to the plate.
- **The ship's bar** (`combat/shipAbilityBar.ts`) holds the ship's abilities at the bottom left, where the Arts'
  bar stands on foot ([[Arts]], "The ability bar"): the same corner (28 px in, 22 up), the same rings (44 px, 66 at
  the larger step, 88 past 1440p) and gaps, each icon in a ring over its key's keycap. A reader hears it as
  "Your Ship", each ability by its name, its key and how it stands ("Port broadside (Right button), 4 s to reload").
  In order:

  | Ability | Icon | Key |
  |---|---|---|
  | Port broadside | a cannon on its carriage, facing left | the aim's |
  | Starboard broadside | the same cannon, facing right | the aim's |
  | Burst | a filled sail with lines of speed behind it | the burst's |
  | Brace | a wooden shield rimmed in brass | the brace's |
  | Load | the shot loaded: a ball (round), a cluster (grape), two balls on a chain (chain), a ball glowing red hot (heated) | the next load's |

  The rings are the Tenets' ring in brass, the icons drawn cell by cell as the Arts' are (`combat/shipIcons.ts`). An
  ability ready has its ring lit and glowing in brass. A broadside reloading is dimmed under the Tenets' dark wedge,
  sweeping clockwise away as its side loads, its whole seconds standing in it under 10 s; the side the look lays
  glows a wider gold once loaded. The burst, while it runs, is lit near white round its ring, the light draining
  clockwise as its 4 s run out, then sweeps as it recharges, counting its last seconds. The brace is lit the same
  way, whole, while it is held. An ability flashes as it is used (a side fires, the burst begins, the brace is taken,
  the load changes), its frame brightening for 0.25 s, or ringed white for 0.5 s with less motion asked for. One that
  cannot be used greys under a hatch: the broadsides while braced or once the ship is no longer afloat, the burst
  once it is no longer afloat, the brace and the load once it is going down. The keycaps show each key as bound, for
  the keys or the pad played last: a key in words, a mouse's button as the key strip's pixel mouse with that button
  lit in brass, drawn on the cap, and the pad's button as its picture; the load's is the wheel while no key steps the
  load. The bar is laid from a list of abilities (`ships/shipAbilities.ts`), so another ability is one more entry,
  and it goes with the readout.
- **The card**, centred under the compass, is the target's plate (as `combat/foePlate.ts` builds it), light and never a
  box, on the ship the look is on (while the Sloop's guns are laid, the captain nearest where they fall; else the nearest
  captain): its faction's emblem framed, its name, one hull bar in its rank's colour (an ally's blue), and as small
  words its class and how far ("Brig - 70 m") and its state: "Hostile", "Colors struck", "Colors struck - E: board"
  once it can be boarded, or "Going down". The name keeps its first three letters, cut short after them, however long
  its class and state. The ships' plates keep under it while it shows, as under the compass.
- **The broadside warning** stands under the card while a hostile captain afloat has a battery run out at the Sloop
  (the Sloop within 45° of that side's beam), written over the sea with no panel, as "Return to the area" is, in three
  large lines ([[The Broadside Warning Is Written Over the Sea, Not a Panel]]): "BROADSIDE" in blood red capitals at
  three times the words' size between two blood triangles, each round a "!", pulsing to pale every half second; under
  it the battery's tell (1.3 s, the captain's `RUN_OUT_S`) as a 4 px fuse, a red rule burning in from both ends, which
  once burnt flashes every quarter second with the title as the battery may fire; and "BRACE" at twice the words'
  size beside its keycap, "BRACED" in brass with no keycap once braced. Every captain with a battery run out at the
  Sloop has its compass mark lit; the
  nearest battery is the one warned of, and another's tell burns afresh. A reader hears it once as it comes, in one
  line: whose battery, how far and where from the bow (`bowWords`), its shot and what it does, and the brace. With
  less motion asked for, it neither pulses nor flashes; the fuse still burns.
- **The tally**, under the middle of the screen, for 4 s once the Sloop's last volley's last ball is down: "3 of 6 balls
  struck - 1 below the waterline - 2 in the rigging".

## The social space's counters

Every keeper in the social space who deals with a player, the Postmaster and Shape among them, keeps a screen, as
Destiny's keep theirs in the Tower ([[Overlook's Keepers Are the Mage, the Smiths, the Tailor, the Tack and Shape]]);
E at one opens it in the menu's window, its name where the tabs stand. The prompt names the keeper by their title ("The Mage", "Shape"). The room
serves each ask only at its own counter ([[Gear]], "In the rooms"; [[Factions]]).

- **The Harbourmaster's counter** sells the Shipwright's six modules of the day, each held to buy, its hover card
  beside it, as a keeper's wares are (`harbourPage`).
- **The muster** stands on the pledged faction's keeper's screen, under its wares: each officer offered, signed on by
  a hold; one the player cannot afford stands flat and takes no press (`musterAt`).
- **The vault**, after Destiny 1's, in the keepers' screen's right column under the vault keeper, who greets and thanks
  in lines of his own: what it keeps on the left and what the player carries on the right, each in weapons, armour and
  Vestiges, the vault's shelves counting toward their twenty. A click moves a piece across; a right-click shows its
  page. Each side lays its shelves and Vestiges as many to a row as it holds (six across at 1920x1080, five at
  1500x900), an empty place a dark Vestige, as the inventory's; the arrows move among its cells as among a keeper's
  tiles.
- **A keeper's screen** (`npcPage`), one for every counter, after the owner's Destiny 1 references: the keeper large at
  the left, from the forge in their own dress (`keepers.ts`), idle and facing the viewer, grown by whole pixels and
  breathing between the idle's two frames (still with less motion asked for), over a ground lit in their colour (a
  faction's in its Art's element, the rest brass), with their mark and their title in capitals above them. At the right
  their words, the currencies they deal in (Aurem; Shapes at Shape's; at a faction's its rank, its meter to the next and
  the materials an Art's rise takes), the band they speak in, then their wares in rows under engraved headings, each a
  gear tile held to buy, its price under it, red with "Not enough" when short, a card on hover or focus; a ware that
  cannot be asked for says why under its price (a level not reached, a pack full), and "Not enough" is only for one the
  room would sell. At the foot "Stock refresh" and the time to the next daily reset, 09:00 UTC, for the smiths, the
  Tailor and the Tack, or "Leaves in" and the time left for Shape, to Sunday 21:00 UTC: both counted in minutes by the
  room module's rules (`activitiesAt`, its `untilDay` and `untilShapeGoes`), the page taking off the seconds gone. The
  footer: Hold (Buy; Open at the Mage's), the Character key as bound (Open Character), Esc (Dismiss); while a fragment
  is chosen it says Esc (Back) and offers Back, which steps back as Escape does. Arrow keys move among the tiles, Enter
  presses, Escape steps back, and the focus goes back where it came from. In a room narrower than 600 px, as on a phone,
  the keeper stands over the rest, a third of its height, and the rest takes its whole width.
- **The keepers' rows.** The Mage: VESTIGES, those carried, each held to identify, the piece it opened to shown after.
  The Armorsmith: ARMOUR, the day's six. The Weaponsmith: WEAPONS, the day's six, and SUPPLIES, the Ammo crate with how
  many of the five are carried. The Tailor: DYES, the day's four, each a swatch of its ramp, then EMBLEMS, the day's
  six. The Tack: MOUNT, the day's four coats and bardings. A piece kept says so.
- **A faction's rows** (`factionRows`), the faction's own services first and its wares after, so a short screen scrolls
  to its armour: REPUTATION (the rank, the meter, what the next ranks keep, and each package waiting held to collect),
  PLEDGE (a press, priced when it is a switch, or "Pledged"), CAPE (the faction's cape, a Legendary cloak worn at any
  level, sold only to the pledged and not while nine cloaks are carried; kept says so), ART (the faction's Art: its
  level as five pips, its bar, and when the bar is full a Rise press with the rise's price that opens a choice of the
  fragments not owned, each said as it works at the level the rise makes; with all six owned it rises at once, "No
  fragment left to choose"), FRAGMENTS (the Art's six, owned lit, the rest with their price, dim only before the first
  rank, from which they are sold), then ARMOUR and WEAPONS (the faction's four armour pieces and two weapons as the room
  makes them, each card naming the colour it is drawn in; dim with "From rank 2" or "From rank 3" until the rank, then
  "From level 20" below the level they are made at, "Its slot carries nine" while its slot is full). The rows scroll
  under a thin bar of the menu's.
- **Shape's**: WARES, his six of the week priced in Shapes, held to buy; while he is away, "Shape is away. He comes on
  Fridays."
- **The Postmaster's** (`mailPage`), in Overlook's plaza alone ([[Gear]], "The mail"): no currencies, as he sells
  nothing; LETTERS with how many of the 50 wait at the heading's right, then Take all (a primary press) while any
  waits, or "No letters wait for you."; then each letter oldest first, a sunk well holding the tile of what it holds
  (an item's own picture, a module's or a Vestige's glyph, framed in its rarity with its pips, its card under the
  pointer or the focus: an item's as its page's, a Vestige's its slot and level), its name in its rarity's colour, the
  letter's words (`letterWords`), and Take. Where the column is narrower than 420 px, as on a phone, a letter stands
  in one column: its tile and name, its words the well's whole width, then Take at its end. A click on the tile or
  Take, or E on either while it holds the focus, takes that letter, once until the room answers; the focus then goes
  to the same press of the next letter, or the one before. A letter there is no room for stays, the footer saying why,
  and he speaks only to thank. The footer: Click / E (Take).
- **What they say.** As the screen opens the keeper greets the player in a line of their own, typed and voiced in
  the band as [[Speech]] types and voices the dialogue box's; after a ware bought they thank them, and after a
  refusal for want of the price they say so ("Not yet, dear. Come back when you can. I will be here."). Each line is
  a scene of `content/story/keepers.json`, said in turn, held to [[Dialogue]]. Once typed whole, the line is read to a
  screen reader from a polite live copy, as every line of the dialogue box is; the currencies are read with their
  names.
- **The bounty board** in Overlook's plaza, which no keeper keeps and over which stands its gold "!" ([[Game]], "Over
  what a player can use"; [[Activities]], "Quests and bounties"), after
  Destiny's Bounty Tracker ([[The Journal Holds the Quests, the Bounties at Its Side and the Timers at Its Top]]): one
  line, "Bounties for XP and Aurem, posted each day."; the day's six as tiles, a row to each kind (land on stone, the
  sea on deep water, dungeons on old blood), each its bounty's own glyph at four times its pixels (six where the
  menu's words are large), showing its state with no words, the chosen one ringed white; under them the rising sun
  and the time to the next board, over a bar filling as the day goes; and beside them, or under them on a phone, the
  chosen tile's card: its name, its kind by its mark, its words, a gauge with its count, what it pays
  the player now (XP and Aurem each by its glyph, resting once paid), and its press, Take on one not held or Turn in on
  one done, with E on its keycap, each asked with the day of the board shown. The arrows move between tiles; E or a
  click takes or turns one in. Before the prologue the tiles, the time and its bar rest grey, and the card holds the
  padlock and "The bounty board opens after the prologue."

## Players

- **A plate over each other player's head** ([[Other Players Wear a Nameplate, Their Level or Prestige in a Square]]):
  a square and their username beside it, after the owner's pictures of Destiny's. The square shows their level, 1 to
  19, and from level 20, the most XP gives, the Prestige total of the armour they wear (`squareNumber`); while a menu
  is open on their screen (the pause menu, the menu's window, a player's menu or Inspect) a speech bubble's three dots
  stand in its place. Square and name are the company's green (`FILLS.green`, `TONES.company`) for a member of the
  viewer's company, by the Roster the company's display last heard, and the players' blue (`FILLS.ally`,
  `TONES.ally`) for anyone else; a guest shows the square alone. The room sends each plate once as it changes
  ([[Server]], "Messages").
- **Which show**: as DFO showed names over players, every other player within 60 m across the ground whose head the
  place's blocks and land do not hide, the line tried as a foe's plate's is (`PlateSight`), shrinking with distance by
  the foes' plates' law (`plateScale`) and laid so none covers another (`BarLayout`); not the cone the foes' plates
  keep. They stand under the foes' plates, 1.9 m over the feet.
- **Interact** ([[Holding Use on a Player Opens Their Interact Menu]]): the named player the crosshair rests on within
  6.4 m of the player's own feet, the nearest of several (`aimedPlayer`), a guest nearer in the line hiding one
  behind, wears a thin diamond round their body, a chevron in each corner, with Use's key and "Interact" beside it,
  kept on the screen, wherever Use offers nothing else and no menu, gate's offer or the held map is up. Holding Use
  0.45 s, its key ringed as it fills and the menus' hold sounding, opens their menu; a tap does nothing. The hold
  outlasts the crosshair slipping off them for under 0.2 s, and lets go if the frames stop for a quarter second.
- **Their menu** stands over the view with their plate at its head and six rows: Add friend (or Accept friend, or
  Cancel friend ask, as the Roster would offer it), Invite to company, Invite to guild, Whisper, Inspect and Mute (or
  Unmute). Each asks the Roster as its row in the Social tab does ([[Accounts]], "The Roster"); one that cannot be
  done now stands greyed with why ("Already friends", "In your company", "Only the leader invites", "You are in no
  guild", and so on), still reached by the keys and read by a screen reader, and without a Roster (a guest, or a page
  playing alone) only Whisper and Inspect are offered. While an ask is out every row waits, and what it answered stands
  under the rows. Whisper opens the chat's field to them ([[Chat]]); Mute hides their chat lines
  ([[A Player May Mute Another]]); Close or Escape shuts the menu. While it is up the player stands as in a menu, the
  pointer free and the keys the menu's alone.
- **Inspect** ([[Inspect Opens the Character Tab]], [[Inspect Shows the Player's Emblem Banner]]) shows the player as
  the menu shows the player's own: their emblem's banner across its head, their name and guild's tag, level, Prestige
  and Defense over it, and under it the Character tab: their plate over their figure in the dress they wear here, each
  piece they wear in its slot with its card, their level and Prestige (Prestige whole, as their room keeps no piece's
  share), their power and the Art they wear, from what their room kept for others to see. Nothing on it can be asked or
  changed: no hints, no XP meter, no Fruit and no Appearance. Back or Escape goes back to their menu.
- **Settings** lists the muted under the blocked, each with Unmute.

## Emblems

An emblem is a sign 24 cells square and the nameplate it heads, 120 by 24, whose left square is the sign's own ground,
as Destiny's are ([[Cosmetics Follow Destiny, Shown in Many Places]]). Each is drawn in the page from its colours, a pattern
and a sign of up to 16 cells (`emblemArt.ts`, `emblemMotifs.ts`), never from a picture, and shown only at whole
multiples. Behind a row or a header, its band runs the nameplate on, unframed, and the colour it ends in fills on past
it; the menu's banner carries its pattern the whole way, as Destiny 2's heads its character screen. It shows on the
Roster's rows, the menu's banner and Inspect's, another player's details, the company on the heads-up display, the Appearance
button's corner and screen, and the Tailor's wares.

## Limits

- On a view under 386 px tall (a phone held sideways) the broadside warning reaches down over the sight; the sea
  fight has no touch controls yet.
- The sea fight's readout writes at the face's 11 px where DFO's wrote 10, 12 and 15, and the sight's aim line at 11
  where DFO's was 13; the laid side's soft 8 px glow stands as a hard gold
  halo round its broadside's ring; and a long ship's name on the card is cut short a little sooner, the face's
  letters being wider than the page's.
- The ship's bar holds the guns as two broadsides, where DFO's battery rose also named the bow and the stern: it
  does not show the side a blow came from, which DFO's rose outlined red, nor flash a side as it comes ready.
- The notices write at the face's 11 px, where DFO's wrote 14.
- The place line's small words stay at the face's 11 px at the larger step, where the page wrote 16, and over the held
  map at 11 (22 at the larger step), where it wrote 13 (20): the face has no step between, and 22 would stand them
  level with the place's name above them.
- The Harbourmaster's wares lay their words on one line under each tile, 6 px apart, where the page's ran together;
  the muster stays inside the keeper's side on a view 1024 px wide, where the page's ran past it.
- The World Editor's drop-downs stand a pixel shorter than a browser's. A captain's fight's readout shows over the
  land's 3D view only; the page's stayed, still, over the 2D map. The Islands mode tells the GPU's errors only for what
  it makes and draws itself, as the device is shared with the other modes.
- Drawn by the game: the heads-up display, the toasts, the fight's display, the whole menu, the story's screens and
  the held map's marks. A word's soft shade past its hard outline is not drawn, as a blur has no crisp form, nor a
  chosen mark's or a ship's mark's blur (a chosen mark's glow is a drawn
  gradient); the fight's glows (the soft lock's mark, the charged crosshair, a full Anima, a ready Tenet or ship's
  ability, the poise's break, the struck edge's red) stand in hard rings and bands instead.
- The account's username and password are the game's own drawn fields, which a browser's password manager cannot
  see. In Chromium its store is asked instead, through its credential manager (`SIGN_INS`): a sign-in that works is
  offered to be kept, and a kept one fills a guest's empty fields, the player choosing among several; elsewhere the
  player types them, and passkeys wait ([[Claude Makes the Four Points' Open Calls]]).
- Settings' volumes are the kit's drawn sliders, a brass fill in a track, where the page showed the browser's own; a
  credit's link opens its page in a new tab from a press, and the browser's own menu for a link (copy, open in a
  window) is not offered. A slider steps by its arrows only: Home, End and Page Up or Down do not move it.
- A Roster row's words and a player's worn pieces keep to their line, cut short with '...' where they do not fit,
  where the page wrapped a long status under itself. A column's arrow at its first or last page is drawn dimmed and
  takes no press, as the page's did, and in a column of one page neither takes the focus.
- A plate over a figure shrinks with its distance, but its words keep the face's 11 px, never smaller and never the
  12 px a page's plate wrote; so does its alert's mark, 15 px on a page. A blow's number pops at sizes between the
  face's steps for its first four frames, as no whole step is 1.4 times another. A ship's plate writes its name at
  the face's 11 and 22 px, where the page wrote 12 and 18, outlined a pixel round where the page stroked it 1.5.
- The small words in capitals of the fight's display and the menu (a boss's faction and phase, the poise's word,
  the weapons' counts, the menu's headings and labels) keep the face's own spacing, not the wider spacing a page gave
  them; the heads-up display's take theirs (`Text.tracking`).
- The Anima's edge frame is drawn with the fight's display, under the game's own windows; on a page it stood over
  everything.
- The fight's display tells a screen reader nothing: its labels (each vital, status, ability and weapon) wait on the
  interface speaking what is not focused.
- The drawn menu is not doubled past 1440p: the interface draws at one scale, so the menu there stands at 1280 by
  720's sizes rather than twice them. A tile's soft glow and a card's drop shadow are drawn as hard light and no
  shadow; a charging picture quivers but does not brighten.
- A boss's name strikes in by fading alone: the page grew it from 1.6 times its size, which the face's whole steps
  cannot. The tap's and the title's soft dark glows are not drawn, only their hard shadows. What each of the held
  map's seas does, a tooltip on the page, is told only to a screen reader, in the press's label.
- The creation's windows wear the kit's window, wells and presses, where the page's sheet had cleared the kit's frames
  to plain light borders.
- The tap to start shows once the face is read, a moment after the page opens; the page showed it at once.
- A screen reader hears what the game draws only in Chromium (`ariaNotify`): a toast, a new task, a broadside run out
  at the player's ship (said once as the warning appears), the prompt for E, the menu's answers, what is gained, and each press's label as focus reaches it.
- One look, DFO's Slate. Its other themes (Stone, Iron, Ember, Forest, Night) wait on a settings screen to choose
  them in.
- The [[World Editor]] and the [[Test Ground]] keep their own panels' layout, in the game's face: they are tools, not
  the game's screens. The Test Ground's drop-downs, ticks and sliders wear the kit's look, not a browser's; its number
  fields take words, not the browser's step arrows; its words in the face, not the page's monospace for the numbers
  to copy, which cannot be selected: a press on them copies them whole (`copyText`); a name or a node's words show
  over it, as a page's `title` did, while the pointer or the keys' focus is on it. With the mouse free, Tab or an
  arrow moves focus into the panels, and the keys stay theirs until the view is clicked. The World Editor's panel is drawn by the game in its own look, its names over the view with a
  halo a pixel wide where the page's stroke stood a pixel and a half out.
- The vitals always rest when whole: DFO's switch for it waits on a settings screen.
- At sea the ship's bars stand beside the compass only on a view 908 px wide or more; on a narrower one they run under
  it, where on foot the compass's column steps down under the vitals. The sea's compass, card and tally do not double
  past 1440p, as the ship's bars and the display on foot do.
- A plate keeps its size on any screen; DFO's names also grew with the screen's height.
- Bars at the top of the screen (the boss bar, the soft lock's, a Boss ship's) stand where they are set; only bars
  over figures are laid apart. Two Boss ships' plates stand 56 px apart, as far as the first stands down.
- Another player's details show their pieces' initials, not their pictures, and not their figure: the page draws
  pictures on the player's own figure, which is not theirs.
- A join reaches a company member on foot on the landmass open now, in a patrol's dungeon too; one across the sea,
  or at sea, is not reached, and the Roster says so.
- A player's plate shows their username from the room their account last claimed their character in: one added
  meanwhile shows from their next room.
- An item is drawn from the front only, and a piece the forge has no layer for (plain arms) shows its initials.
- The world's sounds play on foot and on the Test Ground; a deck at sea has none, and the music has
  none yet.
- The Acquired feed shows no level of the player's own gained, only an Art's.
- The Art's, Appearance and keepers' screens draw no soft glow: the Art's emblem opens without the glow that swelled
  round it, the Anima breathes as a ring, a fragment just set flares as a white ring and wash, and the worn Art's and
  the focused one's outlines are drawn diamonds round their emblems. A fragment not owned and a ware not had stand
  dimmed and tinted grey, not wholly grey. Within the Core's open flyout the arrows reach the screen's other tiles
  too, as they move to the nearest that way anywhere on a drawn page; Escape still closes the flyout first.
- No touch layer yet, and so none of DFO's narrow-screen places for the compass. The pad has no way to the land's
  held map until a button is bound to it (the cross's up mounts there), to the menu's Details or a hold to dismantle,
  nor to a press the pointer alone reaches (the sea's marks, the map's places).
- At sea the sea bar stays at the screen's foot. DFO stands its helm bar under the compass and the target's card
  under that bar, measured each frame; here a Boss ship's plate is drawn at a set place under the compass, where the
  bar would stand, and at 960 px the bar is as wide as the screen between the place's name and its right edge.
- The compass marks only ships. DFO's marks for the player's own boats, a party, a quest, the way out, a profession's
  nodes, Detect spells and its world's events wait on their like here ([[Pick - Enhanced Plus UI]]).
