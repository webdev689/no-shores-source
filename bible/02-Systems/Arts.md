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
  - client/src/player/artGlyphs.ts#EMBLEM_FRAME
  - client/src/game/artScenes.ts#sceneOf
  - client/src/game/artScenes.ts#sceneStep
  - client/src/game/artStage.ts#artStage
  - client/src/game/artsCards.ts#rechargeWords
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
  - client/src/combat/spellLooks.ts#SpellLooks
  - client/src/combat/spellLooks.ts#veiledIn
  - client/src/combat/spellLooks.ts#castLookOf
  - client/src/combat/spellPixels.ts#billboard
  - client/src/combat/spellPixels.ts#birdSprite
  - client/src/combat/spellLines.ts#boltLine
  - client/src/combat/spellLines.ts#Tails
  - client/src/combat/casting.ts#daggersAim
  - client/src/player/glowCards.ts#STATUS_WGSL
  - client/src/forge/compose.ts#composeFrame
  - client/src/testground/artsPanel.ts#startArtsPanel
---
# Arts

The Arts are Overlook's subclasses ([[Arts Are Overlook's Subclasses]]): Storm, Divine and Shadow, each with an
Anima, two Tenets and a Core of fragments ([[Arts and Loadouts as Claude Shapes Them]]). Every name, word and number
the client shows comes from `content/arts/arts.json`, the file the rules read too, the fragments' numbers with it.
This note covers what the player sees (the Art's screen in the menu, the Art's diamond on the Character page, the
ability bar on the HUD), how the rules cast each spell, how the browser asks for a cast, and how each spell looks.

## How it works

- **The Art's diamond** is the first row under the Character page's Weapons heading, as tall as a slot's row, so the
  weapons' rows stand level with the armour's: the worn Art's emblem, "Art" and its name in its element's colour. Its
  card names the Art, its spells and its words. Pressed, it opens the Art's screen in the Character page's place, the
  focus on its Anima, the footer's Back closing it as Escape does.
- **The Art's screen**, after Destiny's subclass screen: the Art's scene behind it (below), its drama in the room right
  of the rows, over a dark ground lit in the Art's colour, strongest at the right and darkened at the top and foot. At
  the top left, the worn Art's name, its element, its emblem large in a double diamond of its colours with brass at
  the points, the three Arts' diamonds, then its words, kept two lines tall so nothing moves as the Art changes. The
  others stand subdued; the worn one is ringed in brass, a focused one in white, each 2 px over a dark pixel. Pressing
  another asks the room to wear it. To the right, in rows under engraved headings tinted in the element and ticked at
  their right ends: ANIMA (one large tile, key R), TENETS (two tiles, keys Q and G), and CORE (three slots), the Core's
  heading counting what is set ("Core · 1 of 3") and its rule as long as the line above. Under the Core, each fragment
  set is written out: its name in the element's light, what it does after it.
- **Tiles** are the menu's gear tiles ([[Interface]]), their bevel and glow in the Art's element where an item's are in
  its rarity. A spell's tile is no press: it takes the focus for its card, and its key stands on a keycap centred
  under it, half over its frame, as on the bar. An empty Core slot keeps its frame whole and its mark faint.
