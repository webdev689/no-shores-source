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
| How the Bay is given | As part of the stranger's task's reward (`"horse": true` beside her 400 Aurem), so the room pays both together, once | The reward is already paid once and late after a reload; a second path could pay one without the other |
| A character already past her task | Given nothing new | The gift is the welcome's; the Tack sells the Bay to anyone without one |
| One who keeps a Bay already | Her Aurem alone, no second Bay; worn only where no horse is worn | One horse of each coat, as the Tack holds to |
| The rider's boost key | Space and the pad's A, the jump's keys, in a "riding" place of its own beside the foot's, rebindable on the controls sheet under Move ("Boost a horse's pace") | A horse never jumps, so the jump's keys are free while riding; Shift is the gallop, and every other key and button on foot is taken |
| Where the boost lives in the rules | The movement crate: a tap in the controls, its two clocks on the body, the horse's pace times 1.5 while it runs, walking or galloping | The room and the page already step the body there to the bit |
| A boost while dismounted | The clocks run on; only a rider is boosted, and a tap on foot does nothing | The run stays as it is |
| Where the horse's ring stands | In the Arts' place at the bottom left while riding, one ring of the ship's bar's build with a horseshoe in iron, "Your Horse" to a reader | No Art is cast from the saddle; drawn as the ship's burst is |
| The ship's burst effect | Spray heaved off both bows and a foam ring astern as it begins; bow spray and a foam wake laid behind while it runs; a low fall of spray and a wide foam ring as it ends; every ship's | The fight's own spray and foam, in its budget |
| The horse's boost effect | Dust bursting round the hind hooves and clods thrown up as it begins; dust kicked up at each hoof strike (ten a second) and a clod one strike in three while it runs; a low cloud thrown ahead as it ends; paler dust and no clods on stone and wood, spray in water; one pool of 192 motes | Reads as hooves digging in; a fixed pool costs nothing new a frame |
| Whose horse shows the dust | The player's own | Another player's glance carries no boost |
| The horse's cues | `horse.<walk, gallop, boost>.<ground, stone, wood, water>`, `horse.mount`, `horse.whinny` (as the rider mounts), `horse.dismount`, `horse.snort` (each 9 s a ridden horse stands) and `horse.boost` | The footsteps' four grounds, a cue a stride; the whinny greets the rider, the snort fills a stand |
| Another rider's gait | From their pace: a gallop over 8 m/s, boosted over 14 m/s | Their boost is not sent to other pages |
