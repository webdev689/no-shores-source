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
  - client/src/game/gearCards.ts#cardOf
  - client/src/game/itemPictures.ts#ItemPictures
  - client/src/game/gearDom.ts#HoverCard
  - client/src/game/gearGlyphs.ts#nodeGlyphSvg
  - client/src/game/accountTab.ts#accountPanel
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
  surface never moves it. The page's own sheet gives each surface its room, and each window and press the 2 px
  border the kit's bevel and frame land on.
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

## The gear window

A screen over the game, after Destiny's own ([[The Gear Screens Follow Destiny, on Enhanced Plus]]): Character (I),
Inventory (O), Vendors and Account as tabs in its header, each key on a keycap, the player's level, Prestige and
Defense at its left (left blank on Character, which shows them itself) and their Aurem at its right. While it is open
the world behind it is dimmed and softened, the pointer is free and the game's keys rest, a sea fight's too. Escape
steps back: an item's page, then a slot's flyout, then the screen. It shows the player's gear as their room last
sent it ([[Gear]]), built again only when that word is new or the player moves within the screen, the control that
held the focus found again; each press is an ask the room answers, the answer in the footer beside what the presses
do, read aloud as it comes.

- **Pictures.** Every item is drawn from the forge: the figure dressed with it, less the figure without it, cropped.
  A weapon is drawn in the pose that holds it; a picture larger than its place is scaled down to fit it. Where the
  forge draws nothing of a piece, its slot shows its name's initials, as Enhanced Plus shows a piece without art.
  Currencies, materials, Vestiges and nodes are small pixel glyphs.
- **Rarity.** The owner's colours: Normal white, Magic blue, Rare yellow, Legendary gold, Atheric cyan blue; a Normal
  piece's frame is the kit's plain stone, so it never outshines a finer one. A
  tile is Enhanced Plus's dark well, its bevel in its rarity's lit and shaded tones and its glow rising from below;
  a card or page takes its rarity's band and colour; pips mark it (◆ to ◈).
- **Character.** The player's figure large in the middle, as tall as the screen allows, under their level and a meter
  to the next (XP below 20, Prestige past it) with its words; under the figure, their Attack, Defense, Prestige and
  Fruit of Dagon. The weapons (main hand, off hand) and the cloak stand to its left, the four armour pieces to its
  right, each slot its item's picture with the slot's name and the item's in its rarity's colour. Hovering or focusing
  a slot shows its card; a click opens its flyout toward the figure, the nine it may carry in a 3 by 3 grid, each with
  its card and what it changes over the worn one, green up and red down; a click there wears it, a right-click
  inspects it.
- **The card.** An item's name on a band of its rarity, its kind and pips, its picture, its main number large, its
  level and XP, its chosen traits, its words, and what it replaces. It opens on hover or keyboard focus alike, and
  goes when what it describes leaves the page.
- **An item's page** lies over the screen, as Destiny 1's weapon page does, the screen under it out of reach: its name
  in its rarity's colour, its kind and level, its words, its main number large over a meter of it, its Prestige, the
  perks its chosen nodes give, and its node grid under one track of its XP, each column at its XP: each node its
  kind's glyph (an upgrade's chevrons, handling's grip, a finish's gem, a perk's star, an Atheric's own sun), brass
  when chosen, lit when bought, glowing in its rarity when it can be bought now, dim while locked, each with its card.
  To the right, the item drawn large on a lit floor; along the foot, Back and what may be done where it is: wear it
  (or in the off hand), take it off, vault it or take it out, and, held a moment (by the pointer or Enter or Space,
  a fill running along the press), feed it a Fruit of Dagon or dismantle it.
- **Inventory.** The currencies along the top, each named under its count; then shelves for Consumables (Fruit of
  Dagon), Materials (each island's resource), Vestiges (ten places) and, in a social space, the vault, each counting
  what it holds. Each is a grid of cells, a count at each cell's foot and pips beside it. A click does what the cell
  is for (a Vestige identified, an item taken out); a right-click its other use or the item's page.
- **Vendors.** In a social space, the Quartermaster's and the Armsmith's wares of the day ([[Gear]], "Vendors"),
  each its picture, its name in its rarity's colour, its kind, level and power, and its price, held to buy; its card
  shows what it changes over the piece worn in its slot. A price the player cannot pay is flat.
- **Account** ([[Accounts]]): whether the player is a guest, signed in, or linked with Discord; a username and
  password to keep a guest by, or to sign in with; Discord, and how its last sign-in ended; and signing out, which
  warns a guest they cannot come back. A sign-in or out loads the page again, so its rooms hold the right character.
- A new build of the screen waits while a press is held, so no press is lost to it.

## Limits

- One look, DFO's Slate. Its other themes (Stone, Iron, Ember, Forest, Night) wait on a settings screen to choose
  them in.
- The [[World Editor]] and the [[Test Ground]] keep their own panels for now.
- An item is drawn from the front only, and a piece the forge has no layer for (plain arms) shows its initials.
- No gamepad or touch layer yet.
