---
type: system
status: live
code:
  - crates/sky/src/clock.rs#world_seconds
  - crates/sky/src/clock.rs#day_fraction
  - crates/sky/src/heavens.rs#heavens_at
  - crates/sky/src/heavens.rs#latitude_deg
---
# Sky

The world's clock and what stands in its sky: the sun, the moon and the stars over any place at any moment, the same
in every room and browser ([[A Day Lasts One Real Hour]], [[Weather and Day as Claude Shapes It]]).

## How it works

- **The clock.** World time is seconds from a fixed midnight, read off the wall by a room's host. A day lasts one
  real hour, so noon falls half an hour after each midnight, and every place keeps the same hour.
- **Latitude.** A place's latitude comes from how far down the map it lies: 62 degrees north at the top edge, 8 at
  the foot. The tundra, the highland and the steppe lie in the north; the desert, the savanna and the rainforest in
  the south.
- **The sun.** It rises in the east, stands south at noon and sets in the west, on the path a real sun takes at the
  place's latitude in a long summer (15 degrees north of the equator). The north's noon sun is lower and its night
  shorter: night, once the sun is 6 degrees under the horizon, lasts about 18 minutes of the hour in the far north and
  27 in the far south.
- **The moon.** One moon, new to new in eight days. It trails the sun by its phase, so a full moon rises at dusk and
  stands highest at midnight, and it rides as far south of the sun's path at full as the sun rides north.
- **The stars** wheel about the pole once a day.

## Limits

- There are no seasons: the year stands in its summer.
