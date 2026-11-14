---
type: index
---
# Open Questions

Decisions waiting on the owner. None is in force until the owner decides it and it moves to [[Decisions]].

## Which readers come over?

The owner: "The readers are our code to port". DFO has two kinds of reader:

- **Readers of Daggerfall's own files** (`src/formats`: BSA archives, textures, RMB and RDB blocks, MAPS, the
  WOODS heightmap, sounds), translated from Daggerfall Unity. In Overlook there are no Daggerfall files for them to
  read, so they would sit unused, and they are DFU's design.
- **Readers of our own formats**: World 2.0's baked regions, the forge's packs, saves, the wire. These come over.

Recommendation: port the readers of our own formats; leave the Daggerfall file readers, unless the owner wants a
tool that works on Daggerfall's files, which would need those files present. Which did the owner mean?

## Does "Kamer's work counts as ours" carry to Overlook?

In DFO the owner ruled that Kamer's work counts as ours: World of Daggerfall, the windmills, the Arena colosseum,
Low Poly Trees, Raiding Parties, Warm Ashes ships and Enemy Expansion. They were made for DFO, on Daggerfall's
textures and models. Recommendation: bring over only their geometry and design, and only with Kamer's written
agreement for a commercial game ([[Own Work]]).
