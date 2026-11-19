---
type: system
status: live
code:
  - crates/sky/src/clock.rs#world_seconds
  - crates/sky/src/clock.rs#day_fraction
  - crates/sky/src/heavens.rs#heavens_at
  - crates/sky/src/heavens.rs#latitude_deg
  - client/src/sky/lamps.ts#lampsRound
  - client/src/sky/skyUniform.ts#SKY_WGSL
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

## Lights at night

Night is in between: the open reads under the moon, while under trees and in alleys it is dark, and the lights are
what show the ground there.

- **Lamps.** A city's glowing solids (the Beacon's fire, the lanterns at its stations and courtyards) are its lamps:
  a fire's warm light from the solid's middle, reaching some ten metres from a lantern and up to sixty from a great
  fire. They flicker gently, each on its own beat, and are lit only as the daylight fades, coming up through the dusk.
  The glowing surfaces themselves burn brighter at night than by day.
- **A carried light.** A torch or a lantern in the player's left hand lights round them on foot at night, a lamp at
  the hand just under the eye: a torch's reaches some eleven metres and flickers, a lantern's thirteen and is steadier.
- **The nearest sixteen.** Each frame the carried light and the lamps nearest the eye (counting their reach) go to the
  sky's uniform, at most sixteen, so the cost stays bounded. Every lit surface (the land, the plants, the city, the
  ships, the marks and the figures) adds their light: each falls smoothly to nothing at its reach, brightest on a face
  turned to it, with no shadows. A figure by a lantern is lit warm.
- **Clouds' shadows.** Under a broken sky the key light is dappled on the ground in soft patches as wide as the cover,
  drifting with the clouds. A clear sky has none, and under a whole deck they fade out: the key light is dimmed already.
- **Wet and snow.** The weather's wetness darkens the land and the city's stone and gives them a sheen toward a grazing
  eye; once the ground is soaked, rain stands in puddles in the flat hollows of the land and the plaza. Fresh snow
  whitens the flat tops a little where snow lies already. Wet leaves glisten.


- There are no seasons: the year stands in its summer.
- Lamps cast no shadows, and windows are never lit: the city's plan gives windows no places.
- The ground's hollows where puddles stand are a pattern, not the land's real low spots.
