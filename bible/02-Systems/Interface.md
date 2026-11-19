---
type: system
status: live
code:
  - client/src/plus/kit.ts#ROLES
  - client/src/plus/kit.ts#kitCss
  - client/src/plus/kit.ts#wearKit
  - client/src/plus/frame.ts#frameSvg
  - client/src/plus/tones.ts#TONES
  - client/src/plus/tones.ts#FILLS
  - client/src/plus/emblems.ts#emblemUrl
  - client/src/plus/barLayout.ts#BarLayout
  - client/src/plus/barLayout.ts#PLATES
  - client/src/game/hud.ts#Hud
  - client/src/combat/hudSheet.ts#wearFightSheet
  - client/src/plus/tones.ts#HALO
  - client/src/plus/compass.ts#Compass
  - client/src/plus/compass.ts#compassPlace
  - client/src/plus/compass.ts#markPlace
  - client/src/game/seaHud.ts#seaShipMarks
  - client/src/combat/hud.ts#veilOf
  - client/src/combat/hud.ts#clearOf
  - client/src/combat/vitals.ts#Vitals
  - client/src/combat/foePlate.ts#FoePlate
  - client/src/plus/barLoss.ts#stepLoss
  - client/src/plus/barLoss.ts#pieceAt
  - client/src/combat/foeTarget.ts#FoeTarget
  - client/src/combat/foePlate.ts#poiseTrackOf
  - client/src/combat/plateSight.ts#coneWant
  - client/src/combat/plateSight.ts#plateScale
  - client/src/combat/plateSight.ts#PlateSight
  - client/src/combat/hitWords.ts#wordsOf
  - client/src/combat/foePlate.ts#wardOf
  - client/src/plus/kit.ts#motionReduced
  - client/src/ships/shipBars.ts#drawShipBars
  - client/src/ships/shipBars.ts#HullLosses
  - client/src/game/gearScreen.ts#characterOf
  - client/src/game/gearScreen.ts#itemDetailOf
  - client/src/game/gearWindow.ts#startGearWindow
  - client/src/game/characterPage.ts#characterPage
  - client/src/game/itemPage.ts#itemPage
  - client/src/game/inventoryPage.ts#inventoryPage
  - client/src/game/gearDom.ts#holdOn
  - client/src/game/gearDom.ts#dismantleOnHold
  - client/src/game/acquiredFeed.ts#startAcquiredFeed
  - client/src/game/gains.ts#gainsOf
  - client/src/game/uiSounds.ts#play
  - client/src/game/soundSamples.ts#playSample
  - client/src/game/soundSamples.ts#soundCredits
  - client/src/game/gearCards.ts#cardOf
  - client/src/game/itemPictures.ts#ItemPictures
  - client/src/game/gearDom.ts#HoverCard
  - client/src/game/gearDom.ts#compareNode
  - client/src/game/iconFit.ts#fitIcon
  - client/src/game/gearGlyphs.ts#nodeGlyphSvg
  - client/src/game/accountTab.ts#accountPanel
  - client/src/game/menuPages.ts#shipPage
  - client/src/game/rosterTab.ts#rosterPage
  - client/src/game/rosterRows.ts#actionsFor
  - client/src/game/playerDetails.ts#detailsPage
  - client/src/game/emblemArt.ts#emblemPixels
  - client/src/game/emblemSlot.ts#emblemSlot
  - client/src/game/companyHud.ts#startCompanyHud
  - client/src/game/stationPages.ts#vaultPage
  - client/src/game/stationPages.ts#vendorPage
  - client/src/game/gearDom.ts#itemMarks
  - client/src/game/gearDom.ts#nodeRing
  - client/src/game/elementGlyphs.ts#elementSvg
  - client/src/face.css
  - client/src/face.ts#useMendedFace
  - client/src/trueType.ts#trueType
---
# Interface

