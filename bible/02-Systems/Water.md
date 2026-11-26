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
  - client/src/water/wakes.ts#WakeTracks
  - crates/land/src/exact.rs#sin_cos
  - client/src/water/shore.ts#shoreField
  - client/src/water/swimming.ts#bodyStep
  - client/src/water/ripples.ts#RippleField
  - client/src/water/waterView.ts#WaterView
  - client/src/water/waterShader.ts#WATER_SHADER
  - client/src/water/surfaceDisc.ts#discDraws
  - client/src/editor/landScene.ts#LandScene
  - client/src/water/hullMask.ts#hullInside
---
# Water

The sea, the lakes and the rivers over the [[Land]], in stylised realism ([[The Water Is Stylised Realism]]). The
World Editor's 3D view draws it, and its walker wades, swims and dives in it. DFO's water was a reference for ideas;
none of its code came over. The sea's weather, swell and wakes are tuned as Claude chose ([[The Sea as Claude Shapes It]]).

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
Sine and cosine are the land crate's own, made from + - * / alone. The land's door hands the browser a moderate sea's
swell with each landmass, and the sea's height at any sampled point; the room module's door (`sea_door.rs`) hands it
the swell under the weather at a point and its height over a grid round the view. The sea's height under the weather
is held to one fingerprint natively and through WebAssembly.

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
- **Light.** The sky ([[Sky]]) and its clouds reflect, more at a glancing angle; the sun glints, its glitter
  blurring far off; a crest glows green where the sun shines through it. Caustics dance on the bed.
- **Shadows.** The surface takes the sun's shadows: in a ship's, beside its waterline, it loses the sun's glints and a
  third of the light it scatters and reflects. The seabed's shadows fade with the water over them, about a seventh left
  three metres down, as the water scatters the light, so a ship's shadow lies on the surface by the ship and not on the
  bed apart from it (the land's shader, `terrainView.ts`).
- **The weather.** The wind's chop runs along the local wind, to the nearest of sixteen bearings, and grows with it:
  near glassy in a calm, steep in a gale. As the wind veers past a bearing, the chop fades over 8 s from the old
  bearing's waves to the new. From a fresh breeze up the wind raises whitecaps in patches that break and fade. Rain roughens the surface and
  dots it near the eye with spreading rings.
- **Blurred reflections.** Waves too small to draw fan each reflected pixel's rays about 0.2 radians at sea in a
  moderate breeze, more in a strong wind, less on calm fresh water. So the reflected clouds lose their fine detail
  and keep their mean cover. Looking down, their shapes still show; near the horizon they smear into a lighter sky.
- **Foam.** Foam is a lace of bubble walls. It covers crests that fold, a breaker's face and the surf behind it, the
  swash's edge and a splash. Each scale of lace gives way to its share as it shrinks toward a pixel.
- **Fresh water.** A lake lies still under a light chop; a river's chop runs downstream at a pace set by its fall.
  Near the camera its edge is the land door's own (how far past fresh water a point lies), so the waterline runs
  along a river's channel or a lake's shore however the samples fall, even where the plain lies level with the river.
  It is drawn 5 cm under its level, so a bank at the level shows dry. Where its level would dip under the sea's, it
  is the sea's.

The disc is 220 rings of 192 segments out to the far plane, each quad's vertices bearing the swell's every wave (up
to 40) and the chop's 12, so a view draws only what it may see of it (`surfaceDisc.ts`). Its rings go in bands of 20,
the farthest first; a band draws one arc of bearings, in sectors of 4 segments, round past the first segment where it
must. A sector is left out when its whole wedge, from the band's inner ring to its outer, stands outside one of the
view's planes by more than the water can move: its height from just under the sea's level to the highest lake's (the
land's 1 km lakes, or the close-up's water), raised by the swell's waves summed at their crests where the sea stands
highest and 5 m more for the breakers and wakes, and carried sideways by the waves' sum and 5 m more. A view holding no
water, as one looking up from inland, draws no surface at all; its sky and haze are drawn whole first, as ever. Near
the eye a band shows in every bearing; out at sea, looking down at the ship, about a quarter of the disc is drawn. A
row of the draw is a ring, so within a band the far rings still draw before the near and a near crest covers a far
one. The water's bind group is made once for the textures it reads and kept until the land, the close-up, the
shelter or the picture's size changes them, one for each of the ripples' three textures.

## In the water

The walker walks on ground and in water under half a metre deep. Deeper, they wade at half pace; from 1.4 m deep they
swim at the surface, eyes riding the waves. Holding `C` dives toward the bed, `Space` rises faster, and left alone a
diver drifts back up. Each stride or stroke pushes the water once; stepping in, diving under and coming up splash.

