---
type: system
status: live
code:
  - content/arts/arts.json
  - client/src/game/artsPage.ts#artsPage
  - client/src/game/artsPage.ts#ArtsState
  - client/src/game/artsRows.ts#artsRows
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
  - client/src/combat/abilityBar.ts#AbilityBar
  - client/src/combat/abilityBar.ts#abilityBarOf
  - crates/gear/src/arts.rs#WornArts
  - crates/gear/src/arts.rs#ArtRefusal
  - client/src/game/artLevels.ts#levelOf
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
  - client/src/testground/artsPanel.ts#artsNodes
---
# Arts

The Arts are Overlook's subclasses ([[Arts Are Overlook's Subclasses]]): Storm, Divine and Shadow, each with an
Anima, two Tenets and a Core of fragments ([[Arts and Loadouts as Claude Shapes Them]]). Every name, word and number
the client shows comes from `content/arts/arts.json`, the file the rules read too, the fragments' numbers with it.
An Art, its Anima and each Tenet are earned on its house's road ([[Quests]]): a new character wears none until
then, and a character made before earns them all. This note covers what the player sees (the Art's screen in the menu, the Art's diamond on the Character page, the
ability bar on the HUD), how the rules cast each spell, how the browser asks for a cast, and how each spell looks.

## How it works

- **The Art's diamond** is the first row under the Character page's Weapons heading, as tall as a slot's row, so the
  weapons' rows stand level with the armour's: the worn Art's emblem, "Art" and its name in its element's colour, its
  level as five small pips under the name. Its card names the Art, its spells and its words. Pressed, it opens the Art's screen in the Character page's place, the
  focus on its Anima, the footer's Back closing it as Escape does.
- **The Art's screen**, after Destiny's subclass screen: the Art's scene behind it (below), its drama in the room right
  of the rows, over a dark ground lit in the Art's colour, strongest at the right and darkened at the top and foot. At
  the top left, the worn Art's name, its element, its emblem large in a double diamond of its colours with brass at
  the points, the three Arts' diamonds, then its words, kept two lines tall so nothing moves as the Art changes. The
  others stand subdued; the worn one is ringed in brass, a focused one in white, each 2 px over a dark pixel. Pressing
  another asks the room to wear it. To the right, in rows under engraved headings tinted in the element and ticked at
  their right ends: ANIMA (one large tile, key R), TENETS (two tiles, keys Q and G), and CORE (three slots), the Core's
  heading counting what is set and owned ("Core · 1 of 3 · 2 owned") and its rule as long as the line above. Under the
  Core, each fragment set is written out: its name in the element's light, what it does after it.