The game's screens wear Enhanced Plus, DFO's own interface, brought over and adapted ([[Pick - Enhanced Plus UI]],
[[The Ship Is Managed and Walked From the Sea's Panel]]): carved stone and brass, so every surface reads as one stone.

## How it works

- **Roles.** Every surface plays a role, and the role says how it is painted and how it answers a press: a window
  (the carved frame with brass fittings at its corners, a grained ground, a hard drop), a panel, a button, a primary
  (the one press a surface is for, in brass), a warn (a press that costs something, its edge in blood), a tile, a
  chip (a readout), a well, a header, a footer, a rule, a rail, a track (a bar's dark trough, sunk into its edge, a
  hairline at 1 px) and a meter (a bar's fill, lit along its top, shaded along its foot, its leading edge lit, in the
  colour its surface gives it). A surface takes its role by taking its class (`ROLES`); a role no surface wears yet
  comes over from DFO's kit when one does.
- **Presses answer alike.** A button or primary is raised stone; it goes brass under the pointer or focus, sinks while
  held and goes flat when it cannot be pressed. A warn lights in blood, never brass.
- **Paint only.** The kit writes colours, bevels, grounds and shadows, never a width, padding or size, so dressing a
  surface never sizes or spaces it; only a held press sinks a pixel. The page's own sheet gives each surface its
  room, and each window and press the 2 px border the kit's bevel and frame land on.
- **The frame** is a 25 px square picture drawn pixel for pixel and used at 1:1: the outline, the stone bevel lit
  from the top left, an engraved line and a dark lip, with a brass fitting and its rivet at each corner. It reaches
  6 px outside its box, so it takes no room.
- **The palette** names each tone for what it is: the stone from lit to dark, the brass from lit to dark, the grounds
  and the words; and each bar's fill (`FILLS`): red, orange and yellow by rank, and the three vitals.
- **Emblems and marks** are our own pictures, drawn pixel for pixel in the palette and shown at whole multiples: the
  Grey Tithe's balance in grey stone and the pirates' skull in bone over crossed brass bones, by faction number, on
  ships' plates (a foe's plate shows its level there instead); an Elite's brass chevron and a Miniboss's two.
- **Bars over figures never overlap** (`BarLayout`). Each frame the nearest keeps its place over its figure, in front,
  and each farther one that would cover a bar already placed is lifted just above it. The order changes only when a
  figure comes 6% nearer, a lifted bar comes down only once it is 10 px further clear, and a bar eases to a new height,
  so the bars hold still from frame to frame.
- **Where it is worn.** The [[Game]]'s heads-up display lays the kit's sheet once. The sea bar is a window, its groups
  (Navigation, Pace and Ship) parted by rails; the dock or landing offer, Take the helm and Respawn are primaries;
  the status line is a chip; the menu is a window under a header.
- **Nothing covers another.** The place's name keeps left of the compass, its words wrapping before they reach it.
  A boss's bar under the compass, and ships' plates in a sea fight, take the top from the place's name, which gives
  way while they show. On foot the status line stands under the place's name, and under a boss's bar while one
  shows; at sea it stands under the compass, and in a sea fight under a Boss ship's plate. On foot the hints stand
  over the vitals; at sea they rise above the offer to dock or go ashore. The edge's warning stands under the
  compass's column.
- **The fight's display** ([[Enemies]], [[Test Ground]]) lays its own sheet after the kit's. It stands the compass at
  the top's middle with a boss's bar and the target's plate under it, as DFO's Enhanced HUD does, and keeps the vitals
  in their own window at the bottom left ([[The Vitals Keep Their Panel Under DFO's Compass]]). Its bars do what DFO's
  Enhanced UI Plus does with them ([[Pick - Enhanced Plus UI]]).
- **The compass** is a strip 18 px down the top's middle, 520 px wide (60% of a narrower screen) and 26 px tall over
  a 2 px rule, showing a quarter of the circle. Its eight points (N, NE, E, SE, S, SW, W, NW, the four cardinals
  larger) stand by the bearing the view looks at, the shortest way round; one off the strip is hidden, never held at
  an end. A brass needle marks its middle. Its column stands what comes under it 10 px under its rule, 56 px down:
  a boss's bar, then the target's plate. At sea it marks each ship within 900 m on its top edge, a bow pointing up,
  at her bearing on the same quarter turn, so one north-east stands under NE; one off the strip is held at the end
  on the side to turn toward. She is red while she would take the player (a hostile ship, or a hostile captain in
  the fight), bone for another player's or a captain who is not hostile, and grey once her colours are down; one
  going down has no mark. The compass hides with the view while the held map is up at the helm.
- **The vitals** are one window at the bottom left, three tracks in it (health, stamina, poise), each naming itself and
  writing its percentage inside: never 0% while anything is left. Health at a quarter or less flashes its edge to blood;
  the stamina flashes white for a swing or a dodge asked with none. Whole and untouched for 4 s (health and stamina
  short of no whole point, no poise taken), with no foe on the target plate or the boss bar, the window rests out of
  sight in six steps over 1.2 s; the first point lost or spent brings it back in two.
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
  brass; an iron blow wound up, full and hatched in red, "Iron"; staggered, full and white, "Staggered", flashing as
  the foe it shows breaks and never as the plate turns onto one already staggered; open after a blow that found no
  one, a brass edge, "Open". With nothing to say it keeps its room unseen.
- **A foe's shield** ([[Gear]], "Elements and shields") lies over its health on every plate (over a figure, the
  target's and the boss bar), as DFO's Enhanced HUD laid a boss's ward: from the bar's left end, as long as the share
  of the foe's whole health it holds still, lit along its top and dark along its foot in its element's colours, Blaze
  orange, Volt blue, Cosmic violet (`wardOf`). It is gone once broken. What it takes from the player's own blows is
  said in its element's colour; a blow it holds whole fills no poise, so the poise track says nothing of it.
- **Plates over figures are never overbearing.** A foe's shows only within 20 degrees of the crosshair, whole within
  17 and none past 23, easing in and out over 0.25 s; a plate new on the screen starts where the cone puts it, so
  none pops in. The foes the player traded a blow with in the last minute show wherever they are. A plate shows
  for no foe farther than 60 m across the ground, nor one whose head the place's blocks have hidden for 0.15 s; seen
  again it comes back at once. It is whole as near as 12 m through a 60 degree lens and shrinks as its figure does
  farther off, never growing, its name never under 9 px.
- **A blow's words** over the world rise and fade over 0.95 s from where each thing happened, fanning up to 36 px
  either side so a flurry does not stack; a great turn's pops larger and rises farther. What a blow did besides
  (Staggered, Slain) rides on its number as a small word under it, and the player's blow on a foe winding up that
  does not break it says "Holds".
- **Reduced motion.** With it asked for, no piece falls, no word rises (each stands and fades), no edge blinks (it
  holds blood or white), no flash plays and plates over figures and ships go straight to their places. The
  compass and its marks move only as the view turns.
- **Its layers**, back to front: what stands over the world (the plates over figures, nearest in front, the parry
  rings, the words, the arrows), then the compass's column, then the veil over the whole display: blood while
  the player lies dead, plain while the link to the room is lost or joining again. The display never stands over
  the page's own windows. An arrow to a threat off the screen that would fall on the vitals stands just above them.
- **Words** over the world or a fill (plates' names, the vitals' words, the veil's) carry a hard 1 px outline all
  round and a soft shade past it, as a ship's plate strokes its words (`HALO`), so they read over bright sky. The
  [[Game]]'s place name and hints, laid straight on the world too, carry the same outline.
- **A foe's plate**, after the owner's reference: its level in a chip square at the left, the number half the square
  high, the square empty for a foe of no level; to its right its name above a long thin track, the meter in its rank's
  colour. Over each foe, the soft lock's (with its poise under the health) and the boss bar's are this one plate at
  three sizes. Ships' plates are drawn alike on an SVG, at the same sizes (`PLATES`): 140 by 26 px over a figure,
  and the boss bar 640 px wide at most, three quarters of a narrower screen, its faction after its name. A ship's
  hull reads its losses as a foe's health does, and her bar's edge flashes for a bite, whole, two thirds and a third
  over 0.24 s; a ship first seen starts whole at her bar.
- **Manage's panel** is a window at the right under a header naming the ship. Each part's heading is a rule; a part
  still to come shows Later in a chip; Back to the sea stands on its footer. It is built again only when what it
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
rarities' diamonds, the map's house, triangles, skull and anchor. Each is drawn in `face.ts` as rows of cells on Pixelify's grid at its
weight, and made into a font in the page when it opens (`trueType.ts`), so nothing generated is kept.

## The menu

A screen over the game, after Destiny's ([[The Menu Follows Destiny, the Vault and Vendors in the Social Space]]):
the tabs Character (I), Inventory (O), Journal, Ship, Social, Guild and Settings fill the top of its header, each a
whole number of pixels wide, their words at the names' size (the words' under 1100 px, where they would not fit);
keys on keycaps where the menu is wide enough; Journal
and Guild marked Later, each a page saying what it will hold. The chosen tab is a lit brass press; the arrow keys move
between tabs. At the top line's right stands the account's mark, after DFO's
([[The HUD Drops Its Room Line, and the Account Mark Comes From DFO]]): a round well rimmed in brass with the player's
face in it, a hooded silhouette until their figure is drawn, and a gem on its rim, filled for an account kept with a
username or Discord and hollow for a guest's; pressed, it opens Settings. Under them, the whole width of the menu,
stands the player's banner
([[The Menu's Tabs Fill Its Top, Its Banner Under Them]]): their emblem drawn to the banner's width at three times its
cells, so it is never cut off, their name, level, Prestige and Defense over it, and their Aurem at its end, left blank
on the Inventory, which shows it. Once shown it stays, though the room's word goes; only its numbers wait for it. It opens with a short
stepped rise; the world behind is dimmed, the pointer is free, the game's keys and the HUD under it rest, and the
focus stays within it, marked in white. On a screen past 1440p the menu, its cards and the HUD's words stand at
twice their size, the 1280 by 720 layout doubled. Escape steps back: a page's own step first (the Roster's panel, a player's
details), then an item's page, then a slot's flyout, then the menu. Gear shows as the
player's room last sent it ([[Gear]]), built again only when that is new or the player moves within the menu, and
never while a press is held. Each press is an ask the room answers.

- **The footer** is one: the room's answer to the last press, read aloud as it comes, then what the presses and keys
  do here; at its right an item's presses on its page, Back while a flyout is open, else Close.
- **Pictures.** Every item is drawn from the forge: the figure dressed with it, less the figure without it, cropped;
  a weapon or a shield is its own layer drawn alone in the pose that holds it, so no hand hides its grip. Each is
  fitted to its place as Enhanced Plus fits its icons; an icon long and thin (a blade, a staff, a gun) is laid on its
  tile's diagonal, as Destiny lays weapons, so it reads. Where the forge draws nothing of a piece, its slot shows its
  name's initials. Currencies, materials, Vestiges, nodes and elements are small pixel glyphs; each material is drawn as what it
  is, mostly in its island's colour.
- **Rarity.** Normal white, Magic blue, Rare yellow, Legendary gold, Atheric cyan blue; a Normal piece's frame is the
  kit's plain stone. A tile is Enhanced Plus's dark well, its bevel in its rarity's tones and its glow sunk inside; a
  card or page takes its rarity's band; pips mark it.
- **An icon shows its item's state, not words** ([[Text Is Plain]]): a weapon's element as its glyph in the top
  corner; a green gauge along its foot that fills as its nodes are bought ([[The Face Is Mended Whole, and the Gauge Counts Upgrades]]); and, once every node is
  bought, a gilded frame in place of the gauge, as Destiny 2's masterworks are.
- **Character.** The player's figure large in the middle, under their level and a meter to the next; under it their
  Attack, Defense, Prestige and Fruit of Dagon. The weapons, the cloak and the emblem stand to its left, the armour to
  its right, each slot its item's picture with its names. A slot's card shows on hover or focus; a click opens its
  flyout of the nine it may carry, toward the figure, upward from each side's two lowest slots; a click there wears
  one, and F held over one dismantles it. A flyout closes once the mouse is off its slot and itself, a strip over the
  gap between them keeping it while the mouse crosses, or on a click or Escape; a key's focus in it goes back to its
  slot. The emblem's flyout holds every emblem, five a row: those
  kept to wear with a click, the rest dim, each card saying how it is had.
- **The card.** An item's name on its rarity's band, its kind, pips and element, its picture, its main number large,
  its level, its chosen traits, its words, and what it changes over the piece it would replace, each number's meter
  with the gain or loss in green or red. Along its foot what its presses do.
- **An item's page** lies over the menu, as Destiny 1's weapon page does: its name on its rarity's band, its kind,
  level, pips and element; its words; its main number large over a meter of it; what it changes over the piece worn;
  the perks its chosen nodes give; and its node grid. Each node is a tile of the kit's stone with its kind's glyph:
  sunk while locked, a ring inside it lit as far as the item has grown toward it; glowing when it can be bought; its
  glyph brass once bought; set in brass when chosen. A node is bought by holding it and one bought is chosen by a
  click. To the right, the item drawn large on a lit floor. Its presses go to the footer: wear it, take it off, put
  it in the vault or take it out (at the vault's counter), and, held, feed it a Fruit of Dagon or dismantle it.
- **Inventory.** Aurem, the one currency, along the top; under it the Vestiges carried, "Vestiges 3/10" over ten
  places in two rows of five, as Destiny 2's engrams stand, an empty place a dark Vestige, a click opening one at the
  Reader;
  then shelves, each counting what it holds: Consumables, and Materials, the Weapon and Armor Fragments and Essence
  first, then the islands' resources. Each shelf is a grid as Destiny's is: each thing a stack in a cell with its
  count, shown only while one is held, then empty places to the end of its row of ten. The gear is on the Character
  page alone.
- **Holds.** What cannot be undone is held. As a press is held, what it acts on charges: a wash of its rarity rises
  through a tile, and its picture brightens and quivers toward the end, as Destiny's dismantle does. A piece is held
  longer the rarer it is: 0.6 seconds for Normal up to 1.8 for Atheric. Once it acts, a dismantled piece breaks
  into shards of its rarity and a fed one gives off a ring; let go early, nothing happens. F dismantles the carried
  piece last pointed at or focused; with Ctrl, Cmd or Alt it is the browser's key. Moving the pointer off the piece,
  or leaving the window, lets go.
- **Acquired.** What the player gains shows at the right of the screen, in play and over the menu alike, as Destiny
  shows a pickup: a row each, its picture in a well of its rarity, its name and how many. Rows slide in, stay four
  and a half seconds and fade; a gain like one still shown adds to its row; six stand at most. Each batch chimes
  once, for its rarest gain. Over the menu the rows stand low, above its footer and under a hover card. A room's first
  word on the gear is not a gain, nor what changes in the ten seconds after it, while the player's own character is
  claimed.
- **Sounds.** Every control makes a sound: a tick as the pointer or the keys reach it, a press, a step back, a tab
  turned, the menu opened and shut, a hold's charge rising, a dismantle, a feed, a gain's chime by its rarity, a
  refusal. Each is the owner's pick on the sound sheet ([[Sounds Come From Freesound, Judged on a Test Sheet]]): the
  tick, press, step back, opening, dismantle and feed are recordings from Freesound, listed with their credits in
  `content/audio/sounds.json`, kept on R2 and levelled to one peak and one loudness; the gains are the synthesiser's Brass bells, one
  bell for a Normal or Magic gain, a rising run for a Rare, a longer run over a held chord for a Legendary or
  Atheric; a hold builds up as the synthesiser's Shimmer, high thin air swelling over the hold and glinting faster
  toward its end; the tab, the close and the refusal are the synthesiser's own, which also stands in while a recording
  loads. One listener hears every press, as DFO's does. Nothing sounds before the player's first press or key, as
  browsers ask.
- **Ship.** The Sloop's details, as Manage shows them at sea: her hull, canvas, guns, loads and measure; her voyage
  while she is at sea; her cargo and crew marked Later.
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
  Under it, the players blocked, each with a press to unblock them; then the interface's volume, kept in this
  browser, and the recorded sounds' credits: each one's name, author, licence and source, and what was changed.
- **Motion** runs in steps, as Enhanced Plus's sigils breathe. With less motion asked for, only a hold's fill and
  wash move: no quiver, no shards, and the gains appear without sliding in.

## The social space's counters

The vault, the vendors and the Tailor keep counters in the social space, as Destiny's keep theirs in the Tower; E at
one opens its screen in the menu's window, its name where the tabs stand. The Reader of Vestiges opens the inventory,
its Vestiges at the top. The room serves each ask only at its own counter ([[Gear]], "In the rooms").

- **The vault**, after Destiny 1's: what it keeps on the left and what the player carries on the right, each in
  weapons, armour and Vestiges, the vault's shelves counting toward their twenty. A click moves a piece across; a
  right-click shows its page. Where the menu is wide its shelves stand in two rows of ten; Vestiges stand five a row,
  an empty place a dark Vestige, as the inventory's.
- **A vendor's stall**: the Quartermaster's armour or the Armsmith's weapons of the day ([[Gear]], "Vendors"). Each
  ware is a press held to buy it: its picture, name, kind, level and power, and its price, in red with the words when
  the player cannot pay it; its card shows what it changes over the piece worn.
- **The Tailor's stall**: the six emblems sold that day ([[Gear]], "Emblems"), each its nameplate, name and price, held
  to buy; one kept, too dear or for a higher level says so.

## Emblems

An emblem is a sign 24 cells square and the nameplate it heads, 120 by 24, whose left square is the sign's own ground,
as Destiny's are ([[Cosmetics Follow Destiny, Shown in Many Places]]). Each is drawn in the page from its colours, a pattern
and a sign of up to 16 cells (`emblemArt.ts`, `emblemMotifs.ts`), never from a picture, and shown only at whole
multiples. Behind a row or a header, its band runs the nameplate on, unframed, and the colour it ends in fills on past
it; the menu's banner carries its pattern the whole way, as Destiny 2's heads its character screen. It shows on the
Roster's rows, the menu's banner, another player's details, the company on the heads-up display, the Emblem slot and
the Tailor's stall.

## Limits

- One look, DFO's Slate. Its other themes (Stone, Iron, Ember, Forest, Night) wait on a settings screen to choose
  them in.
- The [[World Editor]] and the [[Test Ground]] keep their own panels' layout, in the game's face: they are tools, not
  the game's screens.
- The vitals always rest when whole: DFO's switch for it waits on a settings screen.
- Only the place's blocks hide a plate: the ground between does not, so a foe over a hill keeps its plate.
- A plate keeps its size on any screen; DFO's names also grew with the screen's height.
- Bars at the top of the screen (the boss bar, the soft lock's, a Boss ship's) stand where they are set; only bars
  over figures are laid apart. Two Boss ships' plates stand 56 px apart, as far as the first stands down.
- Another player's details show their pieces' initials, not their pictures, and not their figure: the page draws
  pictures on the player's own figure, which is not theirs.
- A join reaches a company member on foot on the landmass open now; one across the sea, or at sea, is not reached, and
  the Roster says so.
- No names stand over other players' heads yet.
- An item is drawn from the front only, and a piece the forge has no layer for (plain arms) shows its initials.
- The sounds are the interface's alone; the world and the music have none yet.
- The Acquired feed shows what is counted in the gear; XP and levels are not shown there.
- No gamepad or touch layer yet, and so none of DFO's narrow-screen places for the compass.
- At sea the sea bar stays at the screen's foot. DFO stands its helm bar under the compass and the target's card
  under that bar, measured each frame; here a Boss ship's plate is drawn at a set place under the compass, where the
  bar would stand, and at 960 px the bar is as wide as the screen between the place's name and its right edge.
- The compass marks only ships. DFO's marks for the player's own boats, a party, a quest, the way out, a profession's
  nodes, Detect spells and its world's events wait on their like here ([[Pick - Enhanced Plus UI]]).
