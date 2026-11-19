---
type: system
status: live
code:
  - crates/sky/src/weather.rs#weather_at
  - crates/sky/src/weather.rs#wetness_at
  - crates/sky/src/drift.rs#Drift
  - crates/sky/src/drift.rs#steering_m_s
  - crates/sky/src/air.rs#Air
  - crates/sky/src/lightning.rs#strikes_near
---
# Weather

One weather over the whole map, made from world time and place by the shared Rust rules, so the wind a ship sails
by is the wind the server judges and every player sees the same storm ([[The World Map]],
[[Weather and Day and Night Come From DFO, Much Improved]], [[Weather and Day as Claude Shapes It]]).

## How it works

- **Drifting fields.** Five fields of noise make the weather: the cloud deck (features about 160 km across), the
  damp that turns cloud into rain (90 km), the cells that grow into thunderstorms (28 km), the mist (45 km), and long
  spells of warm and cold (400 km). Each is carried by the steering flow and is a new pattern after a spell of 9 to
  60 minutes, fading from one to the next with no seam.
- **The steering flow.** The westerlies carry the weather east at 30 m/s north of 36 degrees; the trades carry it
  west at 18 m/s south of 20; the flow slackens and turns between ([[Sky]], "Latitude").
- **A place's air.** An island's comes from its biome ([[Land]]): its warmth at sea level, its year's rain, and
  whether its ground lifts sand (the desert's whole, the steppe's a little). The open sea's warmth runs from 5 degrees
  in the far north to 27 in the far south, with a moderate year's rain.
- **What it makes.** Cloud from the deck; rain or snow where the cloud is deep and the damp is high; thunderstorms
  where the cells are strong in warm air, on land mostly in the afternoon; snow where the air is under 3 degrees,
  all of it under half a degree; fog in still, damp air with the sun low; sand in a desert's strong wind. Each
  threshold moves with the air's rain, so a desert's cloud seldom rains and a swamp's often does.
- **Temperature.** The biome's warmth, less 6.5 degrees a kilometre of height, swinging through the day (7 degrees
  either way in a desert, 4.5 on land, 1.5 at sea), with the spells over it and the rain cooling it.
- **The wind.** It blows round the deck's lows, keeping a low on its left as the north's winds do, over a fifth of
  the steering flow, and rises by up to 90% in a storm: 0.8 to 26 m/s, about 6 on average. Gusts grow with the storm,
  the wind and the sand.
- **Lightning.** The map is cut into 4 km cells and time into 6 s slots. A cell under a whole storm strikes in about
  one slot in five or six; a third of strikes reach the ground. Every browser that asks of the same slots gets the
  same strikes, wherever and however often it asks.
- **Wet ground.** The ground's wetness is the rain of the last twenty minutes at the place, the latest counting most.

What each climate's weather comes to, read over three days: rain or snow falls about half the time in the swamp and
the rainforest, a fifth over the temperate islands and the sea, and seldom in the desert. Thunderstorms come a tenth
of the time in the wet south and hardly ever in the north. Sand blows in the desert about one reading in eight, and
the tundra's fall is snow by night and sleet by day.

## Limits

- A place's weather is read in its own air: at a coast the sea's and the island's are two airs over one pattern.