- **The level** ([[Factions]]): the worn Art's name carries five pips lit to its level, read aloud as "Level n". Under
  the three Arts' diamonds (each with its own small pips, so they never move) its bar fills with the XP its kills
  earn: "3,200 of 8,000", then, full, "Ready to rise at the Stormcallers' counter", or "Highest level", in brass when
  full or at level 5, with the faction's emblem small at its end, its card naming the faction and what its counter
  does. The element's line says the share the spells hold ("Spells at 70%"). Spell and fragment cards give their
  numbers at the level worn, the harm and healing by its power and how long a spell and its buffs last by its lasting
  (the Sunwell's healing a second too), with what differs at level 5 muted under them; the rest as written. A fragment
  not owned stands dim under a padlock, its card saying how it is had ("Raise the Art at the Stormcallers' counter, or
  buy it there from their first rank."), and choosing it in a slot's flyout is refused before it is asked, with the
  refusal's sound and words. Until the room has said where the player stands, every Art shows level 1 with every
  fragment owned, so the screen locks nothing the room would allow.
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
- **Keys.** The footer lists them: Click, the arrows, Enter and Escape. The arrows move to the nearest tile that way.
  Enter chooses. Escape closes the flyout, then the screen, and the
  focus goes back to what opened it. The screen is named by the Art's name, so a screen reader reads it first.
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
- **Motion**, in steps: opening, the scene fades in, the emblem opens from its middle, and the rows rise in turn, all within 0.4 s; wearing another Art flashes the screen in its colour and opens
  its emblem again. The Anima's tile breathes. With less motion asked for, none of it plays.
- **The ability bar** stands at the bottom left, left of the weapons, after Destiny's abilities ([[Interface]], "The
  Arts and weapons"). The Anima's own icon, the one the Art's screen shows, stands in a diamond 68 px across: unlit but
  for its outline, it fills with colour a row of cells at a time from the bottom as it charges, and full, the diamond
  glows in the Art's colour. Each Tenet's icon stands in a ring 44 px across, dimmed while it recharges, under a dark
  wedge that sweeps away clockwise from the top in 6-degree steps; with 9 seconds or fewer left, the seconds stand in
  it, rounded up, the icon stepping back so they read. Ready, its ring is lit in the element. Each key (R, Q, G) stands
  on a keycap under its icon. A spell just cast flashes its frame white for 0.5 s; while the player cannot cast
  (staggered, down, drinking or dead), every icon greys under a hatch. At the display's larger step (1500 by 900 and
  up) the
  diamond is 102 px and a ring 66, the keycaps at 22. The bar is worked out from the Art worn, the Anima's charge and
  each Tenet's recharge, as shares, and drawn afresh each frame by the game. With no Art worn it is not shown.

## In the rules

- **Worn and kept.** A character wears one Art, Storm from the start, and keeps for each Art a Core (three slots,
  each holding a fragment's place in its Art's list or nothing), a level from 1 to 5, XP toward the next and the
  fragments it owns. All are saved with the character; a save without them wears Storm at level 1 with every Core
  empty, one from before levels owns what its Cores held, and a broken one is made whole on reading ([[Gear]]).
- **Levels.** Kills fill the worn Art's bar, and its faction raises it a level for a price, a fragment of the
  player's choice owned at each rise; the faction also sells fragments ([[Factions]]). The level weighs every spell:
  its harm and healing, and how long it and everything it gives lasts (the Sunwell, the Duskraven and Dusk Daggers;
  Haste, the Crits and the veil; Arc Lash's Charge, the Expose that Dusk Daggers, Searing and the Duskraven's bolts
  give, the Sunwell's Linked linger, Overload's Expose with a Charge, and the seconds each fragment adds), at 0.6 of
  the numbers below at level 1 up to the numbers below at level 5. A spell keeps its Art's
  shares and Core from its cast: a spell still out after a swap keeps the Core of the Art that cast it, and Linked
  heals by the share of the Sunwell that gave it, even after its caster leaves. The cards show each number with the
  worn Core folded in, and a fragment's words name its seconds at the level worn. A Test Ground player starts every
  Art at level 5 owning every fragment.
- **A room without Arts.** A room told to forbid them (`Room::forbid_arts`), as the prologue's wreck's is (`Room::story_wreck`), takes no
  cast and charges nothing, a kill's share included; no fragment of a Core works; a blow in an Art's element is no
  more than another; and the player's gear says Art 0, its Anima and Tenets empty.
- **Asks.** The room answers `wearArt` and `setCore` as it does the gear's asks, in turn with the player's inputs.
  An unknown Art is refused (answer 110), a slot outside 0 to 2 (111), a fragment outside 0 to 5 (112), one set
  already in another slot of that Art (113), and one not owned (114). Only the worn Art's Core changes its spells.
- **Charge.** The room keeps each player's Anima and Tenets while they are in it, as shares from 0 to 1, and an
  account's for ten minutes after it leaves, as it left them: they are its again as it rejoins, or empty if it now
  wears another Art. It keeps as many as it holds players, the oldest let go first. The character keeps them too, so
  a return within ten minutes to another room finds them as left (`left.rs`, [[The Audit's Leftovers Are Fixed as Claude Suggested]]). A first join, or one
  past ten minutes, starts the Anima empty and the Tenets ready. Each share fills over its worn spell's recharge, a tick at a time. Each
  kill the player makes gives the Anima 2% more. Wearing another Art empties all three and lets go a cast on its way,
  so no recharge runs at another Art's pace.
- **Casting.** An input names a spell by its number: its Art's number less one, times three, plus its ability (0 the
  Anima, 1 and 2 the Tenets), plus one, so 1 Tempest to 9 Vanish. The room takes it only if it is the worn Art's,
  its share is full, no other cast is on its way, and the player is on foot and not staggered, Charged, drinking
  ([[Three Healing Charges, Refilled by Blows and Kills]]), dead or dead past a section's edge. It releases 18 ticks
  (0.3 s) after the tick that took it. If the player is staggered, Charged, drinking, dead or dead past the edge by
  then, it is lost and costs nothing; else its share empties and the spell is cast. Casting is attacking: any spell
  but Vanish ends the caster's veil as it is cast, though a spell already out, a raven's bolt or a ring, does not.
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

The numbers are an Art's at level 5.

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
- **The player's own gear** carries `art` (0 where none works), `cores` (three slots an Art in the Arts' order, 255 for none), `anima` and
  `tenets`, each share as the tick that sent it had it. It is sent whenever a cast releases, a kill gives charge or an
  ask changes them; between, the browser runs each share on by its recharge (`abilitiesAt`).
- **The asks** are numbered 40 (`wearArt`, the Art in `column`), 41 (`setCore`, the Art in `column`, the slot in
  `slot`, the fragment in `node`) and, in the Test Ground alone, 36 (the Anima full and the Tenets ready).

## In the browser

- **Keys.** `R` casts the Anima, `Q` the first Tenet and `G` the second. A press is sent only while the bar shows its
  ability ready, the pointer held and the player on foot, not staggered, down, drinking or dead; then no other is
  sent until the room's word shows that ability spent (its share under full) or another Art worn, 2 s at most (a cast
  the room lets fall sends no word). Any other word from the room in between leaves the keys waiting. Crouching stays
  on `C`, and the
  guard on the left button or `F`, as DFO has them. With the menu open the game takes no keys, so `F` still dismantles a
  piece there.
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
- **The Test Ground** has an Arts panel: the Art worn, each Art's level (a grant, 42, setting it with no XP and every
  fragment owned, the Test Ground alone), each Core slot, and a button that fills the Anima and readies
  the Tenets, so every spell can be tried at once ([[Test Ground]]). After each ask, the room's next word sets every
  list back to what it holds, so a refused choice does not stay shown.

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
- **Dawnflare.** A bird of fire 1.5 m over the ground, the forge's phoenix (below), its cells a figure's own pixels,
  turned to the eye in eight directions as it flies, its wings beating in four steps ten times a second, its outline flickering, embers trailing behind it; within 2 m of
  the eye, as it flies out past the camera, only its embers show. The ground burns where it passed: a lane 1.5 m wide, a
  core of light flaring white-hot between broken tongues of the element's body, flickering 12 times a second and cooling
  to its dark over 1.5 s. A foe it burns bursts in three tongues of flame with an impact star; at its flight's end the
  bird bursts in flame and embers.