- **Cards.** Each spell, fragment and Art shows a card beside its row (the Arts' diamonds, the Anima and Tenets, the
  Core's slots, a flyout) so it never covers the next tile, drawn as the gear's cards are, its band in the element:
  the name, Anima, Tenet or fragment, the element's glyph and name, the picture, then for a spell its recharge large
  ("Recharge": under a minute in seconds, "38 s", else minutes and seconds, "8:20") over its numbers (damage, radius,
  reach, how long it lasts and the rest), and what it does.
- **The Core.** Pressing a slot opens its flyout beside it, as a gear slot's does: the Art's six fragments. The one
  set in this slot is set in brass. One set in another slot is dimmed, its slot's number in its corner, and refused
  with the refusal's sound: a fragment is never set twice. Choosing another asks the room to set it, and the flyout
  closes; the slot stands in brass until the room's word comes, then flares white and in the element over 0.36 s with
  a bell, as a gain chimes.
- **Asks.** The screen changes nothing itself. It asks the room `{ kind: 'wearArt', art }` or
  `{ kind: 'setCore', art, slot, fragment }`, and shows the Art and Core the room last sent.
- **Keys.** The footer lists them: Click, the arrows, Enter and Escape. The arrows move to the nearest tile that way,
  and within an open flyout only among its fragments. Enter chooses. Escape closes the flyout, then the screen, and the
  focus goes back to what opened it. The screen is a region named by the Art's name, so a screen reader reads it first.
- **Sizes.** The face keeps its grid: 11 for words, 22 for headings, words and keycaps where the menu is wide, 33 for
  the Art's name (55 where wide). The pictures stand at whole multiples of their cells: the large emblem's 24 cells
  and its 32-cell frame at 8 (7 on a short screen, 11 on a wide one, 10 where wide but under 1000 px tall), the three
  Arts' at 2 (3 wide), the Character page's at 4 everywhere, the Anima's icon at 3, and the Tenets' and fragments' at
  4. The screen starts at its top, 66 px down (33 on a short screen, 88 wide, 44 wide but under 1000 px tall), so
  nothing stands on half a pixel and its words stay above the foot. Past 1440p the menu doubles, the
  screen with it.
- **Pictures** are drawn pixel by pixel in the Art's element: its outline, a deep shade, the body, its light and a
  white heat, and brass for a frame's points. The emblems are 24 cells square in a diamond: Storm a forked bolt,
  Divine a sun with wings, Shadow a crescent holding a raven's eye. An Anima's icon is 24 square, a Tenet's and a
  fragment's 12. Fragments share three marks: a diamond broken open is Expose, a four-point spark is Crit, an arrow
  turning round the icon is a cooldown given back.
- **The scene** is made by the page, cell by cell, each cell one of the four stops of the element's glow or none, at 4
  px a cell (6 where the menu is wide). Storm is a stormy sky over a ridge, rain slanting under it, four forked bolts
  striking in turn, each flickering twice and lighting the clouds round its root and the ground it strikes. Divine is
  a sun rising over a sea, its twelve rays turning, two wings of flame flickering up from its flanks, embers drifting
  and its light broken on the water. Shadow is stars and a dusky haze round a crescent, the rest of its disc faint, a
  raven's eye in its hollow that glances about and blinks, stars lighting in crosses one after another. Its middle
  stands in the room right of the rows, and it fades out toward the left in a dither. Its still cells are worked out
  only when the Art or the screen's size changes; it steps six times a second round a loop of 48 steps, only while
  shown. With less motion asked for, it stands still.
- **Motion**, in steps: opening, the scene fades in, the emblem opens from its middle as a diamond and its glow swells
  once, and the rows rise in turn, all within 0.4 s; wearing another Art flashes the screen in its colour and opens
  its emblem again. The Anima's tile breathes. With less motion asked for, none of it plays.
- **The ability bar** stands at the bottom left, right of the vitals, in a carved window of its own. The Anima is its
  own icon, the one the Art's screen shows, unlit but for its outline, filling with colour a row of cells at a time
  from the bottom as it charges; full, it glows in steps. Each Tenet is a sunk square well with its icon, dimmed while
  it recharges, under a dark wedge that sweeps away clockwise from the top in 6-degree steps; under ten seconds left,
  the seconds stand in it, rounded up. Ready, its well is edged and lit in the element. Each key stands on a keycap
  under its icon, the three on one line. Where the HUD is wide (1500 by 900 and up) the Anima stands at 4 times its
  cells, the Tenets' icons at 4 in 52 px wells, and the keycaps at 22. The bar is worked out from the Art worn, the
  Anima's charge and each Tenet's recharge, as shares, and each frame writes only what changed.

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
  ([[Combat]]). No weapon's perk touches it or its kill. It is never parried or guarded; a dodge passes it whole, the
  status it would give too. Its kills pay the caster as a weapon's do, to the weapon whose Attack it struck with.
- **Gives back.** A Volt kill with Recharge set takes 4% off both Tenets; a Blaze kill while Linked, with Zeal, 5%;
  a weapon's kill with the perk Spellfeed on its loadout, 3% ([[Gear]], "Verbs"). A crit landed out of Vanish's veil,
  with Hunt, gives back half of Vanish's cooldown, once a Vanish. A Cosmic kill on an Exposed foe, with Dread, keeps
  the player's Duskraven 2 s longer. With Cruelty, the player's crits on Exposed foes deal 1.1 times. With Overload,
  every foe the player Charges, by any means, is Exposed too.

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

- **Keys.** `R` casts the Anima, `Q` the first Tenet and `G` the second. A press is sent only while the bar shows
  its ability ready, the pointer held and the player on foot, not staggered, down or dead; then no other is sent
  until the room's word shows that ability spent (its share under full) or another Art worn, 2 s at most (a cast the
  room lets fall sends no word). Any other word from the room in between leaves the keys waiting. Crouching stays on `C`, and the guard on the left button or `F`, as DFO has them. With the menu
  open the game takes no keys, so `F` still dismantles a piece there.
- **Dusk Daggers.** Pressed, `Q` aims: the input asks for the crosshair's point as it is, and a faint ring in
  Shadow's purple lies where the room will lay it: that point drawn in to 16 m, on the ground's height there, as
  wide as the ring will be. Let go, it casts there.
