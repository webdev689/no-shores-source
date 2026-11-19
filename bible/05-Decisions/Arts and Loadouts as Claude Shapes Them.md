---
type: decision
date: 2026-11-18
status: in force
---
# Arts and Loadouts as Claude Shapes Them

The owner handed this round over in full: "Build it all to 100%. Take full autonomy and ensure this is 100%
developed." What the owner decided is in [[Arts Are Overlook's Subclasses]], [[Weapons Are a Melee and a Ranged
Loadout]] and [[Your Weapon Glows in Its Element]]. Everything below is Claude's, made under that word, and the owner
may change any of it. Numbers reference Destiny 2's where the owner asked for that (cooldowns), and the game's own
scale elsewhere: a player has 100 health, a sword's blow does 14 before power, a tick is 1/60 s.

## Loadouts

| Call | Choice |
|---|---|
| Kinds | Melee: `sword_and_shield`, `dagger_and_shield`, `double_daggers`, `sword`, `double_swords`, `staff`, `mace`, `double_mace`, `mace_and_shield`, `great_axe`, `greatsword`, `flail`, `warhammer`. Ranged: `bow`, `crossbow`, `pistolet`, `double_pistolet`, `thunderlock`. Armour and the cloak are unchanged |
| Slots | `melee`, `ranged`, then head, torso, arms, legs, cloak. A loadout is one item: one Attack, one element, one set of perks |
| How each fights | The pairs fight as the old pairs did (two daggers, swords or maces alternate hands); "& Shield" holds the weapon with a shield, which blocks as a shield did (80°, blocks shots); a single sword or mace leaves the left hand free; the great axe fights as the axe |
| Greatsword | Its own class: reach 2.3 m, 24 damage, weight 1.3 x 1.15, stamina 21, handling 1.06, two-handed; drawn with the sword's pictures in the two-handed hilt blows, in first person with the sword's |
| Double pistolet | Two shots, one from each hand, before one reload 1.5 times a pistolet's; each shot 0.85 of a pistolet's damage |
| Defense | Comes from armour alone; the share a shield had is spread over the four armour pieces |
| Switching | Melee is drawn by default; `1` draws Melee, `2` Ranged (the mouse wheel stays the camera's, as [[The Player Plays as in DFO]] has it); a swap takes 24 ticks (0.4 s), in which no blow or shot starts, and begins once the fighter is at rest: never in a swing, a guard, a draw or a reload, so a swap never skips one. The room accepts the arms of either worn loadout |
| Old saves | Read once into the new shape. The main hand's piece takes its slot by kind; a sword, dagger or mace with a shield in the off hand becomes its "& Shield"; two daggers, swords or maces become their pair; a lone dagger becomes Double Daggers, an axe a Great axe. An off-hand piece left over is carried, as its new kind; a shield left over is refunded as its dismantle materials. A named weapon takes its named kind, whatever stood beside it. A Vestige for either hand becomes one for Melee |
| Named pieces | One Legendary for each kind; the old ones keep their names under their new kind (The Reefwall becomes an Atheric Sword & Shield); new ones for the new kinds |
| Vendors | The Armsmith sells four Melee pieces and two Ranged a day |

## Verbs and statuses

A status is kept on a fighter by the room: its kind, the ticks left, who gave it. Foes show their debuffs as icons on
their plates; a player sees their own buffs in a row by their health.

| Status | What it does | Lasts |
|---|---|---|
| **Crit** (verb) | A crit hit deals 1.5 times. While a fighter has Crit, every blow and shot it lands is a crit | 5 s unless its giver says |
| **Expose** (verb, debuff) | The target takes 1.15 times damage from everyone (Destiny's Weaken, +15%); refreshed, never stacked | 6 s unless its giver says |
| **Charge** (verb, debuff) | Paralysed: no action, no step; an action under way is cut, as a stagger with its own cause, so a Charged foe takes damage as a staggered one does (1.25 times). A stagger of another cause, a fall, an overreach or a reload is not cut: the Charge waits, held still, for it to end, then holds for its whole time. A foe walking home to its post sheds it | Minor 2 s, Major 1.5 s, Elite 1 s, Miniboss 0.6 s, Boss 0.4 s; then 3 s in which it cannot be Charged again |
| Haste (buff) | Moves 1.3 times as fast | 6 s |
| Linked (buff) | Heals 5 health a second and deals 1.2 times damage (Destiny's Empowering Rift, +20%) | While in the Sunwell, and 3 s after |
| Veiled (buff) | Invisible: foes lose sight of the player and cannot aim at them (a wind-up already under way lands); others see them faint. A blow or shot ends it, and so does casting any spell but Vanish. A blow landing on a foe's back (within 60° of behind) while Veiled always crits | 4 s |

## Arts

One Art is worn at a time; all three are open from the start, Storm first. Spells deal their Art's element (three
times on a matching shield, half on another) and strike with the power of the Melee loadout's Attack (the Ranged
one's when no Melee is worn), as weapons do. A cast takes 18 ticks (0.3 s) to release, plays the magic cast
animation in the Art's colour, and cannot start while staggered, Charged, down or mounted. A spell never turns its
caster's soft lock.

- **The Anima** fills over its base time, as a Destiny Super does, and 2% more with each kill; it is cast when full.
- **The Tenets** each recharge over their own cooldown, after Destiny's grenade and class abilities.
- **Changing Art** empties the new Art's Anima and both Tenets, as changing subclass does in Destiny, so no recharge
  runs at another Art's pace; a cast on its way is let go.
- **A dodge** passes a spell whole: neither its harm nor the status it gives.
- **Keys**: Anima `R`, first Tenet `Q`, second Tenet `G`: keys DFO's scheme leaves free, since the owner keeps its
  controls ([[The Player Plays as in DFO]]); `Q` was the cosmetic cast.
- Charge and cooldowns are kept by the room while the player is in it, and for ten minutes after they leave, given
  back as they rejoin; a first join starts the Anima empty and the Tenets ready.

### Storm (Volt): agile, and deals damage

| Spell | What it does | Recharge |
|---|---|---|
| Anima: **Tempest** | Over 1 s, six orbs leave the player and seek the nearest foes within 30 m, turning to a new one when theirs falls; 14 m/s, turning 4 radians a second, 4 s at most; each deals 18 | 500 s (Destiny's tier 3 Super) |
| Tenet: **Quicken** | Haste on the player and every player within 12 m | 91 s (Destiny's quickest grenade) |
| Tenet: **Arc Lash** | Lightning through a 70° cone 7 m ahead: 16 to each foe in it, and Charge | 105 s (Destiny's Arcbolt grenade) |

### Divine (Blaze): the support

| Spell | What it does | Recharge |
|---|---|---|
| Anima: **Sunwell** | An orb of sun hangs where it is cast for 12 s; every player within 10 m is Linked to it | 417 s (Destiny's tier 5, Well of Radiance) |
| Tenet: **Mend** | Heals the player 40 at once (Destiny's Cure) | 91 s (Destiny's healing grenade) |
| Tenet: **Dawnflare** | A fire bird flies from 3 m behind the player, 24 m along their facing in 1.6 s, burning each foe within 3 m of its path once for 14 | 121 s |

### Shadow (Cosmic): the mystic

| Spell | What it does | Recharge |
|---|---|---|
| Anima: **Duskraven** | A raven follows at the player's shoulder for 12 s, firing a bolt every 0.8 s at the nearest foe within 22 m (30 m/s): 7 damage and Expose; the player heals half the damage it deals | 455 s (Destiny's tier 4) |
| Tenet: **Dusk Daggers** | Held, it aims a ring on the ground up to 16 m away; let go, daggers whirl there for 5 s in a 4 m ring: every 0.5 s, 3 to each foe inside, and Expose | 121 s |
| Tenet: **Vanish** | A 3 m dodge roll the way the player moves (back when still), then Veiled; where a dodge could not start (in a dodge, early in a flinch, a reload or an overreach), the veil without the roll | 38 s (Destiny's Gambler's Dodge) |

### The Core

Each Art has three Core slots and six fragments; any three may be set, none twice. All are open from the start, and
each Art keeps its own Core.

| Art | Fragments |
|---|---|
| Storm | **Pursuit**: Tempest sends two more orbs. **Conduction**: Arc Lash's Charge lasts half as long again. **Momentum**: Quicken also gives the player Crit while it lasts. **Recharge**: each Volt kill takes 4% off the Tenets' cooldowns. **Overload**: foes Charged by the player are Exposed too. **Gale**: Quicken lasts 3 s longer and reaches 18 m |
| Divine | **Radiance**: the Sunwell reaches 3 m further and lasts 4 s longer. **Mercy**: Mend also heals players within 8 m half as much. **Wings**: the Dawnflare makes a second pass back. **Zeal**: while Linked, each Blaze kill takes 5% off the Tenets' cooldowns. **Searing**: the Dawnflare Exposes what it burns. **Resolve**: Mend gives the player Crit |
| Shadow | **Hunger**: the Duskraven heals the player all it deals, not half. **Night**: Vanish's veil lasts 2 s longer. **Blades**: Dusk Daggers reach 1.5 m further and last 2 s longer. **Hunt**: a crit out of Vanish gives back half its cooldown. **Dread**: each Cosmic kill on an Exposed foe keeps the Duskraven 2 s longer. **Cruelty**: the player's crits on Exposed foes deal 10% more |

### How they look

Each spell is drawn from the elements' colours ([[Your Weapon Glows in Its Element]]): Tempest's orbs crackling Volt
blue with trails; Quicken a ring of lightning at the feet and streaks behind those it quickens; Arc Lash bolts fanning
through the cone, Charged foes crackling; the Sunwell a floating sun over a turning ring, beams to those Linked, motes
rising as they heal; Mend a burst of gold; the Dawnflare a bird of fire, wings beating, embers behind it; the
Duskraven a raven of purple light at the shoulder, its bolts trailing stars; Dusk Daggers blades turning over a purple
ring; Vanish a puff of dusk, the player drawn as an outline with a shimmer crossing it. An Exposed figure is edged in
Cosmic two pixels thick, a Charged one crackles inside its own outline.

### Where they are seen

- **The Character page**: the Art's diamond above the weapons; pressed, it opens the Art's screen.
- **The Art's screen**, after the owner's reference: the three Arts' diamonds to choose from; the worn Art's large
  diamond, name and element; ANIMA, TENETS and CORE in rows; each spell and fragment a card with its numbers.
- **The HUD**: the Anima's diamond filling and the two Tenets' icons sweeping as they recharge, each with its key; the
  player's buffs in a row by their health; a foe's debuffs as icons on its plate, each with the time it has left.

### How attacks look

The owner asked that attack visuals go beyond the limits ([[Attack Visuals Go Beyond the Limits]]). What that comes to
is written here as it is built.

Everything is the game's own pixel art: whole figure pixels, the four stops of a ramp (an element's, a metal's made
from its light, gold `#4a2a06 #c8901e #ffd95a #fff6d0`), held steps, no soft fades.

- **The swing's arc** (the [[Test Ground]]'s attack feel until it moves into the game): drawn over its own striker,
  so overheads, slants and thrusts show from the default camera; its cutting edge white-hot over a dark rim, its
  sweep in lanes, its oldest fifth dithered out; in the blade's element where the hand glows, gold for a riposte.
  Blaze sheds 18 embers a second off its head, Volt jolts it and throws two 0.3 m forks each strike, Cosmic leaves a
  star every 0.08 s. Weight by class: a dagger 0.7 times a sword's width and trail, a mace 1.2, a flail 1.4, an axe,
  a warhammer and a greatsword 1.6 wide and 1.4 long; their overheads (and a flail's) crack the ground with three
  0.6 m rays and throw 12 chips of dust. The striker's figure smears 4 pixels back for the strike's first two frames.
- **A struck figure**: a foe flashes whole white for 2 frames, its outline white for 2, its outline in the blow's
  element (steel for a plain one) for 1, then nothing; the player's outline red for 4, whole only for a blow over a
  quarter of their health. A foe slides along the blow in whole pixels: 0.12 m a hit, 0.35 m a stagger (out over 6
  frames, back over 10), 0.6 m a kill. A stagger shakes it a pixel for 6 frames, reels its hurt frames every 0.4 s
  and circles three gold stars round its head. A foe slain dissolves: plain, crumbling from the head down over 0.6 s
  once its fall is over; in an element at once (Blaze 44 frames, Volt 18, Cosmic 10).
- **Statuses**: Exposed a two-pixel Cosmic edge stepping at 4 Hz and a cracked diamond by the head; Charged three
  arcs inside the figure at 12 Hz, its edge lit on alternate strikes, shaken a pixel; Veiled its outline in Cosmic's
  light, an eighth of its inside, a shimmer crossing it every 0.8 s.
- **The weapon's glow**: reaches 9 pixels (Blaze 6 up at rest, Volt 7, Cosmic's stars 8) and surges 1.5 times
  through a swing, twice for 6 frames after a landed blow, 2.5 times for 10 after a kill.
- **First person**: a landed blow lights the weapon with a white rim for 1 frame, bursts its element off it and
  jolts the hands 2 design pixels for 3 frames; a block jolts them 4. No trail.
- **Where a blow lands**, in the Test Ground and the game alike, at the struck chest's front, drawn 0.45 m nearer the
  eye than it, or past the striker's card when the striker stands nearer the eye (its cells shrunk to keep its size), so
  neither figure hides it; through the striker's own eyes at 0.45 of its size, and none on the eyes' own body. A
  four-ray star 0.55 m across, white-hot at its heart and rimmed a cell round in the ramp's dark, for 1 frame; a ring
  0.8 m in the ramp's light for 1; a broken ring 1 m for 1; and a slash 1.2 m long and 2 figure pixels thick across the
  figure along the stroke, white-hot then light (none for a thrust). In the blow's element, else bare steel `#2a3340
  #8fa6c8 #cfe0ff #ffffff`, gold for a riposte or a counter; 0.8 times as large for a blow under a tenth of its foe's
  health, 1.3 over three tenths. A plain blow throws 6 steel sparks, an elemental one its motes (Blaze 18, Volt 15,
  Cosmic 21) and its own shape for 6 to 8 frames: three tongues of flame climbing and cooling, four forks 0.5 m struck
  afresh every 2 frames, a six-pointed star turning in sixteenths. Every bit is 2 figure pixels, cooling a stop each
  third of its life down to its body.
- **A crit** (the room says which blows are): a gold four-ray star 1 m over the blow for 3 frames, 6 gold sparks, the
  struck figure's outline gold for 4 frames after its two white ones, its number stamped Crit, and a 0.11 s hold.
- **A kill**: the blow's star 1.2 m with each step held 2 frames and its rings 1.5 times as large; a ring of dust on the
  ground swelling 0.4, 0.8, 1.2, 1.6 m, 3 frames each; 12 dark chips thrown 2 to 4 m/s that come to rest; the 0.6 m
  slide; a 0.16 s hold; its number stamped Slain. The chips are a dark leather ramp, not the body's own colours.
- **Finishers**, when the killing blow carried an element (visuals only): the body dissolves in it at once. Blaze sheds
  an ember every 2 frames as its heat climbs for 24 frames, then bursts in a 1.6 m ring (white-hot 3 frames, light 3,
  body 4) that throws 20 embers, and leaves a 1.4 m ash scorch smouldering 2 embers a second for 10 s. Volt leaps in a
  bolt to the nearest foe within 6 m and on to one more, 8 frames each, restruck 12 times a second, with a fork and 10
  sparks where each lands. Cosmic draws a dark ring in from 0.75 m over its 10 frames, then pops in 16 glints and a 1.2
  m ring and leaves a swirl turning for 3 s. Marks on the ground are drawn in 4-pixel cells, 4 at most at once, and
  shrink away in four steps; the ash is charred `#16110e` with its edge in Blaze's body.
- **Steel on steel**: a parry's gold cross 0.8 m for 2 frames, then its ring for 2, a gold shockwave on the ground at
  0.3, 0.85 and 1.4 m for 3 frames each, and 14 gold sparks; a block's steel star 0.5 m and 8 sparks; a guard broken's
  steel star 1 m, 10 sparks and a cracked shield beside the head for half a second, thinning out over its last 8 frames.
- **Words**: the face at 22 px, a crit's and a kill's 33 in gold, no box, a hard 2 px outline; popped 1.4 times for 2
  frames and 1.15 for 2, rising 4 px every 4 frames, blinking out over the last 6; standing at the blow, its near edge
  thrown 28 px the way the stroke went (a crit's or a kill's 56), 24 px clear of every plate and clear of each other; a
  foe's blows within 0.6 s add up.

## Perks

Shields' block perks (Bulwark, Coral Guard) fit loadouts with a shield, and only those; a node of one found bought on
another piece is given back for what it cost. New perks bring the verbs to
weapons, each in the column that keeps the pools growing alike (handling 3 to 4, finish 3 to 5, perks 5 to 8 for
Melee and 4 to 6 for Ranged):

| Perk | Fits | Column | What it does |
|---|---|---|---|
| Exposing Strikes | Melee | Perk | A third swing in a row landed on one foe Exposes it, and the count starts again. A swing landing on others and not on it, or one it parries or dodges, ends the row; a sweep that strikes it beside others keeps it |
| Thunderclap | Melee | Handling | A blow that breaks a guard Charges the foe |
| Exploit | Melee | Perk | Blows on an Exposed foe crit |
| Marked Shot | Ranged | Handling | The player's first shot to land on a foe Exposes it: each player marks a foe once, forgotten when it dies or leaves |
| Shocking Rounds | Ranged | Perk | Every fifth shot that lands Charges; a shot that does not land is not counted |
| Keen Eye | Weapon | Perk | A kill with the weapon gives Crit for 4 s |
| Attuned | Weapon | Finish | While the worn Art's element is the weapon's, it deals 10% more |
| Spellfeed | Weapon | Finish | Each kill with the weapon takes 3% off the Tenets' cooldowns |

A loadout's perks, these and the rest, work while it is drawn, beside the armour's; none touches a spell or its kill.

## Loot drops

| Call | Choice |
|---|---|
| What drops in sight | Vestiges and Ammo boxes, thrown out of the fallen foe for each player who earned them, seen by that player alone; XP and Aurem are paid at once, as Destiny's are |
| How they look | DFO's: the piece's own picture standing on the ground, a thin line of its rarity's colour rising from it (Normal 0.7 m, Magic 1 m, Rare 1.4 m, Legendary 1.9 m, Atheric 2.5 m), a glint climbing it, Legendary and Atheric pulsing; thrown out in a fan, bouncing to rest in about 0.6 s; a Rare or rarer chimes at rest. An Ammo box is a small crate picture with a white line |
| Taking them | Walking within 1.5 m, as Vestiges are taken now; a Vestige past the ten carried stays on the ground |
| How long | Two minutes, then gone |

## Ammo

| Call | Choice |
|---|---|
| Capacity | Shots carried for the worn Ranged weapon: bow 60, crossbow 30, pistolet 24, double pistolet 36, thunderlock 16. Kept on the character as a share of the full capacity, so a different Ranged weapon worn keeps the same share |
| Firing | A shot spends one; at none, the weapon will not fire and the crosshair says "No ammo". Reloads take as long as now. Foes' weapons never run dry |
| Ammo box | Dropped on a kill for each player who earned it: Minor 20%, Major 35%, Elite 60%, Miniboss and Boss always. Taken, it gives back a quarter of the capacity, at least one shot |
| Ammo crate | A consumable: held in the Consumables shelf, it fills the worn Ranged weapon's ammo at once, and is refused and kept with none worn. Five carried at most; the Quartermaster sells them for 250 Aurem; a Miniboss or Boss drops one for each player |
| Shown | The shots left beside the crosshair while the Ranged weapon is drawn, and under the Ranged slot on the Character page |

## Not now

A Relic slot (the owner dropped it); Arts beyond the three; unlocking fragments by play; a separate greatsword
picture; spells against other players.
