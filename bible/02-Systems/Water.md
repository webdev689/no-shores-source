---
type: system
status: live
code:
  - crates/land/src/sea.rs#Swell
  - crates/land/src/sea.rs#SeaHere
  - crates/world/src/weather.rs#air_at
  - crates/world/src/weather.rs#shelter
  - crates/room-wasm/src/sea_door.rs#swell_json
  - client/src/water/seaWeather.ts#SeaWeather
  - client/src/ships/hullLines.ts#waterlineOf
  - client/src/water/wakes.ts#wakeAt
  - crates/land/src/exact.rs#sin_cos
  - client/src/water/shore.ts#shoreField
  - client/src/water/swimming.ts#bodyStep
  - client/src/water/ripples.ts#RippleField
  - client/src/water/waterView.ts#WaterView
  - client/src/water/waterShader.ts#WATER_SHADER
  - client/src/editor/landScene.ts#LandScene
  - client/src/water/hullMask.ts#hullInside
---
# Water

The sea, the lakes and the rivers over the [[Land]], in stylised realism ([[The Water Is Stylised Realism]]). The
World Editor's 3D view draws it, and its walker wades, swims and dives in it. DFO's water was a reference for ideas;
none of its code came over.

## The swell

The long waves of the open sea are rules, in the land crate (`sea.rs`), so a ship or a swimmer rides the same wave on
the server and in every browser ([[Agree to the Bit]]). A set of the swell is ten Gerstner waves about one bearing,
from a fixed seed and world time: about 140 m long down to about 5 m, each as steep as a moderate sea's, two to three
metres from trough to crest. The shorter a wave, the further it strays from the wind. Their crests sharpen together,
never folding over.

The swell follows the weather ([[World Map]], "Weather and travel"). There is a set for each of eight bearings round
the compass at two lengths, 0.8 and 1.4 times a moderate sea's. At a point the sea sums the sets at the two bearings
either side of the weather's wind and the two lengths round its own, each weighted by how near: a set keeps its phases
everywhere and always, so only the weights change, over kilometres and hours, and the sea never jumps. The weights'
squares sum to one, so a blend is as high as one set. The whole is as high as the sea state makes it (0.35 of a
moderate sea's in a calm, 1 moderate, 1.8 rough, 3 in a storm, blended between the bands' middles), times the share
its fetch leaves (a quarter at under 2 km of open water upwind, whole at 60 km), and eased to 0.3 within 3 km of a
roadstead whatever the weather. The higher the sea, the longer its waves. So the sea lies calm in a harbour and the
lee of an island and rises high in a storm. Forty waves at most are summed.

The swell feels the bottom: it is whole where the sea is 15 m deep and gone at 1 m, where the breakers take over. The
sea's height at a point is found by following the water back to where it rests, as a wave carries water sideways.
Sine and cosine are the land crate's own, made from + - * / alone. The land's door hands the browser a moderate sea's swell with
each landmass, and the sea's height at any sampled point; the room module's door (`sea_door.rs`) hands it the swell
under the weather at a point and its height over a grid round the view. The sea's height under the weather is held to
one fingerprint natively and through WebAssembly.

## The breakers

The waves that break on a shore are drawn in the browser only. Round the close-up, the editor works out how long a
breaker takes to reach the waterline from every sample: it travels at the speed of shallow water, the square root of
gravity times depth. A crest is every point the same time out, so the crests bunch up as the sea shoals and bend round
a headland.

A breaker rises from 12 m deep, grows as it shoals, steepens its face and breaks once its height nears four fifths of
the depth. Every 9 s one rolls in, in sets. Spent, it runs up the beach as swash and draws back; the sand below its
reach is darker, as wet as the bed it runs on into. The beach is the low, gentle ground along the painted coast.

## The surface

A disc of rings round the eye, finer near it, carries the swell and the breakers; waves too short for its rings or a
pixel fade out. The land is drawn first, with its seabed, then the water over it. The water's edge is drawn at each
pixel, where its surface meets the ground there, so it is the land's own line however coarse the meshes far off:

- **Depth.** The seabed is seen through the water, bent by the surface and tinted by the water it is seen through:
  sand shows turquoise in the shallows, and the sea deepens to blue. Lakes and rivers are greener and murkier.
- **Light.** The sky and its clouds reflect, more at a glancing angle; the sun glints, its glitter blurring far off;
  a crest glows green where the sun shines through it. Caustics dance on the bed.
- **Blurred reflections.** Waves too small to draw fan each reflected pixel's rays about 0.2 radians at sea, less
  on calm fresh water. So the reflected clouds lose their fine detail and keep their mean cover. Looking down, their
  shapes still show; near the horizon they smear into a lighter sky.
