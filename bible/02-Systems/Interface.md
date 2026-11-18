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
Inventory (O), Vendors and Account as tabs in its header, the player's level, Prestige and Defense at its left and
their Aurem at its right. While it is open the pointer is free and the game's own keys rest; Escape shuts an item's
page, then the screen. It shows the player's gear as their room last sent it ([[Gear]]), and each press is an ask
the room answers with their gear.

- **Pictures.** Every item is drawn from the forge: the figure dressed with it, less the figure without it, cropped.
  A weapon is drawn in the pose that holds it. Where the forge draws nothing of a piece, its slot shows its name's
  initials, as Enhanced Plus shows a piece without art. Currencies, materials and Vestiges are small pixel glyphs.
- **Rarity.** A cell, card or page takes its rarity's colour, a lit and a shaded tone for its bevel, a glow behind
  its picture, and its pips (◆ to ◈).
- **Character.** The player's figure large in the middle, under their level, Prestige and Defense, a meter to the
  next level below it (XP below 20, Prestige past it). The weapons (main hand, off hand) and the cloak stand to its
  left, the four armour pieces to its right, each slot a cell with its item's picture. Hovering a slot shows its
  card; a click opens its flyout, the nine it may carry in a 3 by 3 grid beside it, each with its card and how it
  changes the worn one's numbers, green up and red down; a click there wears it, a right-click inspects it.
- **The card.** An item's name on a band of its rarity, its kind and pips, its picture, its main number large, its
  level and XP, its chosen traits, its words, and what it replaces.
- **An item's page** lies over the screen, as Destiny 1's weapon page does: its name in its rarity's colour, its kind
  and words, its main number large and meters of its Attack or Prestige, level and XP; its nodes in round columns,
  each column's XP above it, chosen in brass, bought lit, open raised and locked flat, each with its card; to the
  right the item drawn large in its rarity's glow; and along its foot what may be done where it is: wear it (or in
  the off hand), take it off, dismantle it, vault it or take it out, and feed it a Fruit of Dagon, held a moment.
- **Inventory.** The currencies along the top (Aurem, the fragments, Essence), then tabs: Consumables (Fruit of
  Dagon), Materials (each island's resource), Vestiges and, in a social space, the vault. Each is a grid of cells, a
  count at each cell's foot and pips beside it. A click does what the cell is for (a Vestige identified, an item
  taken out); a right-click its other use or the item's page.
- **Vendors.** In a social space, the Quartermaster's and the Armsmith's wares of the day ([[Gear]], "Vendors"),
  each a cell with its picture and card, its kind, level and a Buy press at its price, flat while the player's Aurem
  falls short.
- **Account** ([[Accounts]]): whether the player is a guest, signed in, or linked with Discord; a username and
  password to keep a guest by, or to sign in with; Discord; and signing out, which warns a guest they cannot come
  back. A sign-in or out loads the page again, so its rooms hold the right character.
- A new build of the screen waits while a press is held, so no press is lost to it.

## Limits

- One look, DFO's Slate. Its other themes (Stone, Iron, Ember, Forest, Night) wait on a settings screen to choose
  them in.
- The [[World Editor]] and the [[Test Ground]] keep their own panels for now.
- An item is drawn from the front only, and a piece the forge has no layer for (plain arms) shows its initials.
- No gamepad or touch layer yet.