- **Duskraven.** A raven of Cosmic light off its caster's right shoulder, the forge's raven (below), its cells a
  figure's own pixels, its wings beating six times a second; the player's own sits on their figure as the page predicts it, and is not drawn within a
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
- **The birds** are drawn by the [[Sprite Forge]] in Blender (`artbirds.py`), each beat as light alone, which the
  page turns into its element's four steps, so a bird shows in whatever element its caster's Art is. Each is drawn in
  the forge's five views and turned to the eye as a figure is (eight directions, three of them mirrored), Dawnflare's
  by the way it flies and Duskraven's by its caster's aim; at its flight's end Dawnflare keeps the way it flew.
  Dawnflare's is a phoenix in a frame 110 pixels square: a crest of flame, a white-hot body, wings swept back and a
  long tail of plumes curling up. Duskraven's is a raven in a frame 40 square: a heavy beak, a shaggy throat, fingered
  wings and a wedge of a tail, pale with its own light. Side on, each is as long as the spell's own bird. From ahead
  and behind its wings are edge on, and their twist through each stroke turns their face to the eye once a beat.
  Until all of a bird's frames have come, the spell draws its own, coarser and side on, in their place.
- **What it costs.** Each picture is made once for each of its steps (the sun's 32 turns, the blades' 16, the orb's 16
  crackles, the birds' four beats each in eight flickers) and each run of its cells worked out once, and the spells' own
  layers are written over the last frame's in place. With every spell up at once, a frame of them takes under a
  millisecond in Node and leaves about a quarter of a megabyte to collect.

## Limits

- An Art is looked at only once worn: its diamond's card names its spells.
- The scene is the same for every player of an Art; it is not the player's figure, as Destiny's is.
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
