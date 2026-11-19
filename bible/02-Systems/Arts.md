---
type: system
status: live
code:
  - content/arts/arts.json
  - client/src/game/artsPage.ts#artsPage
  - client/src/game/artsPage.ts#artDiamond
  - client/src/game/artsPage.ts#ArtsPageContext
  - client/src/game/gearWindow.ts#startGearWindow
  - client/src/game/artsCards.ts#ArtsAsk
  - client/src/game/artsCards.ts#coreChoices
  - client/src/game/artsCards.ts#spellCard
  - client/src/player/artGlyphs.ts#abilityPictures
  - client/src/player/artGlyphs.ts#mapSvg
  - client/src/game/artFragments.ts#FRAGMENT_MAPS
  - client/src/game/arts.css
  - client/src/combat/abilityBar.ts#AbilityBar
  - client/src/combat/abilityBar.ts#abilityBarOf
  - crates/gear/src/arts.rs#WornArts
  - crates/gear/src/arts.rs#ArtRefusal
  - crates/room/src/arts.rs#Casting
  - crates/room/src/arts.rs#spell_power
  - crates/room/src/spells.rs#SpellSeen
  - crates/protocol/src/gear_wire.rs#WEAR_ART
  - client/src/network/artMessages.ts#ArtState
  - client/src/network/artMessages.ts#SeenSpell
  - client/src/combat/casting.ts#CastKeys
  - client/src/combat/casting.ts#abilitiesAt
  - client/src/combat/spellEffects.ts#SpellEffects
  - client/src/testground/artsPanel.ts#startArtsPanel
---
# Arts

The Arts are Overlook's subclasses ([[Arts Are Overlook's Subclasses]]): Storm, Divine and Shadow, each with an
Anima, two Tenets and a Core of fragments ([[Arts and Loadouts as Claude Shapes Them]]). Every name, word and number
the client shows comes from `content/arts/arts.json`, the file the rules read too, the fragments' numbers with it.
This note covers what the player sees (the Art's screen in the menu, the Art's diamond on the Character page, the
ability bar on the HUD), how the rules cast each spell, and how the browser asks for a cast.

## How it works

- **The Art's diamond** stands on the Character page above the weapons, with the slots: the worn Art's emblem, "Art"
  and its name in its element's colour. Its card names the Art, its spells and its words. Pressed, it opens the Art's
  screen in the Character page's place, the footer's Back closing it as Escape does.
- **The Art's screen**, after Destiny's subclass screen: a dark ground washed in the Art's colour, its emblem large and
  faint behind. At the left, the worn Art's name, its element, its diamond large and its words; under them the three
  Arts' diamonds, the worn one edged in brass. Pressing another asks the room to wear it. To the right, in rows under
  engraved headings: ANIMA (one large tile, key R), TENETS (two tiles, keys Q and G), and CORE (three slots).
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
- **Sizes.** The face keeps its grid: 11 for words, 22 for headings where the menu is wide, 33 for the Art's name. The
  pictures stand at whole multiples of their cells: the large diamond at 8 (7 on a short screen, 11 on a wide one), the
  three Arts' at 2 (3 wide), the Character page's at 4 (2 on a short screen and where the menu doubles), the Anima's
  icon at 3, and the Tenets' and fragments' at 4. Past 1440p the menu doubles, the screen with it.
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

## In the rules

- **Worn and kept.** A character wears one Art, Storm from the start, and keeps a Core for each Art: three slots,
  each holding a fragment's place in its Art's list or nothing. Both are saved with the character; a save without
  them wears Storm with every Core empty, and a broken one is made whole on reading ([[Gear]]).
- **Asks.** The room answers `wearArt` and `setCore` as it does the gear's asks, in turn with the player's inputs.
  An unknown Art is refused (answer 110), a slot outside 0 to 2 (111), a fragment outside 0 to 5 (112), and one set
  already in another slot of that Art (113). Only the worn Art's Core changes its spells.
- **Charge.** The room keeps each player's Anima and Tenets while they are in it, as shares from 0 to 1. A new room
  starts the Anima empty and the Tenets ready. Each share fills over its worn spell's recharge, a tick at a time. Each
  kill the player makes gives the Anima 2% more. Wearing another Art empties all three and lets go a cast on its way,
  so no recharge runs at another Art's pace.
- **Casting.** An input names a spell by its number: its Art's number less one, times three, plus its ability (0 the
  Anima, 1 and 2 the Tenets), plus one, so 1 Tempest to 9 Vanish. The room takes it only if it is the worn Art's,
  its share is full, no other cast is on its way, and the player is not staggered, Charged, dead or dead past a
  section's edge. It releases 18 ticks (0.3 s) after the tick that took it. If the player is staggered, Charged or
  dead by then, it is lost and costs nothing; else its share empties and the spell is cast.
- **Power.** A spell strikes foes alone, never players, in its Art's element: a foe's shield takes three times from a
  matching element and half from another. Its damage is weighed by the power of the Melee loadout's Attack (the Ranged
  one's with no Melee worn) against the foe's level, as a weapon's blow is, then by the statuses, as any blow is
  ([[Combat]]). No weapon's perk touches it. It is never parried or guarded; a dodge passes it whole, the status it
  would give too. Its kills pay the caster as a weapon's do, to the weapon whose Attack it struck with.
- **Gives back.** A Volt kill with Recharge set takes 4% off both Tenets; a Blaze kill while Linked, with Zeal, 5%.
  A crit landed out of Vanish's veil, with Hunt, gives back half of Vanish's cooldown, once a Vanish. A Cosmic kill on
  an Exposed foe, with Dread, keeps the player's Duskraven 2 s longer. With Cruelty, the player's crits on Exposed
  foes deal 1.1 times. With Overload, every foe the player Charges, by any means, is Exposed too.

