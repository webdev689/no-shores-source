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
  - client/src/combat/spellLooks.ts#SpellLooks
  - client/src/combat/spellLooks.ts#veiledIn
  - client/src/combat/spellLooks.ts#castLookOf
  - client/src/combat/spellDrawers.ts#DRAWERS
  - client/src/combat/spellLands.ts#Lands
  - client/src/combat/animaMoment.ts#AnimaMoments
  - client/src/combat/animaMoment.ts#showAnimaEdge
  - client/src/combat/spellPictures.ts#sigilSprite
  - client/src/combat/spellLines.ts#runeRing
  - client/src/combat/spellPixels.ts#billboard
  - client/src/combat/spellPixels.ts#birdSprite
  - client/src/combat/spellLines.ts#boltLine
  - client/src/combat/spellLines.ts#Tails
  - client/src/combat/casting.ts#daggersAim
  - client/src/player/cardLooks.ts#STATUS_WGSL
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
- **Charge.** The room keeps each player's Anima and Tenets while they are in it, as shares from 0 to 1, and an
  account's for ten minutes after it leaves, as it left them: they are its again as it rejoins, or empty if it now
  wears another Art. It keeps as many as it holds players, the oldest let go first. A first join starts the Anima
  empty and the Tenets ready. Each share fills over its worn spell's recharge, a tick at a time. Each
  kill the player makes gives the Anima 2% more. Wearing another Art empties all three and lets go a cast on its way,
  so no recharge runs at another Art's pace.
- **Casting.** An input names a spell by its number: its Art's number less one, times three, plus its ability (0 the
  Anima, 1 and 2 the Tenets), plus one, so 1 Tempest to 9 Vanish. The room takes it only if it is the worn Art's,
  its share is full, no other cast is on its way, and the player is on foot and not staggered, Charged, dead or dead
  past a section's edge. It releases 18 ticks (0.3 s) after the tick that took it. If the player is staggered,
  Charged, dead or dead past the edge by then, it is lost and costs nothing; else its share empties and the spell is
  cast. Casting is attacking: any spell but Vanish ends the caster's veil as it is cast, though a spell already out,
  a raven's bolt or a ring, does not.
- **Power.** A spell strikes foes alone, never players, in its Art's element: a foe's shield takes three times from a
  matching element and half from another. Its damage is weighed by the power of the Melee loadout's Attack (the Ranged
  one's with no Melee worn) against the foe's level, as a weapon's blow is, then by the statuses, as any blow is
  ([[Combat]]). No weapon's perk touches it or its kill. It is never parried or guarded; a dodge passes it whole, the
  status it would give too. Its kills pay the caster as a weapon's do, to the weapon whose Attack it struck with. It
  never turns its caster's soft lock. A spell that reaches players passes by one dead past the section's edge.
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
| Vanish | On the ground, where a dodge could start, a dodge's hop the way the body moves, or back when still, landing the roll away, blows passing through it as a dodge's do. Then Veiled; out of what a dodge cannot leave (a dodge, a flinch's first 8 ticks, the tick before a blow lands, a reload, an overreach), the veil without the hop, and what the player was doing runs on | 3 m, the veil's 4 s | Night: 6 s. Hunt: see above |

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
  until the room's word on the Arts has come back since, 0.6 s at least and 2 s at most (a cast the room lets fall
  sends no word). Crouching stays on `C`, and the guard on the left button or `F`, as DFO has them. With the menu
  open the game takes no keys, so `F` still dismantles a piece there.
- **Dusk Daggers.** Pressed, `Q` aims: the input asks for the crosshair's point as it is, and a faint ring in
  Shadow's purple lies where the room will lay it: that point drawn in to 16 m, on the ground's height there, as
  wide as the ring will be. Let go, it casts there.
- **The cast's look.** A cast sent plays the cast move: from outside the forge's `cast` with its `spark`, the spark
  recoloured by its brightness to the Art's element and glowing in it (the forge draws the spark as hanging free, so
  the compositor is told to count it as the weapon, and only the spark is recoloured, never a weapon in the hand);
  in first person both casting hands, under the Art's light
  (Divine fire, Storm shock, Shadow magic) recoloured the same way. Another player's cast plays the same, in the Art
  of the last spell of theirs the room sent.
- **A room joined afresh** forgets a cast still waiting to be sent, the room's word on the Arts, the keys' wait and
  any aim: nothing from the old room goes to the new one.
