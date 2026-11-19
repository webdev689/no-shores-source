---
type: system
status: live
code:
  - client/src/cinema/rail.ts#railShot
  - client/src/cinema/cues.ts#Cues
  - client/src/cinema/cues.ts#HoldToSkip
  - client/src/cinema/screen.ts#Screen
  - client/src/cinema/lightning.ts#Lightning
  - client/src/cinema/ambience.ts#Ambience
  - client/src/cinema/ambienceShapes.ts#thunderShape
  - client/src/cinema/ambienceVoices.ts#crashVoice
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
  - client/src/game/scene.ts#GameScene
---
# Cinema

What the [[Prologue]]'s cutscenes are made with: the camera on rails, the screen's fades and bars, the weather
(clouds, rain, snow, mist, a storm and its lightning), birds, fire and smoke, and the sounds of the sea and the storm.

## How it works

### The camera and the screen

- **Rails** (`railShot`). A cutscene's camera runs through keys, each a time, an eye, the point it looks at and,
  where it changes, the lens. Eye and look are each carried on a Catmull-Rom curve through the keys, so the camera
  sweeps through them without a corner; it eases out of rest at its first key and into rest at its last unless the
  rail keeps moving. A rail laid in a ship's own frame is carried into the world each frame as she sails.
- **Moments** (`Cues`). What happens once at given seconds into a cutscene (a line, a sound, a flash) runs in time
  order, exactly once, however long the frames are; a skipped cutscene runs every moment left at once, so the world
  is left as its end would leave it. Holding Space (or a touch on the screen) for a second skips (`HoldToSkip`):
  the hint shows faintly at the bottom right while a cutscene can be skipped, and brightens with its share filled.
- **The screen** (`Screen`), laid over the canvas: fades to black or white over any time, a white flash, the
  letterbox's bars, eyelids that close from above and below for waking, a blur over the whole view, the title (the
  game's name over a brass rule, sized to fit a phone's width) and a prompt that breathes under it.
- **Lightning** (`Lightning`). Strikes come by themselves at seeded moments, 4 to 11 s apart, 0.4 to 4.5 km round the
  eye, or where a story calls one. Each is two flashes and a fading glow over a second, brighter the nearer it falls,
  its bolt shown for 0.22 s, and its thunder heard as late as its distance makes it.

### Sound

`Ambience` makes the sea's and the storm's sounds in the browser, all synthesised from noise, filters and
oscillators, none recorded. It plays through the world's output, so the world's volume governs it; nothing plays
until that output answers, and while it is gone the levels keep gliding, so the sound picks up where they stand.

- **Beds.** Seven: rain (a hiss over a roar of drops), wind (a gale whose pitch and strength wander at unrelated slow
  rates, so the gusts never repeat), waves (the sea swelling round the hull), fire (a low roar under crackle), the
  deep (a muffled pressure), gulls and creaking timbers. A scene sets each from 0 to 1 and it glides there, eased at
  both ends. The noise is made once for each audio context and folded at its ends, so a loop has no seam. A bed is
  built only once it is first heard.
- **Spot sounds.** Gull cries, timbers creaking, waves breaking on the hull, pops in the blaze and groans in the deep
  ride on their beds, at random gaps that shorten as the bed grows louder and stop when it falls silent.
- **One-shots.** Thunder arrives a second for every 0.343 km, duller and quieter the farther it is: within 0.5 km a
  tearing crack, by 2.5 km only a roll. Then the crash of two hulls (timber splitting, a deep boom, debris after), a
  splash from a plank to a body, a body hitting the deck, the ears ringing, a heartbeat, the deep's bright flash (a
  glassy swell rising an octave) and the whoosh of a fast camera move. Each lets go of its nodes once played.
- **Levels.** The storm's rain is the loudest bed and the crash the loudest sound; nothing reaches full scale.

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

Under `npm run dev` (or a build made with `NODE_ENV=development npx vite build --mode development`), the story
starts at any beat with `?prologue=<beat>` ([[Prologue]]), each in its own weather.

## Limits

- The overcast's ceiling and the mist are laid over the water's own sky, not drawn into it: a storm's sun still sets
  the water's highlights, only dimmed.
- Rain and snow are drawn round the eye only; they do not wet or whiten the ground.
- A fire's light is the light layer's, so it is stepped and screen-wide, not cast onto the deck as a shadowed lamp.
- Ships are posed on the rules' swell, so in a storm's gained sea a hull may sit into a drawn crest.
