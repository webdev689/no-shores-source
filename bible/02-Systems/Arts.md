---
type: system
status: live
code:
  - content/arts/arts.json
  - client/src/game/artsPage.ts#artsPage
  - client/src/game/artsPage.ts#artDiamond
  - client/src/game/artsPage.ts#ArtsPageContext
  - client/src/game/artsCards.ts#ArtsAsk
  - client/src/game/artsCards.ts#coreChoices
  - client/src/game/artsCards.ts#spellCard
  - client/src/game/artsCards.ts#abilityPictures
  - client/src/game/artGlyphs.ts#mapSvg
  - client/src/game/artFragments.ts#FRAGMENT_MAPS
  - client/src/game/arts.css
  - client/src/combat/abilityBar.ts#AbilityBar
  - client/src/combat/abilityBar.ts#abilityBarOf
---
# Arts

The Arts are Overlook's subclasses ([[Arts Are Overlook's Subclasses]]): Storm, Divine and Shadow, each with an
Anima, two Tenets and a Core of fragments ([[Arts and Loadouts as Claude Shapes Them]]). Every name, word and number
the client shows comes from `content/arts/arts.json`, the file the rules read too. This note covers what the player
sees: the Art's screen in the menu, the Art's diamond on the Character page, and the ability bar on the HUD.

## How it works

- **The Art's diamond** stands on the Character page above the weapons, with the slots: the worn Art's emblem, "Art"
  and its name in its element's colour. Its card names the Art, its spells and its words. Pressed, it opens the Art's
  screen.
- **The Art's screen**, after Destiny's subclass screen: a dark ground washed in the Art's colour, its emblem large and
  faint behind. At the left, the worn Art's name, its element, its diamond large and its words; under them the three
  Arts' diamonds, the worn one edged in brass. Pressing another asks the room to wear it. To the right, in rows under
  engraved headings: ANIMA (one large tile, key F), TENETS (two tiles, keys Q and C), and CORE (three slots).
- **Tiles** are the menu's gear tiles ([[Interface]]), their bevel and glow in the Art's element where an item's are in
  its rarity. Each spell's tile carries its key on a keycap.
- **Cards.** Each spell, fragment and Art shows a card on hover or focus, drawn as the gear's cards are, its band in
  the element: the name, Anima, Tenet or fragment, the element's glyph and name, the picture, then for a spell its
  recharge in seconds large over its numbers (damage, radius, reach, how long it lasts and the rest), and what it
  does.
- **The Core.** Pressing a slot opens its flyout beside it, as a gear slot's does: the Art's six fragments. The one
  set in this slot is set in brass. One set in another slot is dimmed, its slot's number in its corner, and refused
  with the refusal's sound: a fragment is never set twice. Choosing another asks the room to set it, and the flyout
  closes.
- **Asks.** The screen changes nothing itself. It asks the room `{ kind: 'wearArt', art }` or
  `{ kind: 'setCore', art, slot, fragment }`, and shows the Art and Core the room last sent.
- **Keys.** The arrows move to the nearest tile that way, and within an open flyout only among its fragments. Enter
  chooses. Escape closes the flyout, then the screen, and the focus goes back to what opened it.
- **Sizes.** The face keeps its grid: 11 for words, 22 for headings where the menu is wide, 33 for the Art's name.
  The pictures stand at whole multiples of their cells: the large diamond at 8 (7 on a short screen, 11 on a wide
  one), the three Arts' at 2 (3 wide), the Anima's icon at 3, and the Tenets' and fragments' at 4. Past 1440p the
  menu doubles, the screen with it.
- **Pictures** are drawn pixel by pixel in the Art's element: its outline, a deep shade, the body, its light and a
  white heat. The emblems are 24 cells square in a diamond: Storm a forked bolt, Divine a sun with wings, Shadow a
  crescent holding a raven's eye. An Anima's icon is 24 square, a Tenet's and a fragment's 12. Fragments share three
  marks: a diamond broken open is Expose, a four-point spark is Crit, an arrow turning round the icon is a cooldown
  given back.
- **The ability bar** stands at the bottom left, right of the vitals, in a carved window of its own. The Anima is the
  Art's diamond, unlit, filling with colour a row of cells at a time from the bottom as it charges; full, it glows in
  steps. Each Tenet is a sunk square well with its icon, dimmed while it recharges, under a dark wedge that sweeps
  away clockwise from the top in 6-degree steps; under ten seconds left, the seconds stand in it, rounded up. Ready,
  its well is edged and lit in the element. Each key stands on a keycap. The bar is worked out from the Art worn,
  the Anima's charge and each Tenet's recharge, as shares, and each frame writes only what changed.

## Limits

- An Art is looked at only once worn: its diamond's card names its spells.
- A fragment cannot be taken out of a slot, only replaced by another.
- The bar shows the Art's abilities alone, no buffs or debuffs.
