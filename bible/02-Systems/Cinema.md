---
type: system
status: live
code:
  - client/src/cinema/rail.ts#railShot
  - client/src/cinema/cues.ts#Cues
  - client/src/cinema/cues.ts#HoldToSkip
  - client/src/cinema/screen.ts#Screen
  - client/src/cinema/logo.ts#logoNode
  - client/src/cinema/logo.ts#loadingNode
  - client/src/game/blur.ts#BlurView
  - client/src/cinema/lightning.ts#Lightning
  - client/src/cinema/ambience.ts#Ambience
  - client/src/cinema/ambienceShapes.ts#thunderShape
  - client/src/cinema/weather.ts#Weather
  - client/src/cinema/weather.ts#mixWeather
  - client/src/cinema/weather.ts#swellGained
  - client/src/cinema/atmosphere.ts#Atmosphere
  - client/src/cinema/atmosphereShader.ts#ATMOSPHERE_WGSL
  - client/src/cinema/birds.ts#Birds
  - client/src/cinema/birds.ts#birdAt
  - client/src/cinema/flames.ts#Flames
  - client/src/cinema/flames.ts#packFires
  - client/src/cinema/flameParts.ts#fireParts
  - client/src/cinema/inverted.ts#inverted
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
  rail keeps moving. A rail laid in a ship's own frame is carried into the world each frame as it sails.
- **Moments** (`Cues`). What happens once at given seconds into a cutscene (a line, a sound, a flash) runs in time
  order, exactly once, however long the frames are; a skipped cutscene runs every moment left at once, so the world
  is left as its end would leave it. Holding Space (or a touch anywhere on the view) for a second skips (`HoldToSkip`):
  the hint shows faintly at the bottom right while a cutscene can be skipped, and brightens with its share filled.
