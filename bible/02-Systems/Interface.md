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
  - client/src/game/gearDom.ts#compareNode
  - client/src/game/iconFit.ts#fitIcon
  - client/src/game/inventoryPage.ts#inventoryPage
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
Inventory (O), Vendors and Account as tabs in its header, Character's and Inventory's keys on keycaps, the player's
level, Prestige and Defense at its left (left blank on Character, which shows them itself) and their Aurem at its
right (left blank on Inventory, which shows it with the rest). It opens with a short stepped rise; the world behind
it is dimmed and softened, the pointer is free, the game's keys and the HUD under it rest, a sea fight's too, and the
focus stays within it. Escape steps back: an item's page, then a slot's flyout, then the screen. It shows the player's
gear as their room last sent it ([[Gear]]), built again only when that word is new or the player moves within the
screen, the control that held the focus found again, and never while a press is held. Each press is an ask the room
answers.

- **The footer** is one: at its left the room's answer to the last press, read aloud as it comes, then what the
  presses and keys do here, each key on a keycap; at its right what may be done: an item's presses on its page, Back
  while a flyout is open, else Close, each with its key.
- **Pictures.** Every item is drawn from the forge: the figure dressed with it, less the figure without it and any
  speck of it apart from the piece, cropped. A weapon is drawn in the pose that holds it. Each picture is fitted to
  its place as Enhanced Plus fits its icons: its clear margin trimmed, grown by whole pixels where that keeps most of
  the room, else past it and smoothed down once, never past four to one, at the screen's own pixel ratio. Where the
  forge draws nothing of a piece, its slot shows its name's initials. Currencies, materials, Vestiges and nodes are
  small pixel glyphs.
- **Rarity.** The owner's colours: Normal white, Magic blue, Rare yellow, Legendary gold, Atheric cyan blue; a Normal
  piece's frame is the kit's plain stone, so it never outshines a finer one. A tile is Enhanced Plus's dark well, its
  bevel in its rarity's lit and shaded tones, its glow sunk inside and brighter under the pointer or the focus; a card
  or page takes its rarity's band and colour; pips mark it (◆ to ◈).
- **Character.** The player's figure large in the middle, as tall as the screen allows, under their level and a meter
  to the next (XP below 20, Prestige past it) with its words, both the room's; under the figure, their Attack,
  Defense, Prestige and Fruit of Dagon. The weapons (main hand, off hand) and the cloak stand to its left, the four
  armour pieces to its right, their headings level, each slot its item's picture with the slot's name and the item's
  in its rarity's colour. Hovering or focusing a slot shows its card; a click opens its flyout toward the figure (up
  from the lowest slots), the nine it may carry in a 3 by 3 grid; a click there wears one.
- **The card.** An item's name on a band of its rarity, its kind and pips, its picture, its main number large, its
  level and XP, its chosen traits each beside its column's glyph, its words, and what it changes over the piece it
  would replace: each number's meter at the lesser, the gain or loss a segment in green or red, the new number and the
  change beside it. Along its foot, what its presses do, on keycaps: Click to equip, Right-click (or X on a focused
  piece) for its details. It opens on hover or keyboard focus alike, and goes when what it describes leaves the page.
- **An item's page** lies over the screen, as Destiny 1's weapon page does, the screen under it out of reach: its name
  on its rarity's band, its kind, level and pips; its words; its main number large over a meter of it; its Prestige;
  what it changes over the piece worn, when it is carried; the perks its chosen nodes give, each beside its glyph; and
  its node grid, each column under a meter of the XP from the column before to its own. Each node is a tile of the
  kit's stone with its kind's glyph (an upgrade's chevrons, handling's grip, a finish's gem, a perk's star, an
  Atheric's own sun): sunk while locked, glowing and breathing in its rarity when it can be bought, its glyph brass
  once bought, set in brass when chosen. A node is bought by holding it, as Destiny 1 held an upgrade, and one bought
  is chosen by a click; one that can do nothing still takes the focus, so its card says why. Its card stands beside
  the grid. To the right, the item drawn large on a lit floor. Its presses go to the footer: Back, and what may be
  done where it is: wear it (or in the off hand), take it off, vault it or take it out, and, held a moment (by the
  pointer or Enter or Space, the press filling from its foot), feed it a Fruit of Dagon or dismantle it.
- **Inventory.** The currencies along the top, each named under its count; then shelves in a sunk strip, each
  counting what it holds and dimmed while it holds nothing: Gear, Destiny 1's own, each slot's row its worn piece and
  then the nine it carries, a click wearing one and showing the worn one's details; Consumables (Fruit of Dagon);
  Materials, a list of each island's resource by name and count; Vestiges (ten places); and, in a social space, the
  vault. A cell's count stands at its foot and its pips beside it. A click does what a cell is for (a Vestige
  identified, an item taken out); a right-click its other use or the item's page.
- **Vendors.** In a social space, the Quartermaster's and the Armsmith's wares of the day ([[Gear]], "Vendors"). Each
  ware is a press held to buy it: its picture, its name in its rarity's colour, its kind, level and power, and its
  price beside the Aurem glyph, in red with the words when the player cannot pay it; its card shows what it changes
  over the piece worn in its slot.
- **Account** ([[Accounts]]): whether the player is a guest, signed in, or linked with Discord; a username and
  password to keep a guest by, or to sign in with; Discord, and how its last sign-in ended; and signing out, here or
  everywhere, each held. A guest's sign-in to another account and sign-out are held too, and say the guest is left
  behind. A sign-in or out loads the page again, so its rooms hold the right character.
- **Motion** runs in steps, as Enhanced Plus's sigils breathe: the screen's rise, the scrim's fade and a buyable
  node's glow. With less motion asked for, only the held press's fill moves, as it says how long is left.

## Limits

- One look, DFO's Slate. Its other themes (Stone, Iron, Ember, Forest, Night) wait on a settings screen to choose
  them in.
- The [[World Editor]] and the [[Test Ground]] keep their own panels for now.
- An item is drawn from the front only, and a piece the forge has no layer for (plain arms) shows its initials.
- No gamepad or touch layer yet.
