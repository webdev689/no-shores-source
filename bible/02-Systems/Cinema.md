---
type: system
status: live
code:
  - client/src/cinema/weather.ts#Weather
  - client/src/cinema/weather.ts#mixWeather
  - client/src/cinema/weather.ts#swellGained
  - client/src/cinema/weather.ts#strikeAt
  - client/src/cinema/atmosphere.ts#Atmosphere
  - client/src/cinema/atmosphereShader.ts#ATMOSPHERE_WGSL
  - client/src/cinema/birds.ts#Birds
  - client/src/cinema/birds.ts#birdAt
  - client/src/cinema/flames.ts#Flames
  - client/src/cinema/flames.ts#fireParts
  - client/src/cinema/flamesShader.ts#FLAMES_WGSL
  - client/src/cinema/seeded.ts#hashUnit
  - client/src/cinema/trying.ts#Trying
  - client/src/game/scene.ts#GameScene
---
# Cinema

What the [[Prologue]]'s cutscenes are made with: the camera on rails, the screen's fades and bars, the weather
(clouds, rain, snow, mist, a storm and its lightning), birds, fire and smoke, and the sounds of the sea and the storm.

## How it works

### Weather

A `Weather` is a handful of numbers: how overcast the sky is, how hard it rains or snows, how thick the mist is, a
layer of cloud to fly through, the wind, lightning's flash and its bolt, how deep under the sea the eye is, fire's
glow from above, and how many times its height the swell is drawn. `CLEAR` is none of it. A director eases from one
weather to the next with `mixWeather`; a bolt belongs to whichever end is nearer, and clouds or a glow thin to nothing
rather than snap. `strikeAt` gives a storm's lightning: a stroke every few seconds, flickering twice over a third of a
second, its bolt somewhere round a point. `WEATHERS` holds one of each kind to start from.

The game's scene reads `scene.weather` every frame. The water is drawn on the swell with every wave's height and
sideways carry times the weather's `seaGain` (`swellGained`); the waves' speeds and lengths stay the rules', so a ship
still rides where the server puts her. It is drawing only.

### The atmosphere pass

After the water, whatever draws over it and the light layer, and before the first person's hands, one triangle covers
the picture. Each pixel works out how far its ray runs to what is drawn there: the scene's depth, else the sea at
height 0, else the sky. It then lays the weather over the picture in layers, each keeping a share of what is there
and adding its own colour, so the one draw both dims the fixed sun and adds the weather:

- the overcast dims and cools the light and turns the sky into a low, mottled ceiling drifting with the wind;
- mist, rain and snow thicken the air by distance (at a mist of 1 a ship 300 m off is a shadow and 600 m off is gone);
- a cloud layer is marched through in sixteen steps between its base and top, only while one is set, so flying
  through it whites out and opens again where the cloud is thin;
- under the sea the deep's dark blue closes in, motes drift, and fire's glow flickers through the surface above;
- rain and snow fall on four rings round the eye, each hidden behind what stands nearer, the rain's streaks slanted
  as the wind carries them across the view;
- a bolt forks twice down to its point, hidden behind what stands nearer, and the flash lights the whole scene.

A clear weather skips the pass, so the picture is exactly as without it. A player who asks for reduced motion never
sees a flash brighter than a third.

### Birds

`Birds.flock` adds gulls round a centre. Each bird wheels round in a loose circle of its own (its circle breathes in
and out and its centre wanders, so no two rounds are the same) and never strays past the flock's radius; it flaps for
a spell and then glides with its wings held a little up. A bird is a few flat triangles with dark wingtips, drawn in
the scene's pass with depth, and never smaller than a speck however far off.

### Fire

`Flames.light` lights a fire from half a metre to four metres tall and gives its id; `put` puts it out. Each frame a
fire's parts come from its seed and the clock: five tongues of flame whose height wanders within a band and leans a
little downwind, twelve puffs of smoke that rise, grow, thin and lean with `Flames.wind`, and ten embers that fly up
and burn out. Smoke and flame are laid over the picture after the water, tested against the scene's depth, so the
water never covers a fire burning above it. Each fire also throws a glow into the light layer ([[Weapon Glow]]),
which lights what stands round it in the game's stepped halo.

### Trying it

In a development build, `?weather=storm|rain|snow|mist|clouds|deep`, `?birds=1` and `?flames=1` set the weather,
two flocks and three fires up round the arrival; `?shot=sea` (and the deep, always) moves the camera out over the
nearest open sea, inside the cloud layer when it is the clouds. A storm strikes lightning every five seconds, and
`?strike=1` holds a stroke lit for a picture.

## Limits

- The overcast's ceiling and the mist are laid over the water's own sky, not drawn into it: a storm's sun still sets
  the water's highlights, only dimmed.
- Rain and snow are drawn round the eye only; they do not wet or whiten the ground.
- A fire's light is the light layer's, so it is stepped and screen-wide, not cast onto the deck as a shadowed lamp.
- Ships are posed on the rules' swell, so in a storm's gained sea a hull may sit into a drawn crest.
