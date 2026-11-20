---
type: system
status: live
code:
  - crates/sky/src/clock.rs#world_seconds
  - crates/sky/src/clock.rs#day_fraction
  - crates/sky/src/heavens.rs#heavens_at
  - crates/sky/src/heavens.rs#latitude_deg
  - client/src/sky/skyLook.ts#lookOf
  - client/src/water/skyDome.ts#SKY_DOME_WGSL
  - client/src/overworld/overworldCamera.ts#cloudBaseOf
  - client/src/sky/lamps.ts#lampsRound
  - client/src/sky/skyUniform.ts#SKY_WGSL
---
# Sky

The world's clock and what stands in its sky: the sun, the moon and the stars over any place at any moment, the same
in every room and browser ([[Weather and Day and Night Come From DFO, Much Improved]], [[A Day Lasts One Real Hour]],
[[Weather and Day as Claude Shapes It]]).

## How it works

- **The clock.** World time is seconds from a fixed midnight, read off the wall by a room's host. A day lasts one
  real hour, so noon falls half an hour after each midnight, and every place keeps the same hour.
- **Latitude.** A place's latitude comes from how far down the map it lies: 62 degrees north at the top edge, 8 at
  the foot. The tundra, the highland and the steppe lie in the north; the desert, the savanna and the rainforest in
  the south.
- **The sun.** It rises in the east, stands south at noon (in the far south, under 15 degrees, a little north of
  overhead) and sets in the west, on the path a real sun takes at the place's latitude in a long summer (15 degrees
  north of the equator). The north's noon sun is lower and its night shorter: night, once the sun is 6 degrees under
  the horizon, lasts about 14 minutes of the hour at the map's top edge (18 over the tundra) and 27 at its foot.
- **The moon.** One moon, new to new in eight days. It trails the sun by its phase, so a full moon rises at dusk and
  stands highest at midnight, and at full it stands as far south of the equator as the sun stands north of it.
- **The stars** wheel about the pole once a day.

## How the sky looks

The browser reads the sky's law at the eye each frame and turns the reading into colours and lights (`skyLook.ts`);
the water's backdrop draws the sky from them, and the water reflects it.

- **By day** the sky is blue overhead, paler at the horizon. The sun is a small bright disc with a halo that widens
  as it sinks. Its light is white overhead and turns gold and then orange as it nears the horizon.
- **Twilight.** At sunset the sky is still blue. A warm glow sits low toward the sun's bearing, gold while the sun is
  up and red once it is under. Opposite the sun, a pink band lies over the earth's bluer shadow. The sky darkens
  slowly through civil twilight (the sun 6 degrees under) and is a deep blue, never black, by night. Dawn runs the
  same way back, so the sky brightens well before sunrise.
- **Night.** Stars come out as twilight ends. They wheel about the pole, which stands due north as high as the
  place's latitude. Cloud hides them, and a bright moon washes out the faint ones. The moon is a disc lit on the
  sun's side by its phase, with a faint halo. Under a full moon the moon is the key light, and with the night's
  floor of light the land and the city stay plainly readable.
- **Clouds.** Two layers drift with the weather's steering flow, the same in every browser. Each pattern is carried
  only through its own spell of ten minutes, and the next fades in over the spell's last quarter, so walking from the
  westerlies into the trades never sets the clouds racing. Thin cirrus streaks lie high up. Below them is a cumulus
  deck whose cover is the weather's: scattered puffs in fair weather, a closed grey deck when overcast. In a storm the
  deck is lower and darker. The key light lights the clouds, brighter on their side toward it, with a silver edge
  round the sun and darker undersides. At sunset they take the glow's colours, and at night the moon lights them.
- **Lightning** lights the sky and the clouds from within for the flash's moment; the water's reflection carries it.
- **Haze and fog.** Distant land fades into the sky's colour near the horizon. The weather's fog adds its own density
  and colour: grey in rain, tan in sand, and thickest near sea level, so a low coast fills before the hills above it.
  In thick fog the sky itself closes in to the fog's colour.
- **The overworld camera** stays under the cloud deck. A deck forms from half cover, about 1150 m up, and lowers as
  the cover closes. Steady rain brings it down to about 400 m, the heaviest to about 200 m and a storm a little lower
  still; the camera keeps 60 m under it, and never comes lower than its floor.

## Lights at night

Night is in between: the open reads under the moon, while under trees and in alleys it is dark, and the lights are
what show the ground there.

- **Lamps.** A city's glowing solids (the Beacon's fire, the lanterns at its stations and courtyards) are its lamps:
  a fire's warm light from the solid's middle, reaching some ten metres from a lantern and up to sixty from a great
  fire. They flicker gently, each on its own beat, and are lit only as the daylight fades, coming up through the dusk.
  The glowing surfaces themselves burn brighter at night than by day.
- **A carried light.** A torch or a lantern in the player's left hand lights round them at night, on foot and walking
  the Sloop's deck, a lamp at their hand, in first person and third alike: a torch's reaches some eleven metres and
  flickers, a lantern's thirteen and is steadier.
- **The nearest sixteen.** Each frame the carried light and the lamps nearest the eye (counting their reach) go to the
  sky's uniform, at most sixteen, so the cost stays bounded. The last of them fade as the next lamp nears, so none
  switches on or off as the eye moves. Every lit surface (the land, the plants, the city, the ships, the marks and the
  figures) adds their light: each falls smoothly to nothing at its reach, brightest on a face turned to it, with no
  shadows. A figure by a lantern is lit warm.
- **Clouds' shadows.** Under a broken sky the key light is dappled on the ground in soft patches as wide as the cover,
  drifting as the clouds overhead do. A clear sky has none, and under a whole deck they fade out: the key light is
  dimmed already.
- **Wet and snow.** The weather's wetness darkens the land and the city's stone and gives them a sheen toward a
  grazing eye; once the ground is soaked, rain stands in puddles in the flat hollows of the land and the plaza. Snow
  that has fallen in the last twenty minutes whitens the flat ground near the snow line. Wet leaves glisten.

## Limits

- There are no seasons: the year stands in its summer.
- The World Editor and the Test Ground keep a clear afternoon sky; the World Editor's ships still sail, and their
  sails fill, in the weather's wind.
- Lamps cast no shadows, and windows are never lit: the city's plan gives windows no places.
- Standing at the Sloop's helm, the player's torch or lantern lights nothing; only walking her deck does it.
- The ground's hollows where puddles stand are a pattern, not the land's real low spots.