- **The bar** is the fight display's, in the game and the Test Ground alike, written each frame from the room's word
  on the Arts. The game layer hands the combat layer its pictures.
- **The spells' view.** Every spell in the snapshot is kept and drawn gliding between the snapshots as the figures
  do (below). The fight keeps the last spell the player cast, with the room tick it was asked at, so an Anima's sigil
  starts as it is asked.
- **The Test Ground** has an Arts panel: the Art worn, each Core slot, and a button that fills the Anima and readies
  the Tenets, so every spell can be tried at once ([[Test Ground]]).

## How they look

- **Drawn as marks.** Every spell is drawn with the fight's marks, in its Art's element: Storm's in Volt, Divine's in
  Blaze, Shadow's in Cosmic, in the Test Ground and the Game alike. Its pictures are made cell by cell, a cell two of
  a figure's pixels across (three for the Dawnflare and the sigils), each cell one of the element's four colours with
  nothing between, stood upright and turned to the eye as a figure's card is. Its lines are flat colours too:
  lightning is a glow in the element's body under a white-hot core, struck afresh 12 times a second. What bursts or
  trails throws the fight's sparks in the element. A picture nearer the eye than 0.6 m is left out.
- **Read from afar.** A line is never drawn thinner than about a pixel and a half at 720p for its core and three for
  its glow, however far off; a line or ring on the ground is widened where it is seen aslant, up to 1 m, so a spell
  20 m away still reads.
- **Where it is drawn.** Each spell glides between the room's snapshots as the figures do, a tick behind the newest,
  and what a spell lays on a figure (a crackle, a slash, a beam, a raven) is laid where that figure is drawn. What
  lies on the ground is drawn first, then what stands, the farthest first. With no snapshot for a quarter of a second
  (the link lost, or the player sent away), no spell is drawn.
- **Start, life and end.** Every spell shows as it starts, while it lasts and as it ends: what lasts (the Sunwell,
  the Duskraven, Dusk Daggers) blinks every other four frames over its last half second, and each leaves a mark the
  frame after the room lets it go. A burst or puff left nearer the eye than 1.2 m for each of its sizes is not drawn,
  so none fills the view in first person.
- **Tempest.** Each orb is 21 cells, a white-hot heart in Volt's steps, its rim broken and three arcs thrown off it
  at each strike, with an afterimage of itself on every other row three frames behind, trailing a line that narrows
  and darkens in three steps over a quarter of a second, and Volt motes. It pops as it leaves the chest. An orb that
  ends early has struck: a nova bursts there (a star for 3 frames, a ring for 3, a broken ring for 4, 1.2 m across)
  with eight forks of lightning; one spent at its time pops.
- **Quicken.** A jagged ring of lightning on the ground at the caster's feet, swelling in three steps from 0.8 m to
  2 m over its half second, three bolts climbing the caster's front from the ground to the chest for eight frames,
  and a burst of sparks. A Hasted player leaves three
  streaks behind them as they move, each 0.3 s long and three of a figure's pixels across at its newest.
- **Arc Lash.** Five bolts reaching out over 0.1 s and thinning in three steps: one to the chest of each foe in its
  cone and reach, nearest first, the rest fanned through it. A flash at the caster's hand; as they reach, an impact
  star on each foe struck and sparks at each end; a zigzag scorch in the element's dark under each bolt, breaking up
  over 1.2 s.
