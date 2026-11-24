---
type: decision
date: 2026-11-24
status: in force
---
# The Harbourmaster Stands in the Market, Rain Spares the Trees, and Patrol Nodes Always Stand

After a playtest, the owner:

> "1. Remove the ability to walk all the way down to the harbor master. The harbor master should instead be placed in
> the town itself.
>
> 2. Trees have a weird white tint to them when its raining
> Puddles need to be more sparse and detailed. Plus trees sway way too fast.
>
> 7. Materiel nodes in patrol zones should always be available unless already gathered by yourself. Currently some
> spawn and some dont by design."

Asked where the Harbourmaster should stand, the harbour way closed off at its top, the owner chose "Beacon Walk
market", the option that read: "A stall of its own in the market beside the other keepers' stalls. The harbour way gets
a sealed gate at its head, like the hub's other sealed gates."

## What it settles

- Overlook's harbour way is no longer walked down to the quay: a sealed gate closes it at its head, as the hub's other
  sealed gates are ([[Cities]]).
- The Harbourmaster stands in a stall of its own in the Beacon Walk's market beside the other keepers' stalls.
- Trees lose the white tint they wear in the rain; puddles are fewer and more detailed; trees sway slower
  ([[Weather]], [[Nature]]).
- In a patrol zone every material node stands, for everyone, except one the player has gathered themselves; no node
  waits its turn ([[Gear]]). This replaces the turns of a third at a time in
  [[Material Nodes Stand Where They Are Dressed, Worked by Holding E]].

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| When a gathered patrol node returns for its gatherer | Nine minutes of wall-clock time after they gathered it (`patrol::RETURN_MINUTES`, on the room's minute), for them alone, across a rejoin and while the room stands empty | The rate a player had before: a node stood for them one turn in three, three minutes a turn. The wall clock, as an empty room does not tick |
| Where the harbour way's gate stands | Across the switchback's top landing at the Stair Yard's edge, in a stone wall 10 m high along that edge from the east sealed wall, the sealed gate module set in it as at the other two gates | The edge was open over the switchback's top leg as well as the landing, so a gate alone would leave a step round it |
| Which bays of the market | The outer bays between the lamp posts, the Harbourmaster's on the east (the Stair Yard's side, toward the harbour), backs on the line of the base's face, counters to the walk | The inner bays hold the fish and fruit stalls; the outer ones were empty |
| The chandlery | Stands in the market too, in the west outer bay opposite the Harbourmaster's | Its keeper is townsfolk life and has a mark on the held map; left past the gate it would be life no one sees |
| The quay and the moored ships | Kept as they were, seen from above and not walked; the low walls along the avenue, laid only to guard walkers, are gone | Nothing on them is used; the harbour still reads as a harbour |
| Shape's two places past the gate | Moved inside: one before the harbour way's gate, one at the market's west end | His week picks one of eight places; with fewer, some weeks he would stand nowhere |
| The tint's cause and fix | The sky's glare (`sky_sheen`) was added to every leaf in rain; a leaf's normal turns every way, so most faced a grazing eye and took the horizon's whole colour. Leaves now take the rain's darkening only, a little less than bark | The tint goes and the crown still reads wet |
| How much slower trees sway | Gusts 0.6 a second (were 1.4), a plant's rocking 0.85 (were 2.3), leaves' trembling 3 (were 7), in radians: about half speed and under | A sway every seven seconds reads as wind in a crown, not shaking |
| What "more detailed" puddles are | Only the deepest few hollows hold water, their shores ragged by a finer noise and sharp; rings spread where drops land while it rains, more the harder it falls. Their mirror and darkening are as before | Fewer and sharper reads as real standing water; ripples show it is raining on them |
