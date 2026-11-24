---
type: decision
date: 2026-11-24
status: in force
---
# Other Ships Wear Their Players' Marks, the Sea Map Has No Fog, and New Players Ride a Bay That Bursts

After a playtest, the owner:

> "3. Other players at sea should get their player icon they recieve on land above their ship.
>
> 4. Remove the fog of war on the sea map
>
> 5. New players in the tutorial should recieve a free horse. Horses should get a boost like ships. Ship and horse
> boost should get a detailed boost effect. Horses also need a detailed audio pass with freesound"

Asked which free horse a new player gets, and when, the owner chose "The Bay, from the stranger", the option that
read: "The Bay, the Tack's own horse, worn in the Mount slot and given by the stranger along with her 400 Aurem gift as
the welcome tour begins."

Asked how a horse's boost should work, told a ship's taps Shift for 1.5x speed for 4 s, then 12 s to recharge, with a
ring in the ship's bar, the owner chose "Same as the ship", the option that read: "Tap the boost key while riding for
1.5x the horse's speed for 4 s, then 12 s to recharge, its ring in the bar at the bottom left. Run stays as it is."

## What it settles

- At sea, each other player's ship wears above it the mark that player wears on land ([[Naval Combat]], [[Interface]]).
- The held map at sea has no fog of war: all of it shows from the first time it is raised ([[Held Map]]). This
  replaces the sea's fog in [[The Sea Is Navigated From the Helm With the Held Map]].
- A new character is given the Bay, worn in the Mount slot, by the stranger with her 400 Aurem as the welcome tour
  begins ([[Gear]], [[Quests]]).
- A rider taps the boost key for half again the horse's speed for 4 s, then 12 s to recharge, its ring in the bar at
  the bottom left; run stays as it is ([[Player]]).
- A ship's boost and a horse's each have a detailed effect.
- Horses get a detailed pass of sounds from Freesound, judged on the sound sheet as every sound is
  ([[Sounds Come From Freesound, Judged on a Test Sheet]]).

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| How high the mark stands over a ship | As far over its masthead as drawn as a captain's plate stands in a fight (`plateOverM`) | Clear of the rig, and level with the plates the sea already shows |
| How far off a ship wears its mark | 8 km across the water, only before the eye | About where a ship drawn 75 m long shrinks to a few pixels; past it a mark names a speck |
| Whether a mark is hidden behind something | No line is tried at sea, so a ship behind an island still wears its mark | Only an island stands between ships at sea, and the land's line test is against a node's blocks and ground |
| The mark's menu dots at sea | Never shown | The sea hears nothing of a player's menu |
| The mark in a sea fight | None; the captains' plates stand alone | A fight's plates and card already fill the view over its ships |
| The mark at the helm | None | The held map raised there covers the view, as the compass goes there |
| How the room sends the marks | Each sea snapshot carries the plate of each other player's ship it sends, whole | The sea sends its ships whole every snapshot; no base to send changes against |
| The held map's charted sea | Deleted with the fog: the wash, the waters' names and the faint sea ink lie over all the sea | Only the fog needed it |
| The browser's kept discovery | No longer read or written; one already kept is left where it is | Nothing else read it; it does no harm left |
| How the Bay is given | As part of the stranger's task's reward (`"horse": true` beside her 400 Aurem), so the room pays both together, once | The reward is already paid once and late after a reload; a second path could pay one without the other |
| A character already past her task | Given nothing new | The gift is the welcome's; the Tack sells the Bay to anyone without one |
| One who keeps a Bay already | Her Aurem alone, no second Bay; worn only where no horse is worn | One horse of each coat, as the Tack holds to |
| The rider's boost key | The jump's key (Space, the pad's A): a rider's jump is the horse's boost, and rebinding the jump moves both (the controls sheet's "Jump; vault; boost a horse") | A horse never jumps; Shift is the gallop, and every other key and button on foot is taken, and heard while riding. A boost of its own bind would clash with each of them, and the jump and the crouch could no longer swap keys |
| Where the boost lives in the rules | The movement crate: a tap in the controls, its two clocks on the body, the horse's pace times 1.5 while it runs, walking or galloping | The room and the page already step the body there to the bit |
| A boost while dismounted | The clocks run on; only a rider is boosted, and a tap on foot does nothing | The run stays as it is |
| Where the horse's ring stands | In the Arts' place at the bottom left while riding, one ring of the ship's bar's build with a horseshoe in iron, "Your Horse" to a reader | No Art is cast from the saddle; drawn as the ship's burst is |
| The ship's burst effect | Spray heaved off both bows and a foam ring astern as it begins; bow spray and a foam wake laid behind while it runs; a low fall of spray and a wide foam ring as it ends; every ship's | The fight's own spray and foam, in its budget |
| The horse's boost effect | Dust bursting round the hind hooves and clods thrown up as it begins; dust kicked up at each hoof strike (ten a second) and a clod one strike in three while it runs; a low cloud thrown ahead as it ends; paler dust and no clods on stone and wood, spray in water; one pool of 192 motes | Reads as hooves digging in; a fixed pool costs nothing new a frame |
| Whose horse shows the dust | The player's own | Another player's glance carries no boost |
| The horse's cues | `horse.<walk, gallop, boost>.<ground, stone, wood, water>`, `horse.mount`, `horse.whinny` (as the rider mounts), `horse.dismount`, `horse.snort` (each 9 s a ridden horse stands) and `horse.boost` | The footsteps' four grounds, a cue a stride; the whinny greets the rider, the snort fills a stand |
| Another rider's gait | From their pace: a gallop over 8 m/s, boosted over 14 m/s | Their boost is not sent to other pages |