- **Sunwell.** A sun 3.5 m over the ground, 1.5 m along where its caster aimed as it was cast, high in their view
  and never over their head, bobbing a cell at a time, its eight rays turning; a white-hot flash as it comes, and a
  burst as it goes. Twelve dashes on the ground at its radius, turning, and inside them three bands 0.2 m wide
  pulsing in four steps a second. Every other Linked player inside it has a beam a metre long falling onto their
  head (never the player's own, which would stand in the middle of their view), and each Linked player six motes
  rising off them, cooling a step as they rise.
- **Mend.** Over the caster's chest and nearer the eye than their cast, a white-hot flash with a cross through it,
  then a ring swelling and cooling in four steps, 33 cells across; eight crosses of light rising off the caster; a
  burst of embers.
- **Dawnflare.** A bird of fire 1.5 m over the ground, its cells three of a figure's pixels, facing the way it flies,
  its wings beating in four steps ten times a second, its outline flickering, embers trailing behind it; within 2 m of
  the eye, as it flies out past the camera, only its embers show. The ground burns where it passed: a lane 1.5 m wide, a
  core of light flaring white-hot between broken tongues of the element's body, flickering 12 times a second and cooling
  to its dark over 1.5 s. A foe it burns bursts in three tongues of flame with an impact star; at its flight's end the
  bird bursts in flame and embers.
- **Duskraven.** A raven of Cosmic light off its caster's right shoulder, its cells a figure's own pixels, its wings
  beating six times a second; the player's own sits on their figure as the page predicts it, and is not drawn within a
  metre of the eye, as in first person. It comes in a pop and goes in a pop and smoke. While a bolt flies, a diamond
  broken at its corners blinks over the foe it seeks. Each bolt is a star of four points trailing a line of light 0.1 s
  long, glinting stars and Cosmic motes, and it ends in an impact star.
- **Dusk Daggers.** Its ring, as it is aimed and where it lies, is a rune ring: a floor dithered an eighth in the
  element's dark, a dotted circle in its body 0.35 m in, and an edge in its light, white-hot for two ticks at each
  strike, when a slash crosses each foe inside it (white-hot one frame, light two). Eight blades whirl over it, each
  turning over in sixteenth-turns, the farthest drawn first. It ends in a pop.
- **Vanish.** A puff of dusk where the roll began, half again as large, swelling and thinning in four steps, a burst
  of Cosmic motes, and six small puffs of smoke left round it that rise and thin over a second.
- **Landing.** A spell that lands on a foe bursts in its caster's Art's element, whatever weapon is drawn
  ([[Weapon Glow]]), with an impact star where the orbs', bolts', lash's and slashes' own marks are not.
- **An Anima's moment.** While the player's own Anima charges (its 18 ticks), its Art's sigil lies 3 m across at their
  feet: four rings lighting from the outside in, the newest white-hot, then its figure (Storm's eight spokes, Divine's
  sun, Shadow's crescent). As it is released, on every screen: the sigil white-hot for two frames, then cooling and
  breaking up in three steps of four frames; a ring bursting out across the ground, white-hot, light, then body, 4 m to
  7.2 m across over six frames; and the Art's flourish: lightning from 9 m up onto the caster, the sun's shaft falling
  to the ground under it, or a pop at the raven's shoulder with smoke round the caster (none of it through the caster's
  own eyes, nor sparks thrown within 2 m of the eye). The caster's own screen takes a frame of the element round its
  edge, bands of 8 pixels in its light outside its body, at a quarter opacity for two frames, then a sixth, then a
  tenth, gone after six, and the view pushes in 5% and eases back in held steps over 20 frames, in third person and
  first. No flash fills the screen.
- **Statuses.** Each shows in the figure's own pixels, on the player's figure as on a foe's. Exposed edges the
  figure two pixels thick, stepping between Cosmic's body and light four times a second, with a cracked diamond of
  nine cells beside a foe's head, clear of its plate. Veiled keeps the figure's outline in Cosmic's light, an eighth
  of its inside in dusk and a band of shimmer crossing it every 0.8 s; it shows no weapon outline, throws no shadow
  and has no contact shade. Charged strikes three jagged Volt arcs inside the figure, never past its edge, 12 times a
  second, edges it on alternate strikes and shakes it a pixel either way, and a foe throws 24 Volt sparks a second.
- **What it costs.** Each picture is made once for each of its steps (the sun's 32 turns, the blades' 16, the orb's
  16 crackles, the birds' four beats each in eight flickers) and each run of its cells worked out once, and a frame's
  marks are written over the last frame's in place. With every spell up at once, a frame of them takes under a
  millisecond in Node and leaves about a quarter of a megabyte to collect.

## Limits

- An Art is looked at only once worn: its diamond's card names its spells.
- A fragment cannot be taken out of a slot, only replaced by another.
- The bar shows the Art's abilities alone, no buffs or debuffs.
- Another player's first cast shows the forge's own spark until the room sends a spell of theirs; after they change
  Art, their next cast shows the old Art's colour until its spell comes.
- A spell's pictures stand upright, as the figures do: seen from straight above they are thin.
- A cast is refused on horseback only as it is asked: one taken on foot still releases if the player mounts within
  its 0.3 s.
- A spell looks through walls: an orb, a bolt or an area finds a foe behind a block, and an orb flies through one.
- Another player's Anima shows no charging sigil, only its release: the room sends no cast until it is out.
- What a spell leaves as it lands is laid at a foe's figure as drawn, not as the attack feel shifts it.
