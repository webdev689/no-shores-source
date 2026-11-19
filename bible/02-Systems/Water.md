---
type: system
status: live
code:
  - crates/land/src/sea.rs#Swell
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
the server and in every browser ([[Agree to the Bit]]). The swell is ten Gerstner waves about one prevailing wind,
from a fixed seed and world time: about 140 m long down to about 5 m, each as steep as a moderate sea's, two to three
metres from trough to crest. The shorter a wave, the further it strays from the wind. Their crests sharpen together, never
folding over.

The swell feels the bottom: it is whole where the sea is 15 m deep and gone at 1 m, where the breakers take over. The
sea's height at a point is found by following the water back to where it rests, as a wave carries water sideways.
Sine and cosine are the land crate's own, made from + - * / alone. The door hands the browser the swell's waves with
each landmass, and the sea's height at any sampled point. Both builds are held to one fingerprint.

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

## In the water

The walker walks on ground and in water under half a metre deep. Deeper, they wade at half pace; from 1.4 m deep they
swim at the surface, eyes riding the waves. Holding `C` dives toward the bed, `Space` rises faster, and left alone a
diver drifts back up. Each stride or stroke pushes the water once; stepping in, diving under and coming up splash.

The pushes are ripples: a damped wave field 32 m square round the walker, stepped 60 times a second on the GPU at a
ripple's own pace. The field follows the walker; its ripples fade at its edge.

## A ship on it

A ship drawn with the land hides the water behind her and is seen through it below her waterline. Her footprint (an
ellipse a hair inside her waterline) holds no water, so none shows in her open hull or over her gunwale. A band of
foam rings her footprint once she makes way, most at her bow, whole at 2 m/s. Above a wake's way (0.5 m/s) she stirs
the ripples at her bow and both quarters each half metre she runs, and the field follows her ([[Sailing]]).

## Underwater

With the eye below its water, the land is seen through it. The water swallows red first, so the view turns blue-green
and fades with distance, darker the deeper the eye. The sun's shafts fall through it, traced back to the rippling
surface. Looking up, the sky shows through a window straight above, and beyond the window the surface mirrors the
deep. A diver's camera comes in close rather than sink into the bed.

## Limits

- The breakers and the ripples are drawn in the browser only; the server has the swell alone.
- One swell for the whole world, until the weather drives it ([[World Map]]).
- The walker has no body yet: the ripples and splashes come from the point the camera follows.
- Eight ships' footprints at a time, the player's and the nearest her, each an ellipse, not her hull's own line.