- **Foam.** Foam is a lace of bubble walls. It covers crests that fold, a breaker's face and the surf behind it, the
  swash's edge and a splash. Each scale of lace gives way to its share as it shrinks toward a pixel.
- **Fresh water.** A lake lies still under a light chop; a river's chop runs downstream at a pace set by its fall.
  Near the camera its edge is the land door's own (how far past fresh water a point lies), so the waterline runs
  along a river's channel or a lake's shore however the samples fall, even where the plain lies level with the river.
  It is drawn 5 cm under its level, so a bank at the level shows dry. Where its level would dip under the sea's, it
  is the sea's.

## In the water

The walker walks on ground and in water under half a metre deep. Deeper, they wade at half pace; from 1.4 m deep they
swim at the surface, eyes riding the waves. Holding `C` dives toward the bed, `Space` rises faster, and left alone a
diver drifts back up. Each stride or stroke pushes the water once; stepping in, diving under and coming up splash.

The pushes are ripples: a damped wave field 32 m square round the walker, stepped 60 times a second on the GPU at a
ripple's own pace. The field follows the walker; its ripples fade at its edge.

## A ship on it

A ship drawn with the land hides the water behind her and is seen through it below her waterline. She rides the swell
through her inertia: each wave answered as a first-order lag answers it, her time constant 0.02 s a metre of her
waterline's length, so a Frigate rides the short waves less than a Sloop ([[Sailing]]). Her bow slams when it pitches
down faster than 0.08 radians a second while the sea at her stem stands over it, and throws spray.

Her footprint is her own hull line at her waterline, read from her mesh where its faces cross it (16 stations, stern
to bow; a fair hull until her mesh comes), a hair inside it: it holds no water, so none shows in her open hull or over
her gunwale. Under way:

- **Foam along her hull line**, 0.8 m wide at her true size, most at her bow, whole at 2 m/s.
- **Her wake**: the Kelvin wake's two arms from her quarters, 19.5 degrees either side of her track, laid as foam and
  a crest 0.18 m high at her full way, widening as they spread; inside the V the water is stirred, outside it still.
  It runs a minute of her way aft and fades over it. Her track's wash churns white for 20 s.
- **Her bow wave**: two short, steep arms from her stem, a crest and foam, reaching 1.2 of her lengths aft.
- **Spray** round her bow: a little at way, more the rougher the sea, and a burst with each slam that fades in
  0.8 s.
- **Ripples**: above a wake's way (0.5 m/s) she stirs them at her bow and both quarters each half metre she runs, and
  the field follows her.

Every ship the view draws has these, players', hostile and friendly, the nearest the eye first, up to 48: every ship
of a full sea in view, while each water pixel's walk over them stays within the swell's own cost. All of it is drawn
at her drawn size: from the raised Overworld view, which draws a ship four times her size, her wake is four times as
long and wide, so it matches the ship one sees; close in, everything is true size.

## Read from above

The swell's longest waves hold from the raised view, and its whitecaps say the sea state: as the swell rises past a
moderate sea's, more of its crests standing high in the sea round them break white, in patches, read from far off as
the share of the sea they cover; a rough sea is flecked and a storm's is white-streaked. The wind's chop and the
water's roughness rise with the swell's height there, so a calm sea or a roadstead lies glassy.

## Underwater

With the eye below its water, the land is seen through it. The water swallows red first, so the view turns blue-green
and fades with distance, darker the deeper the eye. The sun's shafts fall through it, traced back to the rippling
surface. Looking up, the sky shows through a window straight above, and beyond the window the surface mirrors the
deep. A diver's camera comes in close rather than sink into the bed.

## Limits

- The breakers and the ripples are drawn in the browser only; the server has the swell alone.
- The page draws the weather's waves of the view's middle everywhere in view, raised or lowered by the shelter grid
  round it (32 cells a side, reaching six times the eye's height, asked again every 2 s); the server judges each point
  by its own.
- A fight takes the swell and the wind where it began, and keeps them. A sea room knows no port, so its fights have
  no roadstead's calm. Clashes among captains alone take the weather where their ships are, each tick.
- The World Editor's sea is a moderate sea's; only its wind is the weather's.
- A wake runs straight back along her heading: a ship turning drags it round with her.
- Spray is drawn on the water round her bow, not thrown into the air.
- The walker has no body yet: the ripples and splashes come from the point the camera follows.
- A fight's ships, drawn by the fight, keep the Sloop's line until the fight says each one's hull.