The pushes are ripples: a damped wave field 32 m square round the walker, stepped 60 times a second on the GPU at a
ripple's own pace. The field follows the walker; its ripples fade at its edge.

A ball falling in the water in a fight pushes the ripples 1.2 m wide where it fell for a round shot (wider for a
heavier ball, and as wide as the ships are drawn, seen from the raised view), under the column of water and patch
of foam the fight throws up there ([[Naval Combat]],
"How it looks"); the water itself draws no foam of its own for it.

## A ship on it

A ship drawn with the land hides the water behind it and is seen through it below its waterline. It rides the swell
through its inertia: each wave answered as a first-order lag answers it, its time constant 0.02 s a metre of its
waterline's length, so a Frigate rides the short waves less than a Sloop ([[Sailing]]). Its bow slams when, pitching
down, the crest at its stem rises over it faster than 1 m/s, and throws spray.

Its footprint is its own hull line at its waterline, read from its mesh where its faces cross it (16 stations, stern
to bow, closer together at its ends, where the line turns fastest; a fair hull until its mesh comes, read once as its
model is opened, for every ship drawn in that hull: at sea, in a fight, moored or in the World Editor), a hair inside
it: it holds no water, so none shows in its open hull or over its gunwale. Between two stations it runs evenly, and a
station is lowered wherever that would stand past the hull, so no cut water shows past a thin stern post or
cutwater. Under way:

- **Foam along its hull line**, 0.8 m wide at its true size, most at its bow, whole at 2 m/s.
- **Its wake**: the Kelvin wake's two arms from its quarters, 19.5 degrees either side of its track, laid as foam and
  a crest 0.18 m high at its full way, widening as they spread; inside the V the water is stirred, outside it still.
  It runs a minute of its way aft and fades over it. Its track's wash churns white for 20 s. Its track is the way it
  sailed: the water keeps where each ship's stern has been, so its wake bends round every turn it made, and runs
  straight aft only on a straight course. A ship at rest, or carried somewhere, not sailed there, begins its track
  again, and one going astern lays none over where it backs.
- **Its bow wave**: two short, steep arms from its stem, a crest and foam, reaching 1.2 of its lengths aft.
- **Spray** round its bow: a little at way, more the rougher the sea, and a burst with each slam that fades in
  0.8 s.
- **Ripples**: above a wake's way (0.5 m/s) it stirs them at its bow and both quarters each half metre it runs, and
  the field follows it.

Every ship the view draws has these, players', hostile and friendly, the nearest the eye first, up to 48: every ship
of a full sea in view, while each water pixel's walk over them stays within the swell's own cost. All of it is drawn
at its drawn size: from the raised Overworld view, which draws a ship four times its size, its wake is four times as
long and wide, so it matches the ship one sees; close in, everything is true size.

## Read from above

The swell's longest waves hold from the raised view, and its whitecaps say the sea state: as the swell rises past a
moderate sea's, more of its crests standing high in the sea round them break white, in patches, read from far off as
the share of the sea they cover; a rough sea is flecked and a storm's is white-streaked. The wind's chop is calmed
where the sea is sheltered, so a roadstead lies glassy, and its slope holds at 1.4 times a moderate breeze's: steeper,
a storm's glints alias into blocks.

## Underwater

With the eye below its water, the land is seen through it. The water swallows red first, so the view turns blue-green
and fades with distance, darker the deeper the eye. The sun's shafts fall through it, traced back to the rippling
surface. Looking up, the sky shows through a window straight above, and beyond the window the surface mirrors the
deep. A diver's camera comes in close rather than sink into the bed.

## Limits

- The breakers and the ripples are drawn in the browser only; the server has the swell alone.
- The page draws the weather's waves of the view's middle everywhere in view, raised or lowered by the shelter grid
  round it (16 cells a side, reaching six times the eye's height, asked again every 2 s); the server judges each point
  by its own.
- A fight takes the swell and the wind where it began, and keeps them, calm by a port city's roadstead as the sea
  is; a fight among captains alone keeps its start's weather too.
- The World Editor's sea is a moderate sea's; only its wind is the weather's.
- A wake runs straight back along the ship's heading: a ship turning drags it round with it.
- Spray is drawn on the water round its bow, not thrown into the air.
- The walker has no body yet: the ripples and splashes come from the point the camera follows.
- A fight's ships, drawn by the fight, keep the Sloop's line until the fight says each one's hull.
