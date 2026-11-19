---
type: pick
area: Engine
verdict: Cut
effort: L
status: ported
dfo_paths:
  - src/systems/weather/weatherMap.js
  - src/systems/weather/weatherFront.js
  - src/systems/weather/wetness.js
  - src/systems/weather/nightFog.js
  - src/systems/wind/wind.js
  - src/systems/lightning.js
  - src/systems/distantStorms.js
  - src/render/enhancedSky.js
  - src/render/cloudShadow.js
  - src/render/lightningBolts.js
  - src/render/precipitation.js
dfo_commit: 1c0fd681
---
# Pick - Weather and Sky

DFO's own weather and sky: a map of storm systems carried by the wind, fronts that bring the rain in and out, the
enhanced sky dome with its moons and stars, cloud shadows, lightning and its distant storms, rain and snow round the
eye, and wet ground. The owner chose them for Overlook, much improved
([[Weather and Day and Night Come From DFO, Much Improved]]). How it works now is [[Weather]] and [[Sky]].

## What comes over

- The idea of DFO's weather map: weather made from world time and place by a law every client runs, carried by the
  wind, its thunderstorms striking on a shared schedule, their thunder delayed by distance.
- Its look: the sky lit by the sun's height, from day through twilight to night, with moons and stars; cloud cover
  by the weather; cloud shadows on the ground; rain and snow round the eye; bolts and their flash; wet ground; fog
  thickened by the weather; and the night's fog never darker than the lit air.
- Its sound: rain's bed at the drops' level, thunder from each strike after its distance, the wind's own bed.

## What stays behind

Everything of Daggerfall Unity's in DFO's weather and clock: its day clock, calendar, moons and seasons, its weather
table and its odds, its weather words and fog table, its lightning schedule and its ambient effects; and every mod's
work: Dynamic Skies, Snowfall, Windfall, Heat Haze and Better Ambience ([[Own Work]]).

## Our version

- **One law, in Rust.** The weather is the sky crate's, run by the rooms and by every browser through WebAssembly,
  agreeing to the bit; DFO's was each browser's own JavaScript, its clock rate a client constant.
- **One field, cheap.** Drifting fields of noise read in microseconds, where DFO's lattice of storm systems cost up
  to a fifth of a second to draw a node and needed a memory of 40,000 births.
- **One wind.** The weather's wind drives the ships' sails and fights, the chop and whitecaps, the clouds' drift, the
  rain's slant, the trees' sway and the wind's sound; DFO had four winds that disagreed.
- **The same for everyone.** Clouds drift by world time, strikes fall on a shared lattice, bolts take their shape from
  their strike; in DFO each browser's clouds and overhead lightning were its own.
- **A real sun.** The sun and moon follow a real sky at each place's latitude, so the north's evenings are long and
  low; DFO's sun ran the same east-west arc everywhere, rising at 6 and setting at 18.
- **The key light by the sun's height**, warm and gold when low, the moon's at night, shadows cast along it; DFO's
  key light was one colour at every height and the moon cast no shadow.

How it works now is [[Sky]] and [[Weather]].