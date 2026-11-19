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
- **Clouds.** Two layers drift east with the weather's steering flow, the same in every browser. Thin cirrus streaks
  lie high up. Below them is a cumulus deck whose cover is the weather's: scattered puffs in fair weather, a closed
  grey deck when overcast. In a storm the deck is lower and darker. The key light lights the clouds, brighter on
  their side toward it, with a silver edge round the sun and darker undersides. At sunset they take the glow's
  colours, and at night the moon lights them.
- **Lightning** lights the sky and the clouds from within for the flash's moment; the water's reflection carries it.
- **Haze and fog.** Distant land fades into the sky's colour near the horizon. The weather's fog adds its own density
  and colour: grey in rain, tan in sand, and thickest low down, so a valley fills before a hilltop. In thick fog the
  sky itself closes in to the fog's colour.
- **The overworld camera** stays under the cloud deck. A deck forms from half cover, about 1150 m up, and lowers as
  the cover closes. Steady rain brings it down to about 400 m, the heaviest to about 200 m and a storm a little lower
  still; the camera keeps 60 m under it, and never comes lower than its floor.

## Limits

- There are no seasons: the year stands in its summer.
