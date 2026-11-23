---
type: pick
area: Engine
verdict: Clean
effort: L
status: ported
dfo_paths:
  - src/render/frustum.js
  - src/render/bounds.js
  - src/render/perfMeter.js
  - src/render/gpuTrail.js
  - src/systems/renderScale.js
  - src/render/shadowPass.js
  - src/render/depthPrepass.js
  - src/render/lightClusters.js
  - src/render/staticBatch.js
  - src/systems/frameClock.js
  - src/net/peer/peerBodies.js
  - src/characters/npcBodies.js
  - src/scenes/frameKept.js
dfo_commit: 1c0fd681
---
# Pick - Performance

DFO's frame-time work: culling every kind of draw by its bounds, a GPU timer, a render scale, a static shadow cache with
cadences, a dungeon depth prepass and clustered lights, bodies posed less often far off, builds sliced across frames,
and hot paths that make nothing new each frame. The owner asked for all of it to come over, measured first
([[DFO's Performance Work Comes Over, Measured First]]); this is its approval.

## What comes over

- **Measuring**: GPU time pass by pass on timestamp queries, and a readout behind `?perf` (`perfMeter.js`, `gpuTrail.js`).
- **Render scale**: its tiers, 100, 85, 75, 67 and 50% (`renderScale.js`), and, ours, an Auto that steps between them.
- **Culling**: planes read from the view's matrix, the box's farthest corner tested, spheres against unit planes, one
  bounds an object for every pass (`frustum.js`, `bounds.js`).
- **Shadows**: a map kept while its signature holds, held views with hysteresis, casters too small for a map left
  out (`shadowPass.js`).
- **Dungeons**: a depth prepass, and clustered lights on a 16 x 9 x 24 grid with an overflow fallback
  (`depthPrepass.js`, `lightClusters.js`).
- **Bodies**: posed every frame within 10 m, every 2nd to 25 m, every 3rd beyond, staggered, with a lead for a turning
  camera (`peerBodies.js`, `npcBodies.js`).
- **Builds** sliced across frames, a slice a little time a frame (`staticBatch.js` `finishSliced`, `frameClock.js`);
  hot paths that keep their arrays (`frameKept.js`).

## What stays behind

- Everything keyed by Daggerfall's textures (`archive_record`), the WOODS.WLD heightmap and its far rings, DF's tree
  art and its 819.2-unit map pixels.
- WebGL2's plumbing: programs, vertex arrays and the parallel-compile extension.

## Our version

[[Game]] (the frame, the readout, render scale, the sun's shadows, rooms), [[Interface]] (the Resolution setting),
[[Water]], [[Sailing]], [[Island Drawing]], [[Dungeons]], [[Cities]], [[Nature]] and [[Player]] say what each does. The
shared culling is `client/src/frustum.ts`. Left for later: figures in one instanced draw, the far shadow map's still
casters kept apart from its moving ones, and the water's reflections of lights limited to their reach.