- **The screen** (`Screen`), drawn by the game as a layer of its interface over every other, the HUD's and the
  menu's: fades to black or white over any time, a white flash, the letterbox's bars, a darkening for waking, the
  title (the owner's logo over a brass rule, at a whole multiple of its cells within half the view's width), a
  prompt that breathes under it, and over the black the loading screen (`showLoading`: the logo and a breathing
  LOADING, said to a screen reader as it shows; `logo.ts` `loadingNode`, which every trip's veil draws too, [[One Loading Screen Covers Every Trip Until the Place Is Ready]]). Each layer eases over its own time on the interface's `ease` curve (`ui/ease.ts`),
  except the darkening, a black over the whole view, under the fades, that the story sets frame by frame
  (`darken`; [[The Prologue Wakes by Darkening and Pulsing, Not Eyelids]]). The blur over the whole view (`BlurView`) is drawn into the scene's own picture, under
  the interface, as death's grey is, so the words over it stay sharp: a Gaussian whose deviation is the blur's CSS
  pixels, set each frame, so it follows each frame and clears at once.
  While it stands a touch on the canvas is the story's (`touchesHeld`), so no drag pans the page or pulls it to reload
  and a held touch is never cut short. Once the story's black has gone after its end, the screen is taken away and the
  canvas has its own touches back.
- **The logo** (`logo.ts`) is the owner's ([[The Game Is Named No Shores]]), as a pixel picture of 255 by 64 cells
  in 11 colours (`logoPicture.ts`), written from the owner's PNG by `python3 -I tools/logo/write.py <logo.png>`: each
  cell the mean of 8 by 8 of its pixels, kept where half covered, its colours cut by median cut. The PNG is not in
  git; its C2PA credentials say it was made with ChatGPT. The tap to start shows it too, within 45% of the view's
  width and at twice its cells at most; the title, within half and at three times.
- **Lightning** (`Lightning`). Strikes come by themselves at seeded moments, 4 to 11 s apart, 0.4 to 4.5 km round the
  eye, or where a story calls one. Each is two flashes and a fading glow over a second, brighter the nearer it falls,
  its bolt shown for 0.22 s, and its thunder heard as late as its distance makes it.

### Sound

`Ambience` plays the sea's and the storm's sounds, each the owner's Freesound pick
([[Every Sound Comes From Freesound, and the Music Rests Between Pieces]]), silent until its recording has come. It
plays through the world's output, so the world's volume governs it; nothing plays until that output answers, and while
it is gone the levels keep gliding, so the sound picks up where they stand.

- **Beds.** Seven: rain (the sea's rain), wind (a gale), waves (the storm's sea), fire (a wreck burning), the deep,
  gulls and creaking timbers. A scene sets each from 0 to 1 and it glides there, eased at both ends. Each play of a
  bed's recording fades into the next at equal power. A bed is built only once it is first heard.
- **Gulls.** The sea's gull cries at random gaps that shorten as the gulls' level grows and stop when it falls silent.
  The recording is a whole flock, so each gap begins only once the last flock has ended: never two over each other.
- **One-shots.** Thunder arrives a second for every 0.343 km, quieter the farther it is: within 2.5 km the weather's
  crack, past it its roll. Then the crash of two hulls, a splash from a plank to a body, a body hitting the deck, the
  ears ringing, a heartbeat, the deep's bright flash and the rush of a fast camera move. Each lets go of its nodes once
  played.
- **Levels.** Each recording is as loud as the sound it took the place of, measured offline: the storm's rain is the
  loudest bed and the crash the loudest sound; nothing reaches full scale.

### Weather

A `Weather` is a handful of numbers: how overcast the sky is, how hard it rains or snows, how thick the mist is, a
layer of cloud to fly through, the wind, lightning's flash and its bolt, how deep under the sea the eye is, fire's
glow from above, and how many times its height the swell is drawn. `CLEAR` is none of it. A director eases from one
weather to the next with `mixWeather`; a bolt belongs to whichever end is nearer, and clouds or a glow thin to nothing
rather than snap. A storm's flash and bolt come from `Lightning`, above.

A weather may carry an hour of a story's day. A weather with one is told to the game's sky ([[Sky]]): the sky draws
its light at that hour, its cloud, rain, snow, fog and lightning, and the atmosphere pass keeps only what the sky
cannot draw (the cloud flown through, the deep, fire's glow from below). The cloud flown through takes the sky's
light at the hour, gold at first light, as the sky's own clouds do. The hour eases with the rest of it.

The game's scene reads `scene.weather` every frame. The water is drawn on the swell with every wave's height and
sideways carry times the weather's `seaGain` (`swellGained`); the waves' speeds and lengths stay the rules', so a ship
still rides where the server puts it. It is drawing only.

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

`Flames.light` lights a fire from half a metre to four metres tall and gives its id; `clear` puts every fire out. Given `along`,
the run in metres of an edge burning from its base (a rail, a fallen spar, a sail's foot), the fire burns all along that
edge, its flames, smoke and embers spread over its length; without it a fire is round.

A fire is drawn in the game's pixel look. Every part is laid out on a grid of 48 texels a metre, between the ships' 40
and the figures' 62, and coloured from a stepped palette: deep red at the rim, red, orange, yellow and a pale heart.
Nothing in it is a smooth gradient; smoke's cover comes in three steps. Only as the eye comes to a puff of smoke does
it fade softly to nothing, over the last 2.5 to 0.3 m to its near side (`nearFade.ts`), so a camera in or against a
column never sees it as a flat sheet over the whole view. Its flicker is held in frames, ten a second as a
sprite's are, and each fire turns its frames at a moment of its own, so a deck of fires never flickers in step.

Each frame of a fire comes from its seed and the clock. Its tongues of flame wander in height within a band, sway and
lean a little downwind; their edges lick and they tear near the tip, and each throws wisps from its tip that rise,
shrink and cool through the palette. A tongue is drawn as a solid of revolution round its leaning axis, the outline of
that solid as the eye sees it, so from beside it is a teardrop and from above or below a round blaze; it never turns to
a sliver. Seen end on it is drawn at its nearer end, so a fire sunk into a deck still shows from above. Smoke rolls up
in a column of puffs that rise, widen, thin and lean with `Flames.wind`; while low over the flames a puff is lit orange
from below, and it darkens from grey to black as it climbs. Embers are sparks one or two texels square, two dozen to a
small fire and more to a larger one, that swirl up in the heat, drift with the wind and burn out from a pale heart to
red. A fire's parts are worked out on the CPU once a frame of its flicker and kept; forty fires, a quarter of them along
edges, cost about 0.8 ms a frame on the test machine, and no frame draws more than 16,384 parts.

Smoke and flame are laid over the picture after the water, tested against the scene's depth, so the water never covers a
fire burning above it. Each fire also throws its light round it, laid under its flames at the picture's own size: the
glow reads the scene's depth back into the point drawn at each pixel and lights it by how near it stands to the fire's
middle, out to three times the fire's height, so the deck round a fire and whoever stands there are lit and the sky
seen past it is not. A fire along an edge throws the same light from up to seven points spaced no further apart than
that reach, so the edge is lit end to end. Its light is red-orange, its green half its red, added at half its strength
at the middle and falling off softly as the square of the way out (`fireLit`), so it warms orange timber and never
turns it yellow-green, and shows no edge; it is not the stepped light layer's.

### Trying it

Under `npm run dev` (or a build made with `NODE_ENV=development npx vite build --mode development`), the story
starts at any beat with `?prologue=<beat>` ([[Prologue]]), each in its own weather.

## Limits

- The overcast's ceiling and the mist are laid over the water's own sky, not drawn into it: a storm's sun still sets
  the water's highlights, only dimmed.
- Rain and snow are drawn round the eye only; they do not wet or whiten the ground.
- A fire's light casts no shadow: what stands behind a mast is lit too.
- The water writes no depth, so a fire's light never falls on the sea's surface round it.
- A fire's parts are not sorted by distance: within a fire the brightest flame is drawn last, and two fires that
  overlap on the screen are drawn in the order they were lit.
- Flames and smoke are flat to the eye: they cast no light on their own smoke beyond its stepped orange underside,
  and nothing passes through a flame (a figure walking into one is drawn behind or before it whole).
- A line fire takes at most six round fires' worth of parts and seven points of light, so an edge much longer than
  six fires' height burns thinner and is lit only at those points.
- Fire does not spread, die down or burn anything: a fire burns as it was lit until it is put out.
- Ships are posed on the rules' swell, so in a storm's gained sea a hull may sit into a drawn crest.
- Past the picture's edge the blur takes the edge's own pixels, so a blurred view keeps its brightness to the edge. The prompt's soft dark glow is not drawn, only its hard shadow under it.
