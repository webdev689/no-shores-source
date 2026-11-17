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

A window over the game, after Destiny's own: Character (I), Inventory (O), Vendors and Account, under a header of
tabs. While
it is open the pointer is free and the game's own keys rest; Escape or Close shuts it. It shows the player's gear as
their room last sent it ([[Gear]]), and each press is an ask the room answers with their gear.

- **Character.** The weapons (main hand, off hand) and the cloak to the left, the four armour pieces to the right,
  each slot a tile with its item's name in its rarity's colour and its Attack, Defense or Prestige. Between them,
  the player's level, a meter to the next (XP below 20, Prestige past it), Prestige, Defense, each hand's Attack, the
  Fruit of Dagon held and a meter for the next one growing past level 20. A slot pressed lists what it wears and the
  nine it may carry; an item pressed opens it.
- **An item.** Its name, rarity and kind, its numbers, a meter of its XP, its words if it is named, and its nodes,
  column by column, each with its XP: a node chosen in brass, one that can be bought or chosen raised, one locked
  flat, each saying what it does and costs. Below, what may be done where it is: wear it (or in the off hand), take
  it off, dismantle it (in blood), put it in or take it out of the vault, and feed it a Fruit of Dagon, held for a
  moment.
- **Inventory.** Aurem, the fragments and Essence, Fruit of Dagon and each island's resource held; the Vestiges
  carried; and the vault. In a social space, a Vestige may be identified or vaulted, and the vault opens; elsewhere it
  says where they are.
- **Vendors.** In a social space, the Quartermaster's and the Armsmith's wares of the day ([[Gear]], "Vendors"),
  each a tile with its kind, level and a Buy press at its price, flat while the player's Aurem falls short.
- **Account** ([[Accounts]]): whether the player is a guest, signed in, or linked with Discord; a username and
  password to keep a guest by, or to sign in with; Discord; and signing out, which warns a guest they cannot come
  back. A sign-in or out loads the page again, so its rooms hold the right character.
- A new build of the window waits while a press is held, so no press is lost to it.

## Limits

- One look, DFO's Slate. Its other themes (Stone, Iron, Ember, Forest, Night) wait on a settings screen to choose
  them in.
- The [[World Editor]] and the [[Test Ground]] keep their own panels for now.
- The gear window draws no item's picture, and no figure wearing it: the figure in the world wears it ([[Gear]]).
- No gamepad or touch layer yet.
