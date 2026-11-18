---
type: system
status: live
code:
  - client/src/plus/kit.ts#ROLES
  - client/src/plus/kit.ts#kitCss
  - client/src/plus/kit.ts#wearKit
  - client/src/plus/frame.ts#frameSvg
  - client/src/plus/tones.ts#TONES
  - client/src/game/hud.ts#Hud
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
  chip (a readout), a well, a header, a footer, a rule and a rail. A surface takes its role by taking its class
  (`ROLES`).
- **Presses answer alike.** A button or primary is raised stone; it goes brass under the pointer or focus, sinks while
  held and goes flat when it cannot be pressed. A warn lights in blood, never brass.
- **Paint only.** The kit writes colours, bevels, grounds and shadows, never a width, padding or size, so dressing a
  surface never sizes or spaces it; only a held press sinks a pixel. The page's own sheet gives each surface its room,
  and each window and press the 2 px border the kit's bevel and frame land on.
- **The frame** is a 25 px square picture drawn pixel for pixel and used at 1:1: the outline, the stone bevel lit
  from the top left, an engraved line and a dark lip, with a brass fitting and its rivet at each corner. It reaches
  6 px outside its box, so it takes no room.
- **The palette** names each tone for what it is: the stone from lit to dark, the brass from lit to dark, the grounds
  and the words.
- **Where it is worn.** The [[Game]]'s heads-up display lays the kit's sheet once. The sea bar is a window, its groups
  (Navigation, Pace and Ship) parted by rails; the dock or landing offer, Take the helm and Respawn are primaries;
  the status line is a chip; the menu is a window under a header.
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
whole number of pixels wide, their words at the names' size; keys on keycaps where the menu is wide enough; Journal
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
  flyout of the nine it may carry; a click there wears one, and F held over one dismantles it. The emblem's flyout holds every emblem, five a row: those
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
- **Inventory.** The currencies along the top; under them the Vestiges carried, "Vestiges 3/10" over ten places in
  two rows of five, as Destiny 2's engrams stand, an empty place a dark Vestige, a click opening one at the Reader;
  then shelves, each counting what it holds: Consumables, and Materials, a list by name and count. The gear is on the
  Character page alone.
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
- Another player's details show their pieces' initials, not their pictures, and not their figure: the page draws
  pictures on the player's own figure, which is not theirs.
- A join reaches a company member on foot on the landmass open now; one across the sea, or at sea, is not reached, and
  the Roster says so.
- No names stand over other players' heads yet.
- An item is drawn from the front only, and a piece the forge has no layer for (plain arms) shows its initials.
- No gamepad or touch layer yet.
- The sounds are the interface's alone; the world and the music have none yet.
- The Acquired feed shows what is counted in the gear; XP and levels are not shown there.
