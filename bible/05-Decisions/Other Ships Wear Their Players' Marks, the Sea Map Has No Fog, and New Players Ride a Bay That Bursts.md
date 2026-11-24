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
| How the room sends the marks | Each sea snapshot carries the plate of each other player's ship it sends, whole | The sea sends its ships whole every snapshot; no base to send changes against |
| The held map's charted sea | Deleted with the fog: the wash, the waters' names and the faint sea ink lie over all the sea | Only the fog needed it |
| The browser's kept discovery | No longer read or written; one already kept is left where it is | Nothing else read it; it does no harm left |
