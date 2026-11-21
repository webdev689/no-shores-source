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

Asked whether a player can cast an Art while drinking, the owner chose "No casting while drinking"; whether foes
should treat a drink as an opening, "No, foes ignore it"; and who gets a kill's share in a company, "Everyone who
struck it". Asked about the display, the owner chose "Stay shown while one's missing" and "Flash on gain or drink".

## What it settles

- A player holds three healing charges; each heals 40% of their most health ([[Combat]], "Healing charges").
- Using one is a drink of about a second, the weapon lowered and the player moving at a walk; the health comes at its
  end. A hit cancels the drink and the charge is kept.
- Every hit the player lands fills a meter toward the next charge by its damage, and a kill adds more by the foe's
  rank: a third of a charge for a Minor or a Major, two thirds for an Elite or a Miniboss, a whole one for a Boss.
- Respawning, and coming into a room (Overlook and the town too), fills every charge ([[Server]]).
- The drink is on 3, beside the loadouts' 1 and 2 ([[Test Ground]]).
- Nothing more for now: no Recovery stat on gear, and no perks that heal.
- No Art is cast while drinking ([[Arts]]).
- Foes ignore a drink: it is no opening to them.
- A kill's share goes to everyone who struck the foe.
- The vitals stay shown while a charge is missing, and a diamond flashes when a charge is gained and when one is
  drunk ([[Interface]]).

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| The drink's length | 60 ticks, 1 s | "About 1 s" |
| When the charge is spent | As the drink ends, with its health | A drink cut short then keeps its charge with nothing to give back |
| The walk | The movement rules' walk, 4.43 m/s: no running, jumping or crouching; Haste still quickens it | "Walking pace" |
| Where a drink begins | Only at rest, standing on the ground, on foot, out of a loadout swap, with a charge held and health short of its most; never from a guard, a swing or a draw | As a ranged weapon's aim begins, from rest and never in a swap; a drink at full health would waste a charge |
| The press | Kept 8 ticks, as the attack's, the guard's and the dodge's are | A press in a swing's or a dodge's last 8 ticks is not lost |
| What cuts it short | Any blow that lands: a flinch, a stagger, a fall, a Charge's hold | "Hit only interrupts"; a drinker raises no guard, so no blow is blocked or parried |
| A dodge | Does not leave a drink; one pressed in its last 8 ticks hops as it ends; a drink pressed in a dodge's last 8 ticks begins as it ends, and never frees it early | The owner's "hit only interrupts": nothing else does |
| Off the ground, in the saddle, full or with no charge at the end | The drink is put down, its charge kept, nothing healed | A climb, a fall or a horse is no place to drink, a charge is never spent for nothing, and no heal comes without one |
| The meter's rate | A blow fills it by the share it took of the foe's most health and most shield together, times half the share the foe's rank's kill gives | A rate by raw damage could not serve both aims: a Boss holds about 27 to 41 times a Minor's health (1,120 at level 0, against 27 to 42); with its shield counted, a shielded foe fought whole gives what an unshielded one does |
| The aims | About half a charge for a Minor, about two over a Boss fight | Claude's, for the owner's "damage dealt + kills" |
| What that gives | A Minor fought whole: a sixth from its blows and a third from its kill, half a charge. An Elite: a whole charge. A Boss: half a charge over its health and a whole one at its end. Played alone, Corvane's world-boss node with its four Major escorts gives 4.5 charges before he falls and 5.5 in all; the prologue's Captain Thule never falls, and his fight gives at most a third of a charge | The rate, measured against the roster |
| Level and difficulty | As a share of the foe's own health, the rate is the same at every level and difficulty; a foe above the player's level costs them more health for each charge it gives | A blow is weighed against the foe's own most health, so its level and the difficulty cancel out |
| What counts | A swing, a shot or a spell, to the foe's health or its shield; never a companion's blow | "Every hit the player lands"; a shield is the foe's to break |
| A foe walking home | A blow on a foe walking back to its post, its fight given up, fills nothing | Shot from past its leash or off its ground, it heals as it walks and never fights back: the meter would fill without a fight |
| Who struck it | Every player whose own blow landed on the foe in its last 10 s, once each; a companion's blow counts no one | The window a kill's XP and drops are shared by; never a companion's blow, as for the meter |
| Past three | The meter stands empty while all three are full; while a drink is under way the charge it drinks counts as spent, so the meter fills to one whole and becomes a charge as the drink spends one | No charge past three, nothing banked; a charge earned in a drink's last moments is not thrown away |
| Saving | The charges are never saved; a player stands in every room with all three | "Coming into a room fills every charge" |
| The look | The weapon is put away while the drink lasts, in the figure and the first person's hands, and back as it ends; another player's figure puts it away as soon as their snapshot shows the drink | The forge has no drinking pose; a dress change crosses at most once a second |
| The sound | The sound of standing again (Magic - Finger snap) as the health comes | No drinking recording, and no new one |
| The word | "+40" in green over the player, plain grey over another player | As the fight's words say the rest |
| The display | Three diamonds under the vitals' bars, above the buffs, drawn cell by cell as the bars' frames are: an outline, a stone line lit above and shaded below, and inside the bars' see-through track. A charge held is whole in health's red; the next fills from its foot by whole pixel rows in a pale health red. A screen reader reads "Healing charges", how many of three and how far the next has filled | In the vitals' stone, by the health they give back; the bars' loss strip is a darker red, but a darker meter measured under 1.7:1 against its well |
| The flash | A diamond brightens in two steps over 0.4 s, near white and then pale red, as a charge is gained or drunk; none under reduced motion | The owner's "Flash on gain or drink", in steps as the vitals' other changes are |
| The key strip | "3 Heal", after "1 / 2 Loadout"; its pairs 8 px apart, so at 1280 by 720 it keeps to two lines with an Art worn | The key the owner chose |

Links: [[Combat]], [[Interface]], [[Server]], [[Test Ground]], [[Game]], [[Arts]],
[[Enemies Come in Five Ranks, After Destiny]].
