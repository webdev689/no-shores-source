---
type: decision
date: 2026-11-21
status: in force
---
# Three Healing Charges, Refilled by Blows and Kills

A player healed only from a few of the Arts' spells (Mend, the Sunwell's Linked, the Duskraven) or by dying and
standing again. Asked how health should come back reliably, with Destiny 1's automatic regeneration after a delay as
#1 and Souls-style healing charges as #2, the owner wrote:

> "I'd like to do #1 but I feel like it trivializes out combat system. #2 seems like the most obvious, maybe attacks or
> kills recharge it?"

Then the owner chose from Claude's options:

| Asked | The owner's pick | The option as offered |
|---|---|---|
| How the charges refill | "Damage dealt + kills" | Every hit the player lands fills a meter toward the next charge by its damage, and a kill adds a bigger chunk by the foe's rank (a third of a charge for a Minor or Major, two thirds for an Elite or Miniboss, a whole one for a Boss); respawning, and coming into a room (Overlook, the town, included), fills every charge |
| How many, and how much each heals | "3 charges, 40% each" | Three heals of 40% of the player's maximum health |
| How using one plays | "Drink, hit only interrupts" | About 1 s with the weapon lowered, moving at walking pace, the health coming at the end; a hit cancels the drink and gives the charge back |
| Its key | "3" | Beside the loadout keys 1 and 2 |
| Anything more: a Recovery stat on gear, perks that heal | "Nothing more for now" | |

## What it settles

- A player holds three healing charges; each heals 40% of their most health ([[Combat]], "Healing charges").
- Using one is a drink of about a second, the weapon lowered and the player moving at a walk; the health comes at its
  end. A hit cancels the drink and the charge is kept.
- Every hit the player lands fills a meter toward the next charge by its damage, and a kill adds more by the foe's
  rank: a third of a charge for a Minor or a Major, two thirds for an Elite or a Miniboss, a whole one for a Boss.
- Respawning, and coming into a room (Overlook and the town too), fills every charge ([[Server]]).
- The drink is on 3, beside the loadouts' 1 and 2 ([[Test Ground]]).
- No gear stat or perk heals or refills them, for now.

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| The drink's length | 60 ticks, 1 s | "About 1 s" |
| When the charge is spent | As the drink ends, with its health | A drink cut short then keeps its charge with nothing to give back |
| The walk | The movement rules' walk, 4.43 m/s: no running, jumping or crouching; Haste still quickens it | "Walking pace" |
| Where a drink begins | Only at rest, standing on the ground, on foot, with a charge held and health short of its most; never from a guard, a swing or a draw | As a ranged weapon's aim begins, from rest; a drink at full health would waste a charge |
| The press | Kept 8 ticks, as the attack's, the guard's and the dodge's are | A press made in a swing or a dodge's air is not lost |
| What cuts it short | Any blow that lands: a flinch, a stagger, a fall, a Charge's hold | "Hit only interrupts"; a drinker raises no guard, so no blow is blocked or parried |
| A dodge | Does not leave a drink; one pressed in its last 8 ticks hops as it ends | The owner's "hit only interrupts": nothing else does |
| The meter's rate | A blow fills it by the share of the foe's most health it took, times half the share the foe's rank's kill gives | A rate by raw damage could not serve both aims: a Boss holds about 27 to 41 times a Minor's health (1,120 at level 0, against 27 to 42) |
| What that gives | A Minor fought whole: a sixth from its blows and a third from its kill, half a charge. An Elite: a whole charge. A Boss: half a charge over its health and a whole one at its end; with its adds, Captain Thule's fight gives 1.5 charges before his fall and Corvane's 2.5 | The aims: about half a charge for a Minor, about two over a Boss fight |
| Level and difficulty | As a share of the foe's own health, the rate is the same at every level and difficulty | Blows and health scale with level, Attack and Defense alike |
| What counts | A swing, a shot or a spell, to the foe's health or its shield; never a companion's blow | "Every hit the player lands"; a shield is the foe's to break |
| Who takes the kill's share | The player whose blow killed | "A kill adds a bigger chunk" |
| Past three | The meter stands empty while all three are full | No charge past three, nothing banked |
| Saving | The charges are never saved; a player stands in every room with all three | "Coming into a room fills every charge" |
| The look | The weapon is put away while the drink lasts, in the figure and the first person's hands, and back as it ends | The forge has no drinking pose |
| The sound | The sound of standing again (Magic - Finger snap) as the health comes | No drinking recording, and no new one |
| The word | "+40" in green over the player, plain grey over another player | As the fight's words say the rest |
| The display | Three diamonds under the vitals' bars, above the buffs: a charge held whole in health's red, the next filling from its foot in a darker red; a screen reader reads "Healing charges", how many of three and how far the next has filled | In the vitals' stone and brass, by the health they give back |
| The key strip | "3 Heal", after "1 / 2 Loadout" | The key the owner chose |
| Casting while drinking | Not refused | Nothing in the owner's words touches the Arts |

Links: [[Combat]], [[Interface]], [[Server]], [[Test Ground]], [[Game]], [[Arts]],
[[Enemies Come in Five Ranks, After Destiny]].