| Spell | What the room does | Numbers | Core |
|---|---|---|---|
| Tempest | Orbs leave the chest one by one over 1 s, fanned over 90 degrees ahead and rising. Each seeks the living foe nearest it within reach, keeps it while it lives and stays in reach, turns toward it, and is spent on the first foe it touches | 6 orbs, 30 m, 14 m/s, 4 rad/s, 4 s, 18 damage | Pursuit: 8 orbs |
| Quicken | Haste on the caster and every living player within reach | 12 m, Haste's 6 s | Gale: 18 m and 9 s. Momentum: Crit on the caster as long |
| Arc Lash | Each foe within 7 m in a 70-degree cone along the aim is struck, then Charged | 16 damage, Charge by rank | Conduction: Charge 1.5 times as long. Overload: Exposed |
| Sunwell | An orb at the caster's feet. Each tick, every living player within reach is Linked, so it lingers 3 s after | 10 m, 12 s | Radiance: 13 m, 16 s |
| Mend | Heals the caster | 40 | Mercy: players within 8 m heal 20. Resolve: Crit |
| Dawnflare | A bird flies from 3 m behind the chest along the aim, burning each foe within 3 m of it once a pass | 24 m in 1.6 s, 14 damage | Wings: a second pass back. Searing: Exposes |
| Duskraven | A raven at the right shoulder. On its first tick and every 0.8 s it fires a bolt at the foe nearest it within reach. The bolt flies at its foe, strikes, Exposes and heals the caster half the health it took, or fizzles if its foe falls first | 12 s, 22 m, 30 m/s, 7 damage | Hunger: heals all it took. Dread: see above |
| Dusk Daggers | Aimed while held, then a ring where it was aimed, drawn in to the reach, always on the ground there. Every 0.5 s from its first tick, each foe inside is struck and Exposed | 16 m, 4 m ring, 5 s, 3 damage | Blades: 5.5 m ring, 7 s |
| Vanish | On the ground, a dodge's hop the way the body moves, or back when still, landing the roll away, blows passing through it as a dodge's do. Then Veiled; out of a reload or an overreach, which a dodge cannot leave, the veil without the hop | 3 m, the veil's 4 s | Night: 6 s. Hunt: see above |

- **Seen by all.** Each spell that lasts or moves is an entity every player is sent: an orb, the Sunwell, the
  Dawnflare, the Duskraven, each bolt and the daggers' ring. Quicken, Arc Lash, Mend and Vanish each leave one for
  half a second, so every screen can show them. A spell whose caster leaves goes with them.

## On the wire

- **The input** carries `cast`, the spell's number (0 none), and `cast_aim`, a point: with Dusk Daggers while it is
  held (spell 0) and as it is let go.
- **The snapshot** carries `spells`, left out when there are none: each one's number, kind (its spell's number, or 10
  for a bolt), caster, Art, where it is, where it heads (the Dawnflare's end, Arc Lash's reach ahead), the foe it
  seeks, its age and life in ticks, and its radius.
- **The player's own gear** carries `art`, `cores` (three slots an Art in the Arts' order, 255 for none), `anima` and
  `tenets`, each share as the tick that sent it had it. It is sent whenever a cast releases, a kill gives charge or an
  ask changes them; between, the browser runs each share on by its recharge (`abilitiesAt`).
- **The asks** are numbered 40 (`wearArt`, the Art in `column`), 41 (`setCore`, the Art in `column`, the slot in
  `slot`, the fragment in `node`) and, in the Test Ground alone, 36 (the Anima full and the Tenets ready).

## In the browser

- **Keys.** `R` casts the Anima, `Q` the first Tenet and `G` the second. A press is sent only while the bar shows its
  ability ready, the pointer held and the player on foot, not staggered, down or dead; then no other is sent for 0.6 s,
  while the room's word comes back. Crouching stays on `C`, and the guard on the left button or `F`, as DFO has them.
  With the menu open the game takes no keys, so `F` still dismantles a piece there.
- **Dusk Daggers.** Pressed, `Q` aims: a faint ring in Shadow's purple lies on the ground at the crosshair's point,
  drawn in to 16 m, as wide as the ring will be. Let go, it casts there.
- **The cast's look.** A cast sent plays the cast move: from outside the forge's `cast` with its `spark`, the spark
  recoloured by its brightness to the Art's element and glowing in it; in first person both casting hands, under the
  Art's light (Divine fire, Storm shock, Shadow magic) recoloured the same way.
- **The bar** is the fight display's, in the game and the Test Ground alike, written each frame from the room's word
  on the Arts. The game layer hands the combat layer its pictures.
- **The spells' view.** Every spell in the snapshot is kept, each with where it was the snapshot before, for a drawer
  to glide between (`SpellEffects`). Nothing draws them yet beyond the cast move and the aiming ring.
- **The Test Ground** has an Arts panel: the Art worn, each Core slot, and a button that fills the Anima and readies
  the Tenets, so every spell can be tried at once ([[Test Ground]]).

## Limits

- An Art is looked at only once worn: its diamond's card names its spells.
- A fragment cannot be taken out of a slot, only replaced by another.
- The bar shows the Art's abilities alone, no buffs or debuffs.
- The spells are not drawn yet beyond the cast move and Dusk Daggers' ring; another player's cast shows the forge's
  own spark.
- A spell looks through walls: an orb, a bolt or an area finds a foe behind a block, and an orb flies through one.
