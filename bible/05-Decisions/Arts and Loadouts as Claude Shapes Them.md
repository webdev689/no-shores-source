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
| Switching | Melee is drawn by default; `1` draws Melee, `2` Ranged (or the mouse wheel); a swap takes 24 ticks (0.4 s), in which no blow or shot starts. The room accepts the arms of either worn loadout |
| Old saves | Read once into the new shape. The main hand's piece takes its slot by kind; a sword, dagger or mace with a shield in the off hand becomes its "& Shield"; two daggers, swords or maces become their pair; a lone dagger becomes Double Daggers, an axe a Great axe. An off-hand piece left over is carried, as its new kind; a shield left over is refunded as its dismantle materials. A Vestige for the off hand becomes one for Melee |
| Named pieces | One Legendary for each kind; the old ones keep their names under their new kind (The Reefwall becomes an Atheric Sword & Shield); new ones for the new kinds |
| Vendors | The Armsmith sells two Melee pieces and one Ranged a day |

## Verbs and statuses

A status is kept on a fighter by the room: its kind, the ticks left, who gave it. Foes show their debuffs as icons on
their plates; a player sees their own buffs in a row by their health.

| Status | What it does | Lasts |
|---|---|---|
| **Crit** (verb) | A crit hit deals 1.5 times. While a fighter has Crit, every blow and shot it lands is a crit | 5 s unless its giver says |
| **Expose** (verb, debuff) | The target takes 1.15 times damage from everyone (Destiny's Weaken, +15%); refreshed, never stacked | 6 s unless its giver says |
| **Charge** (verb, debuff) | Paralysed: no action, no step; an action under way is cut, as a stagger with its own cause | Minor 2 s, Major 1.5 s, Elite 1 s, Miniboss 0.6 s, Boss 0.4 s; then 3 s in which it cannot be Charged again |
| Haste (buff) | Moves 1.3 times as fast | 6 s |
| Linked (buff) | Heals 5 health a second and deals 1.2 times damage (Destiny's Empowering Rift, +20%) | While in the Sunwell, and 3 s after |
| Veiled (buff) | Invisible: foes lose sight of the player and cannot aim at them (a wind-up already under way lands); others see them faint. A blow or shot ends it. A blow landing on a foe's back (within 60° of behind) while Veiled always crits | 4 s |

## Arts

One Art is worn at a time; all three are open from the start, Storm first. Spells deal their Art's element (three
times on a matching shield, half on another) and strike with the power of the Melee loadout's Attack (the Ranged
one's when no Melee is worn), as weapons do. A cast takes 18 ticks (0.3 s) to release, plays the magic cast
animation in the Art's colour, and cannot start while staggered, Charged or down.

- **The Anima** fills over its base time, as a Destiny Super does, and 2% more with each kill; it is cast when full.
- **The Tenets** each recharge over their own cooldown, after Destiny's grenade and class abilities.
- **Keys**: Anima `F`, first Tenet `Q`, second Tenet `C`.
- Charge and cooldowns are kept by the room while the player is in it; a new room starts the Anima empty and the
  Tenets ready.

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
| Tenet: **Dawnflare** | A fire bird flies from behind the player 24 m along their facing in 1.6 s, burning each foe within 3 m of its path once for 14 | 121 s |

### Shadow (Cosmic): the mystic

| Spell | What it does | Recharge |
|---|---|---|
| Anima: **Duskraven** | A raven follows at the player's shoulder for 12 s, firing a bolt every 0.8 s at the nearest foe within 22 m (30 m/s): 7 damage and Expose; the player heals half the damage it deals | 455 s (Destiny's tier 4) |
| Tenet: **Dusk Daggers** | Held, it aims a ring on the ground up to 16 m away; let go, daggers whirl there for 5 s in a 4 m ring: every 0.5 s, 3 to each foe inside, and Expose | 121 s |
| Tenet: **Vanish** | A 3 m dodge roll the way the player moves (back when still), then Veiled | 38 s (Destiny's Gambler's Dodge) |

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
ring; Vanish a puff of dusk, the player drawn faint and shimmering. An Exposed foe has a faint purple edge; a Charged
one crackles.

### Where they are seen

- **The Character page**: the Art's diamond above the weapons; pressed, it opens the Art's screen.
- **The Art's screen**, after the owner's reference: the three Arts' diamonds to choose from; the worn Art's large
  diamond, name and element; ANIMA, TENETS and CORE in rows; each spell and fragment a card with its numbers.
- **The HUD**: the Anima's diamond filling and the two Tenets' icons sweeping as they recharge, each with its key; the
  player's buffs in a row by their health; a foe's debuffs as icons on its plate, each with the time it has left.

## Perks

Shields' block perks (Bulwark, Coral Guard) fit loadouts with a shield. New perks bring the verbs to weapons:

| Perk | Fits | What it does |
|---|---|---|
| Exposing Strikes | Melee | A third blow in a row on one foe Exposes it |
| Thunderclap | Melee | A blow that breaks a guard Charges the foe |
| Opportunist | Melee | Blows on an Exposed foe crit |
| Marked Shot | Ranged | The first shot after a reload Exposes |
| Shocking Rounds | Ranged | Every fifth shot that lands Charges |
| Keen Eye | Weapon | A kill gives Crit for 4 s |
| Attuned | Weapon | While the worn Art's element is the weapon's, it deals 10% more |
| Spellfeed | Weapon | Each kill takes 3% off the Tenets' cooldowns |

## Not now

A Relic slot (the owner dropped it); Arts beyond the three; unlocking fragments by play; a separate greatsword
picture; spells against other players.
