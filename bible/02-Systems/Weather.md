---
type: system
status: live
code:
  - client/src/sky/shelter.ts#shelterOver
  - crates/sky/src/weather.rs#weather_at
  - crates/sky/src/weather.rs#ground_at
  - crates/sky/src/drift.rs#Drift
  - crates/sky/src/drift.rs#steering_m_s
  - crates/sky/src/air.rs#Air
  - crates/sky/src/lightning.rs#strikes_near
  - client/src/sky/skyDriver.ts#SkyDriver
  - client/src/sky/fall.ts#FallView
  - client/src/sky/bolts.ts#BoltView
  - client/src/sky/bolts.ts#boltPath
  - client/src/sky/fall.ts#carriedOn
---
# Weather

One weather over the whole map, made from world time and place by the shared Rust rules, so the wind a ship sails
by is the wind the server judges and every player sees the same storm ([[The World Map]],
[[Weather and Day and Night Come From DFO, Much Improved]], [[Weather and Day as Claude Shapes It]]).

## How it works

- **Drifting fields.** Five fields of noise make the weather: the cloud deck (features about 160 km across), the damp
  that turns cloud into rain (90 km), the cells that grow into thunderstorms (28 km), the mist (45 km), and long
  spells of warm and cold (400 km). Each is carried by the steering flow (the cells at four fifths of it, the mist at
  under a third) and is a new pattern after a spell of 9 to 60 minutes, fading from one to the next with no seam.
- **The steering flow.** The westerlies carry the weather east at 30 m/s north of 36 degrees; the trades carry it
  west at 18 m/s south of 20; the flow slackens and turns between ([[Sky]], "Latitude").
- **A place's air.** An island's comes from its biome ([[Land]]): its warmth at sea level, its year's rain, and
  whether its ground lifts sand (the desert's whole, the steppe's a little). The open sea's warmth runs from 5 degrees
  in the far north to 27 in the far south, with a moderate year's rain.
- **What it makes.** Cloud from the deck; rain or snow where the cloud is deep and the damp is high; thunderstorms
  where the cells are strong in warm air, on land mostly in the afternoon, as the ground warms two hours behind the
  sun; snow where the air is under 3 degrees, all of it under half a degree; fog in still, damp air with the sun low;
  sand in a desert's strong wind. Each threshold moves with the air's rain, so a desert's cloud seldom rains and a
  swamp's often does.
- **Temperature.** The biome's warmth, less 6.5 degrees a kilometre of height, swinging through the day two hours
  behind the sun, warmest in mid-afternoon (7 degrees either way in a desert, 4.5 on land, 1.5 at sea), with the
  spells over it and the rain cooling it.
- **The wind.** It blows round the deck's lows, keeping a low on its left as the north's winds do, over a fifth of
  the steering flow, and rises by up to 90% in a storm: 0.8 to 26 m/s, about 6 on average. Gusts grow with the storm,
  the wind and the sand.
- **Lightning.** The map is cut into 4 km cells and time into 6 s slots. A cell under a whole storm strikes in about
  one slot in five or six; three in ten strikes reach the ground. Everyone who asks of the same slots in the same air
  gets the same strikes, however often they ask; a search within a reach gives only the strikes inside it.
- **Wet and white ground.** The ground holds the rain and the snow of the last twenty minutes at the place, the latest
  counting most: rain wets it and snow whitens it, never the other way.

What each climate's weather comes to, read over three days: rain or snow falls about half the time in the swamp and
the rainforest, a fifth over the temperate islands and the sea, and seldom in the desert. Thunderstorms come a tenth
of the time in the wet south and hardly ever in the north. Sand blows in the desert about one reading in eight, and
the tundra's fall is snow by night and sleet by day.

## In the browser

- **Read each frame.** The game reads the weather at the eye from the sky crate, through its own WebAssembly, at the
  page's world clock, in the island's air on foot and the sea's at sea. The page's clock is its wall, set right by
  each room's snapshots: a room's welcome carries its world time at its first tick, and each snapshot's tick counts on
  from it.
- **Rain, snow and sand** fall round the eye, drawn over the finished picture: up to 14,000 drops, 15,000 flakes and
  6,000 grains in a 24 m box that wraps round the eye, each standing in the world, so walking through the rain leaves
  it where it is. Drops fall at 9 m/s and lean with a little over half the wind, drawn as streaks; flakes fall at 1.1
  m/s, each swaying up to 0.4 m round its path, drawn larger within 4 m; sand runs low, a little faster than
  the wind.
- **Shelter.** On foot nothing falls, wets, puddles or snows under something a body meets overhead: a roof, a
  ceiling, an arch, a bridge ([[The Hub's Fidelity Goes Beyond the Limits, by Procedural Textures]]). A grid 224 m
  round the eye, so the far end of a great hall is on it, holds over each 2 m cell the highest underside of the
  node's boxes reaching a quarter of a cell or more into it, so a roof ending on a wall's face shelters the floor up
  to it; a box narrower than a cell (a brazier, a lamp's head) shelters nothing. It is laid again when the eye strays
  16 m (`client/src/sky/shelter.ts`), and rides in the sky's uniform, so every sunlit shader reads it
  (`sky_sheltered`). A face is read 0.6 m out from itself, so a wall's outside is not its room. Under an awning or a
  tree, which no body meets, it still rains.
- **How it moves.** Each frame carries each kind on by its wind and its fall over that frame, at most a tenth of a
  second, so a change of wind changes how fast it moves, never where it stands. Each takes the sky's light, brighter
  in a flash. What stands nearer in the scene hides them, and none falls under the sea. Above 300 m over the ground
  none is drawn.
- **Lightning** is followed within 40 km of the eye and kept 80 s for its thunder. A strike flashes for a third of a
  second, a stroke and two return strokes, brightest near and to the ground, lighting the sky and the land.
- **Bolts.** Its bolt is drawn while it flashes. It leaves the base of the cloud deck over the eye, the deck the
  [[Overworld]]'s camera stays under: about 150 m in a whole storm. Under less than half cover it leaves where half
  cover's base would stand. To the ground it is a jagged channel with two branches, down to the land under the strike
  or to the sea, from a base at least 200 m over that ground. In the cloud it runs 2.5 to 6 km across, 60 to 120 m
  under the base, as a crawler is seen from below; inside the cloud it would only light it. Its shape comes from the
  strike itself, so every browser draws the same bolt. It is seen through the same haze and fog as the land, but it
  is far brighter than anything else in the sky: only where the haze lets through less than a fifth, low down in
  rain, does it fade, so a far bolt's foot fades into the grey as the sea under it does.

## Limits

- A place's weather is read in its own air: at a coast the sea's and the island's are two airs over one pattern.
- Shelter is to the 2 m cell: past a roof's open edge (an eave, an arch's mouth) the ground stays dry up to a
  metre and a half out.