- **The cast's look.** A cast sent plays the cast move: from outside the forge's `cast` with its `spark`, the spark
  recoloured by its brightness to the Art's element and glowing in it (the forge draws the spark as hanging free, so
  the compositor is told to count it as the weapon); in first person both casting hands, under the Art's light
  (Divine fire, Storm shock, Shadow magic) recoloured the same way. Another player's cast plays the same, in the Art
  of the last spell of theirs the room sent.
- **A room joined afresh** forgets a cast still waiting to be sent, the room's word on the Arts, the keys' wait and
  any aim: nothing from the old room goes to the new one.
- **The bar** is the fight display's, in the game and the Test Ground alike, written each frame from the room's word
  on the Arts. The game layer hands the combat layer its pictures.
- **The spells' view.** Every spell in the snapshot is kept, each with where it was the snapshot before, and drawn
  gliding between the two (below).
- **The Test Ground** has an Arts panel: the Art worn, each Core slot, and a button that fills the Anima and readies
  the Tenets, so every spell can be tried at once ([[Test Ground]]). After each ask, the room's next word sets every
  list back to what it holds, so a refused choice does not stay shown.

## How they look

- **Drawn as marks.** Every spell is drawn with the fight's marks, in its Art's element: Storm's in Volt, Divine's in
  Blaze, Shadow's in Cosmic, in the Test Ground and the Game alike. Its pictures are made cell by cell, a cell two of
  a figure's pixels across, each cell one of the element's four colours with nothing between, stood upright and
  turned to the eye as a figure's card is. Its lines are flat colours too: lightning is a glow in the element's body
  under a white-hot core, struck afresh 12 times a second. What bursts or trails throws the fight's sparks in the
  element. A picture nearer the eye than 0.6 m is left out.
- **Tempest.** Each orb is a white-hot heart in Volt's steps, its rim broken and three arcs thrown off it at each
  strike, trailing a line that narrows and darkens in three steps over a quarter of a second, and Volt motes.
- **Quicken.** A jagged ring of lightning on the ground at the caster's feet, swelling in three steps over its half
  second, and a burst of sparks. A Hasted player leaves three streaks behind them as they move, each 0.3 s long.
- **Arc Lash.** Five bolts fanned through the cone, reaching out over 0.1 s and thinning in three steps, with sparks
  where they end.
- **Sunwell.** A sun 6 m over its middle, clear of the view of a player standing in it, bobbing a cell at a time, its
  eight rays turning; twelve dashes on the ground at its radius, turning; and a beam from the sun to each Linked player
  inside it. A Linked player has six motes rising off them, cooling a step as they rise.
- **Mend.** Over the caster's chest, a white-hot flash with a cross through it, then a ring swelling and cooling in
  four steps, and a burst of embers.
- **Dawnflare.** A bird of fire facing the way it flies, its wings beating in four steps ten times a second, its
  outline flickering, embers trailing behind it.
- **Duskraven.** A raven of Cosmic light off its caster's right shoulder, its cells a figure's own pixels, its wings
  beating six times a second; the player's own sits on their figure as the page predicts it. Each bolt is a star of
  four points trailing glinting stars and Cosmic motes.
- **Dusk Daggers.** The aiming ring stays on the ground where it was cast, lit for 4 ticks at each strike, with eight
  blades whirling over it, each turning over in sixteenth-turns.
- **Vanish.** A puff of dusk where the roll began, swelling and thinning in four steps, and a burst of Cosmic motes.
- **Statuses.** An Exposed foe's figure has its outline lit a faint purple. A Veiled player's figure, their own from
  outside and every other's, keeps 5 pixels of each 4 by 4, the kept ones moving on 8 times a second, tinted dusk,
  and shows no weapon outline. A Charged foe crackles: two arcs across its figure struck afresh 12 times a second, and
  24 Volt sparks a second.
- **Hits.** A spell that lands bursts in its caster's Art's element, whatever weapon is drawn ([[Weapon Glow]]).

## Limits

- An Art is looked at only once worn: its diamond's card names its spells.
- The scene is the same for every player of an Art; it is not the player's figure, as Destiny's is.
- A fragment cannot be taken out of a slot, only replaced by another.
- The bar shows the Art's abilities alone, no buffs or debuffs.
- Another player's first cast shows the forge's own spark until the room sends a spell of theirs; after they change
  Art, their next cast shows the old Art's colour until its spell comes.
- A spell's pictures stand upright, as the figures do: seen from straight above they are thin.
- A spell looks through walls: an orb, a bolt or an area finds a foe behind a block, and an orb flies through one.
